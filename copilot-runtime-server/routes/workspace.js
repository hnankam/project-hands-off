/**
 * Workspace routes for personal resources management
 * Handles files, notes, and API connections (OAuth)
 */

import express from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { getPool } from '../config/database.js';
import { encryptCredential, decryptCredential, encryptOAuthTokens, decryptOAuthTokens } from '../utils/encryption.js';
import { fetchGmailEmails, fetchGmailMessage, fetchGmailThread, convertToTextFormat as gmailToText, convertThreadToTextFormat as gmailThreadToText } from '../utils/gmail-client.js';
import { fetchRecentSlackMessages, fetchSlackConversations, fetchSlackMessages, fetchSlackThreadReplies, downloadSlackFile, convertToTextFormat as slackToText, convertThreadToTextFormat as slackThreadToText, getMessageFilename, getThreadFilename } from '../utils/slack-client.js';
import { refreshGoogleToken, refreshSlackToken, shouldRefreshToken, calculateExpiryTimestamp } from '../utils/oauth-refresh.js';

const router = express.Router();

// Configure express.json() to be skipped for file download endpoints
// This prevents JSON parsing from corrupting binary data
router.use((req, res, next) => {
  // Skip JSON parsing for binary file download endpoints
  if (req.path.includes('/file/download')) {
    return next();
  }
  // Apply JSON parsing to all other routes
  express.json({ limit: '50mb' })(req, res, next);
});

// Configure multer for file uploads (in-memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allowed file types
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'text/plain', 'text/markdown', 'text/csv',
      'application/json',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not supported`));
    }
  }
});

// ============================================================================
// FOLDERS ENDPOINTS
// ============================================================================

/**
 * List user's folders with file counts
 * GET /api/workspace/folders
 */
router.get('/folders', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const pool = getPool();
    
    // Get distinct folders with file counts (excluding .folder placeholders from count)
    const { rows } = await pool.query(
      `SELECT 
        folder as path,
        folder as name,
        COUNT(CASE WHEN file_name != '.folder' THEN 1 END) as file_count
       FROM workspace_files
       WHERE user_id = $1 AND folder IS NOT NULL AND folder != '' AND folder != 'root'
       GROUP BY folder
       ORDER BY folder`,
      [userId]
    );
    
    // Calculate subfolder counts for each folder
    const folders = rows.map(row => {
      // Count direct subfolders (folders that start with this path + /)
      const subfolder_count = rows.filter(f => {
        if (f.path === row.path) return false;
        if (!f.path.startsWith(row.path + '/')) return false;
        // Only count direct children (not nested subfolders)
        const relativePath = f.path.substring(row.path.length + 1);
        return !relativePath.includes('/');
      }).length;
      
      return {
        name: row.path.includes('/') ? row.path.split('/').pop() : row.path,
        path: row.path,
        file_count: parseInt(row.file_count),
        subfolder_count: subfolder_count
      };
    });
    
    // Prevent caching to ensure fresh data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.json({ folders });
  } catch (error) {
    console.error('[Workspace] Error listing folders:', error);
    res.status(500).json({ error: 'Failed to list folders' });
  }
});

/**
 * Create a new folder
 * POST /api/workspace/folders
 * Body: { folder_name: string }
 * Creates a hidden .folder placeholder file to make the folder visible
 */
router.post('/folders', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { folder_name } = req.body;
    
    if (!folder_name || !folder_name.trim()) {
      return res.status(400).json({ error: 'folder_name is required' });
    }
    
    const normalized = folder_name.trim();
    
    // Basic validation
    if (normalized.includes('//') || normalized.startsWith('/') || normalized.endsWith('/')) {
      return res.status(400).json({ error: 'Invalid folder name format' });
    }
    
    const pool = getPool();
    
    // Check if folder already exists
    const { rows: existingFiles } = await pool.query(
      'SELECT COUNT(*) as count FROM workspace_files WHERE user_id = $1 AND folder = $2',
      [userId, normalized]
    );
    
    if (existingFiles[0].count > 0) {
      // Folder already exists
      return res.status(200).json({ 
        success: true,
        folder: {
          name: normalized.includes('/') ? normalized.split('/').pop() : normalized,
          path: normalized,
          file_count: parseInt(existingFiles[0].count),
          exists: true
        }
      });
    }
    
    // Create hidden placeholder file to make folder visible
    const { rows } = await pool.query(
      `INSERT INTO workspace_files 
       (user_id, file_name, file_type, file_size, storage_url, extracted_text, folder, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, folder, created_at`,
      [
        userId,
        '.folder',
        'application/x-folder-placeholder',
        0,
        '',
        '',
        normalized,
        'Placeholder file to maintain empty folder structure'
      ]
    );
    
    res.status(201).json({ 
      success: true,
      folder: {
        name: normalized.includes('/') ? normalized.split('/').pop() : normalized,
        path: normalized,
        file_count: 0,
        created_at: rows[0].created_at
      }
    });
  } catch (error) {
    console.error('[Workspace] Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder: ' + error.message });
  }
});

/**
 * Delete a folder and optionally its contents
 * DELETE /api/workspace/folders/:folderPath
 * Query: deleteFiles=true/false (default: false - moves files to root)
 */
router.delete('/folders/:folderPath(*)', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const folderPath = req.params.folderPath;
    const deleteFiles = req.query.deleteFiles === 'true';
    
    if (!folderPath) {
      return res.status(400).json({ error: 'Folder path is required' });
    }
    
    const pool = getPool();
    
    // Get files in this folder and subfolders
    const { rows: filesInFolder } = await pool.query(
      `SELECT id, folder, storage_url, file_name FROM workspace_files 
       WHERE user_id = $1 AND (folder = $2 OR folder LIKE $3)`,
      [userId, folderPath, `${folderPath}/%`]
    );
    
    if (filesInFolder.length === 0) {
      // Folder is already empty
      return res.json({ 
        success: true, 
        message: 'Folder deleted (was empty)',
        filesDeleted: 0,
        filesMoved: 0
      });
    }
    
    // Separate placeholder files from real files (trim whitespace and check file type too)
    const placeholderFiles = filesInFolder.filter(f => 
      f.file_name && f.file_name.trim() === '.folder'
    );
    const realFiles = filesInFolder.filter(f => 
      !f.file_name || f.file_name.trim() !== '.folder'
    );
    
    // Always delete placeholder files - delete directly by folder and file_name to be extra sure
    await pool.query(
      `DELETE FROM workspace_files 
       WHERE user_id = $1 AND folder = $2 AND file_name = '.folder'`,
      [userId, folderPath]
    );
    
    // Also delete by IDs if we found any placeholders
    if (placeholderFiles.length > 0) {
      const placeholderIds = placeholderFiles.map(f => f.id);
      await pool.query(
        'DELETE FROM workspace_files WHERE id = ANY($1) AND user_id = $2',
        [placeholderIds, userId]
      );
    }
    
    // If only placeholders existed, we're done
    if (realFiles.length === 0) {
      return res.json({ 
        success: true, 
        message: 'Folder deleted',
        filesDeleted: 0,
        filesMoved: 0
      });
    }
    
    if (deleteFiles) {
      // Delete all real files in folder
      const fileIds = realFiles.map(f => f.id);
      
      await pool.query(
        'DELETE FROM workspace_files WHERE id = ANY($1) AND user_id = $2',
        [fileIds, userId]
      );
      
      // Delete from Firebase Storage (best effort)
      const FIREBASE_STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET;
      if (FIREBASE_STORAGE_BUCKET) {
        for (const file of realFiles) {
          try {
            const storageUrl = file.storage_url;
            const pathMatch = storageUrl.match(/\/o\/([^?]+)/);
            if (pathMatch) {
              const encodedPath = pathMatch[1];
              const deleteUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encodedPath}`;
              await fetch(deleteUrl, { method: 'DELETE' });
            }
          } catch (storageError) {
            console.warn(`[Workspace] Error deleting file from Firebase:`, storageError);
          }
        }
      }
      
      res.json({ 
        success: true, 
        message: `Deleted folder and ${realFiles.length} file(s)`,
        filesDeleted: realFiles.length,
        filesMoved: 0
      });
    } else {
      // Move real files to root (set folder to null)
      const fileIds = realFiles.map(f => f.id);
      await pool.query(
        `UPDATE workspace_files 
         SET folder = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1) AND user_id = $2`,
        [fileIds, userId]
      );
      
      res.json({ 
        success: true, 
        message: `Deleted folder, moved ${realFiles.length} file(s) to root`,
        filesDeleted: 0,
        filesMoved: realFiles.length
      });
    }
  } catch (error) {
    console.error('[Workspace] Error deleting folder:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

/**
 * Bulk delete folders
 * DELETE /api/workspace/folders/bulk
 * Body: { folderPaths: string[], deleteFiles: boolean }
 */
router.delete('/folders/bulk', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { folderPaths, deleteFiles = false } = req.body;
    
    if (!Array.isArray(folderPaths) || folderPaths.length === 0) {
      return res.status(400).json({ error: 'folderPaths must be a non-empty array' });
    }
    
    const pool = getPool();
    let totalFilesDeleted = 0;
    let totalFilesMoved = 0;
    
    for (const folderPath of folderPaths) {
      // Get files in this folder and subfolders
      const { rows: filesInFolder } = await pool.query(
        `SELECT id, storage_url, file_name FROM workspace_files 
         WHERE user_id = $1 AND (folder = $2 OR folder LIKE $3)`,
        [userId, folderPath, `${folderPath}/%`]
      );
      
      if (filesInFolder.length === 0) continue;
      
      // Separate placeholder files from real files (trim whitespace)
      const placeholderFiles = filesInFolder.filter(f => 
        f.file_name && f.file_name.trim() === '.folder'
      );
      const realFiles = filesInFolder.filter(f => 
        !f.file_name || f.file_name.trim() !== '.folder'
      );
      
      // Always delete placeholder files - delete directly by folder and file_name
      await pool.query(
        `DELETE FROM workspace_files 
         WHERE user_id = $1 AND folder = $2 AND file_name = '.folder'`,
        [userId, folderPath]
      );
      
      // Also delete by IDs if we found any placeholders
      if (placeholderFiles.length > 0) {
        const placeholderIds = placeholderFiles.map(f => f.id);
        await pool.query(
          'DELETE FROM workspace_files WHERE id = ANY($1) AND user_id = $2',
          [placeholderIds, userId]
        );
      }
      
      // Skip if no real files
      if (realFiles.length === 0) continue;
      
      if (deleteFiles) {
        // Delete all real files
        const fileIds = realFiles.map(f => f.id);
        await pool.query(
          'DELETE FROM workspace_files WHERE id = ANY($1) AND user_id = $2',
          [fileIds, userId]
        );
        totalFilesDeleted += realFiles.length;
        
        // Delete from Firebase Storage (best effort)
        const FIREBASE_STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET;
        if (FIREBASE_STORAGE_BUCKET) {
          for (const file of realFiles) {
            try {
              const storageUrl = file.storage_url;
              const pathMatch = storageUrl.match(/\/o\/([^?]+)/);
              if (pathMatch) {
                const encodedPath = pathMatch[1];
                const deleteUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encodedPath}`;
                await fetch(deleteUrl, { method: 'DELETE' });
              }
            } catch (storageError) {
              console.warn(`[Workspace] Error deleting file from Firebase:`, storageError);
            }
          }
        }
      } else {
        // Move real files to root
        const fileIds = realFiles.map(f => f.id);
        await pool.query(
          `UPDATE workspace_files 
           SET folder = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = ANY($1) AND user_id = $2`,
          [fileIds, userId]
        );
        totalFilesMoved += realFiles.length;
      }
    }
    
    res.json({ 
      success: true,
      message: `Deleted ${folderPaths.length} folder(s)`,
      foldersDeleted: folderPaths.length,
      filesDeleted: totalFilesDeleted,
      filesMoved: totalFilesMoved
    });
  } catch (error) {
    console.error('[Workspace] Error bulk deleting folders:', error);
    res.status(500).json({ error: 'Failed to bulk delete folders' });
  }
});

// ============================================================================
// FILES ENDPOINTS
// ============================================================================

/**
 * List user's workspace files
 * GET /api/workspace/files?folder=root&tags=important&limit=50&offset=0
 */
router.get('/files', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { folder, tags, limit = 1000, offset = 0 } = req.query; // Increased default limit to 1000
    
    const pool = getPool();
    let query = "SELECT * FROM workspace_files WHERE user_id = $1 AND file_name != '.folder'";
    const params = [userId];
    let paramIndex = 2;
    
    if (folder) {
      query += ` AND folder = $${paramIndex}`;
      params.push(folder);
      paramIndex++;
    }
    
    if (tags) {
      query += ` AND tags && $${paramIndex}`;
      params.push(tags.split(','));
      paramIndex++;
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const { rows } = await pool.query(query, params);
    
    res.json({ files: rows });
  } catch (error) {
    console.error('[Workspace] Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

/**
 * Upload file to workspace
 * POST /api/workspace/files/upload
 * Content-Type: multipart/form-data
 * Body: file (required), folder (optional), tags (optional), description (optional)
 */
router.post('/files/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { folder = 'root', tags = '', description = '' } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    
    // Upload to Firebase Storage using REST API
    const FIREBASE_STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET;
    const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
    
    if (!FIREBASE_STORAGE_BUCKET || !FIREBASE_API_KEY) {
      return res.status(500).json({ error: 'Firebase Storage not configured' });
    }
    
    const storagePath = `workspace/${userId}/${Date.now()}-${req.file.originalname}`;
    const encodedPath = encodeURIComponent(storagePath);
    
    // Upload file using Firebase Storage REST API
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o?uploadType=media&name=${encodedPath}`;
    
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': req.file.mimetype,
      },
      body: req.file.buffer,
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('[Workspace] Firebase upload failed:', errorText);
      return res.status(500).json({ error: 'Failed to upload to Firebase Storage' });
    }
    
    // Construct public download URL
    const storageUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encodedPath}?alt=media`;
    
    // Extract text content if applicable
    let extractedText = null;
    let pageCount = null;
    
    if (req.file.mimetype.startsWith('text/')) {
      extractedText = req.file.buffer.toString('utf-8');
      pageCount = 1;
    } else if (req.file.mimetype === 'application/pdf' || 
               req.file.mimetype.includes('document')) {
      // Text extraction would go here (pdf-parse, mammoth, etc.)
      // For now, skip to avoid blocking on dependencies
      console.log('[Workspace] Text extraction not yet implemented for', req.file.mimetype);
    }
    
    // Store in database
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO workspace_files 
       (user_id, file_name, file_type, file_size, storage_url, extracted_text, page_count, folder, tags, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        userId,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        storageUrl,
        extractedText,
        pageCount,
        folder,
        tags ? tags.split(',').map(t => t.trim()) : [],
        description
      ]
    );
    
    res.json({ file: rows[0] });
  } catch (error) {
    console.error('[Workspace] Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file: ' + error.message });
  }
});

/**
 * Register an already-uploaded file to workspace
 * POST /api/workspace/files/register
 * Body: { file_name, file_type, file_size, storage_url, extracted_text?, folder?, tags?, description? }
 * 
 * This endpoint is used to register files that were uploaded elsewhere (e.g., chat)
 * so they appear in the unified workspace view.
 */
router.post('/files/register', requireAuth, express.json(), async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { 
      file_name, 
      file_type, 
      file_size, 
      storage_url, 
      extracted_text = null,
      page_count = null,
      folder = 'chat-uploads', 
      tags = [], 
      description = '' 
    } = req.body;
    
    if (!file_name || !file_type || !file_size || !storage_url) {
      return res.status(400).json({ error: 'Missing required fields: file_name, file_type, file_size, storage_url' });
    }
    
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO workspace_files 
       (user_id, file_name, file_type, file_size, storage_url, extracted_text, page_count, folder, tags, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        userId,
        file_name,
        file_type,
        parseInt(file_size),
        storage_url,
        extracted_text,
        page_count,
        folder,
        Array.isArray(tags) ? tags : (tags ? tags.split(',').map(t => t.trim()) : []),
        description
      ]
    );
    
    res.json({ file: rows[0] });
  } catch (error) {
    console.error('[Workspace] Error registering file:', error);
    res.status(500).json({ error: 'Failed to register file: ' + error.message });
  }
});

/**
 * Update file metadata (rename)
 * PUT /api/workspace/files/:fileId
 * Body: { file_name: string }
 */
router.put('/files/:fileId', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { fileId } = req.params;
    const { file_name } = req.body;
    
    if (!file_name || !file_name.trim()) {
      return res.status(400).json({ error: 'file_name is required' });
    }
    
    const pool = getPool();
    
    // Update the file name
    const { rows, rowCount } = await pool.query(
      'UPDATE workspace_files SET file_name = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
      [file_name.trim(), fileId, userId]
    );
    
    if (rowCount === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.json({ file: rows[0] });
  } catch (error) {
    console.error('[Workspace] Error updating file:', error);
    res.status(500).json({ error: 'Failed to update file' });
  }
});

/**
 * Get file content (extracted text or fetch from storage)
 * GET /api/workspace/files/:fileId/content
 * Note: This route must come BEFORE /files/:fileId to avoid route conflicts
 */
router.get('/files/:fileId/content', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { fileId } = req.params;
    
    const pool = getPool();
    
    // Get file info
    const { rows } = await pool.query(
      'SELECT file_name, file_type, file_size, storage_url, extracted_text FROM workspace_files WHERE id = $1 AND user_id = $2',
      [fileId, userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const file = rows[0];
    let content = file.extracted_text || '';
    
    // If no extracted text, try to fetch from storage for text-based files
    if (!content) {
      const fileType = file.file_type.toLowerCase();
      const textBasedTypes = [
        'text/', 'application/json', 'application/xml', 'application/yaml',
        'application/x-yaml', 'application/javascript', 'application/typescript',
        'application/x-sh', 'application/x-python', 'application/sql',
        'text/markdown', 'text/plain', 'text/csv', 'text/html', 'text/css',
      ];
      
      const isTextFile = textBasedTypes.some(t => fileType.startsWith(t) || fileType.includes(t));
      
      if (isTextFile && file.storage_url) {
        try {
          const fetchResponse = await fetch(file.storage_url);
          if (fetchResponse.ok) {
            content = await fetchResponse.text();
          }
        } catch (fetchError) {
          console.warn(`[Workspace] Failed to fetch content from storage for file ${fileId}:`, fetchError);
        }
      }
    }
    
    res.json({ 
      content,
      file_name: file.file_name,
      file_type: file.file_type,
      file_size: file.file_size,
    });
  } catch (error) {
    console.error('[Workspace] Error getting file content:', error);
    res.status(500).json({ error: 'Failed to get file content' });
  }
});

/**
 * Bulk delete files from workspace
 * DELETE /api/workspace/files/bulk
 * Body: { fileIds: string[] }
 * IMPORTANT: This route must come BEFORE /files/:fileId to avoid matching "bulk" as fileId
 */
router.delete('/files/bulk', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { fileIds } = req.body;
    
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ error: 'fileIds must be a non-empty array' });
    }
    
    const pool = getPool();
    
    // Get file info for cleanup
    const { rows: fileRows } = await pool.query(
      'SELECT id, storage_url FROM workspace_files WHERE id = ANY($1) AND user_id = $2',
      [fileIds, userId]
    );
    
    if (fileRows.length === 0) {
      return res.status(404).json({ error: 'No files found' });
    }
    
    // Delete from database
    const { rowCount } = await pool.query(
      'DELETE FROM workspace_files WHERE id = ANY($1) AND user_id = $2',
      [fileIds, userId]
    );
    
    // Delete from Firebase Storage using REST API (best effort)
    const FIREBASE_STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET;
    if (FIREBASE_STORAGE_BUCKET) {
      for (const file of fileRows) {
        try {
          const storageUrl = file.storage_url;
          const pathMatch = storageUrl.match(/\/o\/([^?]+)/);
          if (pathMatch) {
            const encodedPath = pathMatch[1];
            const deleteUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encodedPath}`;
            
            const deleteResponse = await fetch(deleteUrl, {
              method: 'DELETE',
            });
            
            if (!deleteResponse.ok) {
              console.warn(`[Workspace] Failed to delete file ${file.id} from Firebase Storage:`, deleteResponse.statusText);
            }
          }
        } catch (storageError) {
          console.warn(`[Workspace] Error deleting file ${file.id} from Firebase Storage:`, storageError);
          // Continue even if Firebase deletion fails
        }
      }
    }
    
    res.json({ 
      message: `Successfully deleted ${rowCount} file(s)`,
      deletedCount: rowCount
    });
  } catch (error) {
    console.error('[Workspace] Error bulk deleting files:', error);
    res.status(500).json({ error: 'Failed to bulk delete files: ' + error.message });
  }
});

/**
 * Delete file from workspace
 * DELETE /api/workspace/files/:fileId
 * Note: This route must come AFTER /files/bulk to avoid route conflicts
 */
router.delete('/files/:fileId', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { fileId } = req.params;
    
    const pool = getPool();
    
    // Get file info first for cleanup
    const { rows: fileRows } = await pool.query(
      'SELECT storage_url FROM workspace_files WHERE id = $1 AND user_id = $2',
      [fileId, userId]
    );
    
    if (fileRows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Delete from database
    await pool.query(
      'DELETE FROM workspace_files WHERE id = $1 AND user_id = $2',
      [fileId, userId]
    );
    
    // Delete from Firebase Storage using REST API
    try {
      const FIREBASE_STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET;
      const storageUrl = fileRows[0].storage_url;
      
      // Extract path from URL (format: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media)
      const pathMatch = storageUrl.match(/\/o\/([^?]+)/);
      if (pathMatch && FIREBASE_STORAGE_BUCKET) {
        const encodedPath = pathMatch[1];
        const deleteUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encodedPath}`;
        
        const deleteResponse = await fetch(deleteUrl, {
          method: 'DELETE',
        });
        
        if (!deleteResponse.ok) {
          console.warn('[Workspace] Failed to delete file from Firebase Storage:', deleteResponse.statusText);
        }
      }
    } catch (deleteError) {
      console.warn('[Workspace] Error deleting from Firebase Storage:', deleteError);
      // Continue anyway - database record is already deleted
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Workspace] Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// ============================================================================
// NOTES ENDPOINTS
// ============================================================================

/**
 * List user's notes
 * GET /api/workspace/notes?folder=root&tags=important&limit=50&offset=0
 */
router.get('/notes', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { folder, tags, limit = 50, offset = 0 } = req.query;
    
    const pool = getPool();
    let query = 'SELECT id, title, folder, tags, created_at, updated_at, LEFT(content, 200) as preview FROM workspace_notes WHERE user_id = $1';
    const params = [userId];
    let paramIndex = 2;
    
    if (folder) {
      query += ` AND folder = $${paramIndex}`;
      params.push(folder);
      paramIndex++;
    }
    
    if (tags) {
      query += ` AND tags && $${paramIndex}`;
      params.push(tags.split(','));
      paramIndex++;
    }
    
    query += ` ORDER BY updated_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const { rows } = await pool.query(query, params);
    
    res.json({ notes: rows });
  } catch (error) {
    console.error('[Workspace] Error listing notes:', error);
    res.status(500).json({ error: 'Failed to list notes' });
  }
});

/**
 * Get single note with full content
 * GET /api/workspace/notes/:noteId
 */
router.get('/notes/:noteId', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { noteId } = req.params;
    
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT * FROM workspace_notes WHERE id = $1 AND user_id = $2',
      [noteId, userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    res.json({ note: rows[0] });
  } catch (error) {
    console.error('[Workspace] Error getting note:', error);
    res.status(500).json({ error: 'Failed to get note' });
  }
});

/**
 * Create note
 * POST /api/workspace/notes
 * Body: { title, content, folder?, tags? }
 */
router.post('/notes', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { title, content, folder = 'root', tags = [] } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content required' });
    }
    
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO workspace_notes (user_id, title, content, folder, tags)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, title, content, folder, tags]
    );
    
    res.json({ note: rows[0] });
  } catch (error) {
    console.error('[Workspace] Error creating note:', error);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

/**
 * Update note
 * PUT /api/workspace/notes/:noteId
 * Body: { title?, content?, folder?, tags? }
 */
router.put('/notes/:noteId', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { noteId } = req.params;
    const { title, content, folder, tags } = req.body;
    
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE workspace_notes 
       SET title = COALESCE($1, title),
           content = COALESCE($2, content),
           folder = COALESCE($3, folder),
           tags = COALESCE($4, tags),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [title, content, folder, tags, noteId, userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    res.json({ note: rows[0] });
  } catch (error) {
    console.error('[Workspace] Error updating note:', error);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

/**
 * Delete note
 * DELETE /api/workspace/notes/:noteId
 */
router.delete('/notes/:noteId', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { noteId } = req.params;
    
    const pool = getPool();
    const { rowCount } = await pool.query(
      'DELETE FROM workspace_notes WHERE id = $1 AND user_id = $2',
      [noteId, userId]
    );
    
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Workspace] Error deleting note:', error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

/**
 * Bulk delete notes from workspace
 * DELETE /api/workspace/notes/bulk
 * Body: { noteIds: string[] }
 */
router.delete('/notes/bulk', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { noteIds } = req.body;
    
    if (!Array.isArray(noteIds) || noteIds.length === 0) {
      return res.status(400).json({ error: 'noteIds must be a non-empty array' });
    }
    
    const pool = getPool();
    
    // Delete from database
    const { rowCount } = await pool.query(
      'DELETE FROM workspace_notes WHERE id = ANY($1) AND user_id = $2',
      [noteIds, userId]
    );
    
    if (rowCount === 0) {
      return res.status(404).json({ error: 'No notes found' });
    }
    
    res.json({ 
      message: `Successfully deleted ${rowCount} note(s)`,
      deletedCount: rowCount
    });
  } catch (error) {
    console.error('[Workspace] Error bulk deleting notes:', error);
    res.status(500).json({ error: 'Failed to bulk delete notes: ' + error.message });
  }
});

/**
 * Fetch multiple notes with full content (bulk)
 * POST /api/workspace/notes/bulk
 * Body: { ids: string[] }
 */
router.post('/notes/bulk', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.json({ notes: [] });
    }
    
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT 
        id, 
        title, 
        content, 
        LEFT(content, 200) as preview,
        folder, 
        tags, 
        created_at, 
        updated_at
       FROM workspace_notes
       WHERE user_id = $1 AND id = ANY($2::uuid[])
       ORDER BY updated_at DESC`,
      [userId, ids]
    );
    
    res.json({ notes: rows });
  } catch (error) {
    console.error('[Workspace] Error fetching notes bulk:', error);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// ============================================================================
// CONNECTIONS ENDPOINTS (OAuth & API Keys)
// ============================================================================

/**
 * List user's connections
 * GET /api/workspace/connections
 */
router.get('/connections', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, connection_name, connection_type, service_name,
              status, token_expires_at, scopes, last_used_at,
              last_sync_at, description, created_at, updated_at
       FROM workspace_connections
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    
    res.json({ connections: rows });
  } catch (error) {
    console.error('[Workspace] Error listing connections:', error);
    res.status(500).json({ error: 'Failed to list connections' });
  }
});

/**
 * Delete connection
 * DELETE /api/workspace/connections/:connectionId
 */
router.delete('/connections/:connectionId', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { connectionId } = req.params;
    
    const pool = getPool();
    const { rowCount } = await pool.query(
      'DELETE FROM workspace_connections WHERE id = $1 AND user_id = $2',
      [connectionId, userId]
    );
    
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Workspace] Error deleting connection:', error);
    res.status(500).json({ error: 'Failed to delete connection' });
  }
});

// ============================================================================
// SUMMARY ENDPOINT (for context)
// ============================================================================

/**
 * Get workspace summary for context
 * GET /api/workspace/summary
 */
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const pool = getPool();
    
    // Get counts and recent items
    const { rows: stats } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM workspace_files WHERE user_id = $1) as file_count,
        (SELECT COUNT(*) FROM workspace_notes WHERE user_id = $1) as note_count,
        (SELECT COUNT(*) FROM workspace_connections WHERE user_id = $1 AND status = 'active') as connection_count,
        (SELECT COUNT(*) FROM workspace_credentials WHERE user_id = $1) as credential_count,
        (SELECT COALESCE(SUM(file_size), 0) FROM workspace_files WHERE user_id = $1) as total_size
    `, [userId]);
    
    const { rows: recentFiles } = await pool.query(
      `SELECT id, file_name, file_type, file_size, folder, tags, created_at
       FROM workspace_files
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );
    
    const { rows: recentNotes } = await pool.query(
      `SELECT id, title, folder, tags, created_at, updated_at
       FROM workspace_notes
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT 10`,
      [userId]
    );
    
    const { rows: activeConnections } = await pool.query(
      `SELECT id, connection_name, service_name, connection_type,
              status, last_used_at, created_at
       FROM workspace_connections
       WHERE user_id = $1 AND status = 'active'
       ORDER BY last_used_at DESC NULLS LAST
       LIMIT 5`,
      [userId]
    );
    
    res.json({
      stats: stats[0],
      recent_files: recentFiles,
      recent_notes: recentNotes,
      active_connections: activeConnections
    });
  } catch (error) {
    console.error('[Workspace] Error getting workspace summary:', error);
    res.status(500).json({ error: 'Failed to get workspace summary' });
  }
});

// ============================================================================
// CREDENTIALS ENDPOINTS
// ============================================================================

/**
 * List user's credentials
 * GET /api/workspace/credentials
 */
router.get('/credentials', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const pool = getPool();
    
    const { rows } = await pool.query(
      `SELECT id, name, type, key, created_at, updated_at
       FROM workspace_credentials
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId]
    );
    
    res.json({ credentials: rows });
  } catch (error) {
    console.error('[Workspace] Error listing credentials:', error);
    res.status(500).json({ error: 'Failed to list credentials' });
  }
});

/**
 * Create a new credential
 * POST /api/workspace/credentials
 */
router.post('/credentials', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { name, type, key, password } = req.body;
    
    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }
    
    // Encrypt the password/secret
    let encryptedDataHex = null;
    if (password) {
      const { encrypted } = encryptCredential(password, userId);
      encryptedDataHex = encrypted.toString('hex');
    }
    
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO workspace_credentials (user_id, name, type, key, encrypted_data)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, type, key, created_at, updated_at`,
      [userId, name, type, key || null, encryptedDataHex]
    );
    
    res.status(201).json({ credential: rows[0] });
  } catch (error) {
    console.error('[Workspace] Error creating credential:', error);
    res.status(500).json({ error: 'Failed to create credential' });
  }
});

/**
 * Update a credential
 * PUT /api/workspace/credentials/:id
 */
router.put('/credentials/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { id } = req.params;
    const { name, type, key, password } = req.body;
    
    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }
    
    const pool = getPool();
    
    // Check ownership
    const { rows: existing } = await pool.query(
      'SELECT id FROM workspace_credentials WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Credential not found' });
    }
    
    // Build update query
    let query = `UPDATE workspace_credentials SET name = $1, type = $2, key = $3`;
    const params = [name, type, key || null];
    
    // Only update password if provided
    if (password) {
      const { encrypted } = encryptCredential(password, userId);
      const encryptedDataHex = encrypted.toString('hex');
      query += `, encrypted_data = $${params.length + 1}`;
      params.push(encryptedDataHex);
    }
    
    query += ` WHERE id = $${params.length + 1} AND user_id = $${params.length + 2}
               RETURNING id, name, type, key, created_at, updated_at`;
    params.push(id, userId);
    
    const { rows } = await pool.query(query, params);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Credential not found' });
    }
    
    res.json({ credential: rows[0] });
  } catch (error) {
    console.error('[Workspace] Error updating credential:', error);
    res.status(500).json({ error: 'Failed to update credential' });
  }
});

/**
 * Delete a credential
 * DELETE /api/workspace/credentials/:id
 */
router.delete('/credentials/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { id } = req.params;
    
    const pool = getPool();
    const { rows } = await pool.query(
      'DELETE FROM workspace_credentials WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Credential not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Workspace] Error deleting credential:', error);
    res.status(500).json({ error: 'Failed to delete credential' });
  }
});

/**
 * Fetch multiple credentials with secrets (bulk)
 * POST /api/workspace/credentials/bulk
 * Body: { ids: string[] }
 */
router.post('/credentials/bulk', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.json({ credentials: [] });
    }
    
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, name, type, key, encrypted_data, created_at, updated_at
       FROM workspace_credentials
       WHERE user_id = $1 AND id = ANY($2::uuid[])
       ORDER BY updated_at DESC`,
      [userId, ids]
    );
    
    // Decrypt the encrypted_data field for each credential
    const credentials = rows.map(row => {
      const { encrypted_data, ...rest } = row;
      let password = null;
      
      if (encrypted_data) {
        try {
          // Convert hex string back to Buffer
          const encryptedBuffer = Buffer.from(encrypted_data, 'hex');
          password = decryptCredential(encryptedBuffer, userId);
        } catch (decryptError) {
          console.error('[Workspace] Failed to decrypt credential:', rest.id, decryptError.message);
          // Continue with null password rather than failing the entire request
        }
      }
      
      return {
        ...rest,
        password,
      };
    });
    
    res.json({ credentials });
  } catch (error) {
    console.error('[Workspace] Error fetching credentials bulk:', error);
    res.status(500).json({ error: 'Failed to fetch credentials' });
  }
});

/**
 * Debug endpoint to list all credentials with decryption attempts
 * GET /api/workspace/credentials/debug/all
 * Note: Unauthenticated for debugging purposes only - remove in production
 */
router.get('/credentials/debug/all', async (req, res) => {
  try {
    // Get userId from query param for debugging
    const userId = req.query.userId;
    
    if (!userId) {
      return res.status(400).json({ 
        error: 'userId query parameter required', 
        example: '/api/workspace/credentials/debug/all?userId=your-user-id' 
      });
    }
    
    const pool = getPool();
    
    const { rows } = await pool.query(
      `SELECT id, name, type, key, encrypted_data, 
              LENGTH(encrypted_data) as encrypted_length,
              created_at, updated_at
       FROM workspace_credentials
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId]
    );
    
    const debugResults = rows.map(row => {
      const debugInfo = {
        id: row.id,
        name: row.name,
        type: row.type,
        key: row.key,
        created_at: row.created_at,
        updated_at: row.updated_at,
        encryption_debug: {
          has_encrypted_data: !!row.encrypted_data,
          encrypted_data_type: typeof row.encrypted_data,
          encrypted_data_length: row.encrypted_length,
          encrypted_data_preview: row.encrypted_data 
            ? String(row.encrypted_data).substring(0, 100) 
            : null,
          is_valid_hex: row.encrypted_data ? /^[0-9a-fA-F]+$/.test(row.encrypted_data) : false,
        },
        decryption_attempt: null,
        decrypted_password: null,
        decryption_error: null,
      };
      
      // Attempt to decrypt
      if (row.encrypted_data) {
        try {
          const encryptedBuffer = Buffer.from(row.encrypted_data, 'hex');
          const decrypted = decryptCredential(encryptedBuffer, userId);
          
          debugInfo.decryption_attempt = 'success';
          debugInfo.decrypted_password = decrypted;
        } catch (error) {
          debugInfo.decryption_attempt = 'failed';
          debugInfo.decryption_error = error.message;
        }
      } else {
        debugInfo.decryption_attempt = 'no_data';
      }
      
      return debugInfo;
    });
    
    res.json({
      user_id: userId,
      total_credentials: rows.length,
      credentials: debugResults,
    });
  } catch (error) {
    console.error('[Workspace] Error in debug endpoint:', error);
    res.status(500).json({ error: 'Failed to debug credentials', details: error.message });
  }
});

// ============================================================================
// OAUTH TOKEN REFRESH HELPERS
// ============================================================================

/**
 * Helper function to decrypt OAuth tokens with better error handling
 * @param {Buffer} encryptedCredentials - Encrypted credentials from database
 * @param {string} userId - User ID for decryption
 * @param {string} connectionId - Connection ID for error handling
 * @param {object} pool - Database pool
 * @returns {Promise<object>} Decrypted tokens or null if failed
 */
async function safeDecryptOAuthTokens(encryptedCredentials, userId, connectionId, pool) {
  try {
    // Debug: Log what we received
    console.log('[Workspace Debug] Encrypted credentials type:', typeof encryptedCredentials);
    console.log('[Workspace Debug] Is Buffer?', Buffer.isBuffer(encryptedCredentials));
    console.log('[Workspace Debug] Is Object?', encryptedCredentials && typeof encryptedCredentials === 'object' && !Buffer.isBuffer(encryptedCredentials));
    
    if (encryptedCredentials && typeof encryptedCredentials === 'object' && !Buffer.isBuffer(encryptedCredentials)) {
      console.log('[Workspace Debug] Encrypted credentials keys:', Object.keys(encryptedCredentials));
      
      // Check if this is the wrong format from previous bug (object with 'encrypted' property)
      if (encryptedCredentials.encrypted && Buffer.isBuffer(encryptedCredentials.encrypted)) {
        console.log('[Workspace] Detected corrupted credential format (full object instead of Buffer)');
        console.log('[Workspace] Attempting to extract Buffer from object...');
        
        // Try to decrypt using just the Buffer
        try {
          const tokens = decryptOAuthTokens(encryptedCredentials.encrypted, userId);
          console.log('[Workspace] Successfully decrypted using extracted Buffer!');
          console.log('[Workspace] This connection needs to be refreshed to fix the stored format');
          return tokens;
        } catch (extractError) {
          console.error('[Workspace] Failed to decrypt even after extracting Buffer:', extractError);
        }
      }
    }
    
    return decryptOAuthTokens(encryptedCredentials, userId);
  } catch (error) {
    console.error('[Workspace] Failed to decrypt OAuth tokens:', error);
    console.error('[Workspace] This usually means the connection needs to be recreated via OAuth');
    console.error('[Workspace Debug] Error details:', error.message);
    console.error('[Workspace Debug] Error stack:', error.stack);
    
    // Check if connection was recently updated (within last 5 seconds)
    // This prevents marking as invalid if token was just refreshed
    try {
      const { rows: checkRows } = await pool.query(
        `SELECT updated_at FROM workspace_connections WHERE id = $1`,
        [connectionId]
      );
      
      if (checkRows.length > 0) {
        const updatedAt = checkRows[0].updated_at;
        if (updatedAt) {
          const timeSinceUpdate = Date.now() - new Date(updatedAt).getTime();
          console.log(`[Workspace Debug] Time since last update: ${Math.round(timeSinceUpdate)}ms`);
          // If updated within last 5 seconds, don't mark as invalid (likely just refreshed)
          if (timeSinceUpdate < 5000) {
            console.log(`[Workspace] Connection ${connectionId} was recently updated (${Math.round(timeSinceUpdate)}ms ago), skipping invalid mark`);
            return null;
          }
        }
      }
    } catch (checkError) {
      console.error('[Workspace] Failed to check connection update time:', checkError);
    }
    
    // Mark connection as invalid in database
    try {
      await pool.query(
        `UPDATE workspace_connections 
         SET status = 'invalid', 
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [connectionId]
      );
      console.log(`[Workspace] Marked connection ${connectionId} as invalid due to decryption failure`);
    } catch (updateError) {
      console.error('[Workspace] Failed to mark connection as invalid:', updateError);
    }
    
    return null;
  }
}

/**
 * Helper function to refresh OAuth token and update database
 * @param {object} connection - Connection record from database
 * @param {string} userId - User ID for encryption
 * @param {object} tokens - Current decrypted tokens
 * @param {string} service - Service name ('gmail' or 'slack')
 * @returns {Promise<object>} Refreshed tokens
 */
async function refreshAndUpdateToken(connection, userId, tokens, service) {
  const pool = getPool();
  
  if (!tokens.refresh_token) {
    throw new Error('No refresh token available. User must re-authenticate.');
  }
  
  // Get OAuth credentials from environment
  const clientId = service === 'gmail' 
    ? (process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID)
    : (process.env.SLACK_CLIENT_ID || process.env.VITE_SLACK_CLIENT_ID);
    
  const clientSecret = service === 'gmail'
    ? process.env.GOOGLE_CLIENT_SECRET
    : process.env.SLACK_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error(`OAuth credentials not configured for ${service}`);
  }
  
  // Refresh the token
  console.log(`[OAuth] Refreshing ${service} token for connection ${connection.id}`);
  
  const newTokens = service === 'gmail'
    ? await refreshGoogleToken(tokens.refresh_token, clientId, clientSecret)
    : await refreshSlackToken(tokens.refresh_token, clientId, clientSecret);
  
  // Calculate new expiry timestamp
  const expiresAt = newTokens.expires_in 
    ? calculateExpiryTimestamp(newTokens.expires_in)
    : null;
  
  // Merge with existing tokens (keep refresh_token if not returned)
  const updatedTokens = {
    access_token: newTokens.access_token,
    refresh_token: newTokens.refresh_token || tokens.refresh_token,
    expires_at: expiresAt,
    scopes: newTokens.scope ? newTokens.scope.split(' ') : tokens.scopes,
  };
  
  // Encrypt and save to database
  // Note: Only store the encrypted Buffer, not the full object
  const encryptResult = encryptOAuthTokens(updatedTokens, userId);
  console.log('[OAuth Debug] Encrypt result type:', typeof encryptResult);
  console.log('[OAuth Debug] Encrypt result keys:', Object.keys(encryptResult));
  
  const { encrypted } = encryptResult;
  console.log('[OAuth Debug] Extracted encrypted type:', typeof encrypted);
  console.log('[OAuth Debug] Is Buffer?', Buffer.isBuffer(encrypted));
  console.log('[OAuth Debug] Buffer length:', encrypted ? encrypted.length : 'N/A');
  
  await pool.query(
    `UPDATE workspace_connections 
     SET encrypted_credentials = $1, 
         token_expires_at = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [
      encrypted,  // Store only the Buffer, not the full object
      expiresAt ? new Date(expiresAt * 1000) : null,
      connection.id
    ]
  );
  
  console.log(`[OAuth] Successfully refreshed and updated ${service} token`);
  console.log(`[OAuth Debug] Stored credentials in database for connection ${connection.id}`);
  
  return updatedTokens;
}

// ============================================================================
// GMAIL INTEGRATION ENDPOINTS
// ============================================================================

/**
 * Fetch Gmail emails for a connection
 * GET /api/workspace/connections/:connectionId/gmail/emails
 */
router.get('/connections/:connectionId/gmail/emails', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { connectionId } = req.params;
    const { maxResults = 50, query = '', pageToken = null } = req.query;
    
    const pool = getPool();
    
    // Get connection with decrypted credentials
    const { rows } = await pool.query(
      `SELECT id, service_name, encrypted_credentials, status
       FROM workspace_connections
       WHERE id = $1 AND user_id = $2 AND service_name = 'gmail' AND status = 'active'`,
      [connectionId, userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Gmail connection not found or inactive' });
    }
    
    const connection = rows[0];
    
    // Debug: Log what we fetched from database
    console.log('[Workspace Debug] === Fetching Gmail Emails Endpoint ===');
    console.log('[Workspace Debug] Connection ID:', connection.id);
    console.log('[Workspace Debug] Encrypted credentials type from DB:', typeof connection.encrypted_credentials);
    console.log('[Workspace Debug] Is Buffer from DB?', Buffer.isBuffer(connection.encrypted_credentials));
    if (connection.encrypted_credentials) {
      console.log('[Workspace Debug] Encrypted credentials length:', connection.encrypted_credentials.length);
    }
    
    // Decrypt OAuth tokens with safe error handling
    const tokens = await safeDecryptOAuthTokens(connection.encrypted_credentials, userId, connectionId, pool);
    
    if (!tokens) {
      return res.status(401).json({ 
        error: 'Connection credentials are invalid or corrupted. Please disconnect and reconnect your Gmail account.',
        action: 'reconnect_required',
        connectionId 
      });
    }
    
    if (!tokens.access_token) {
      return res.status(400).json({ error: 'No access token found for Gmail connection' });
    }
    
    // Check if token needs refresh (proactive refresh)
    if (tokens.expires_at && shouldRefreshToken(tokens.expires_at)) {
      console.log('[Workspace] Gmail token expired or expiring soon, refreshing...');
      try {
        const refreshedTokens = await refreshAndUpdateToken(connection, userId, tokens, 'gmail');
        Object.assign(tokens, refreshedTokens);
      } catch (refreshError) {
        console.error('[Workspace] Failed to refresh token:', refreshError);
        return res.status(401).json({ 
          error: 'Authentication expired. Please reconnect your Gmail account.',
          details: refreshError.message 
        });
      }
    }
    
    // Fetch emails using Gmail API
    try {
      const result = await fetchGmailEmails(tokens.access_token, {
        maxResults: parseInt(maxResults),
        query,
        pageToken,
      });
      
      // Update last_used_at
      await pool.query(
        'UPDATE workspace_connections SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
        [connectionId]
      );
      
      res.json({
        emails: result.messages,
        nextPageToken: result.nextPageToken,
        totalEstimate: result.resultSizeEstimate,
      });
    } catch (apiError) {
      // Check if it's a 401 authentication error
      if (apiError.message && apiError.message.includes('401')) {
        console.log('[Workspace] Got 401 error, attempting token refresh...');
        try {
          // Refresh token - this updates the database with new encrypted credentials
          const refreshedTokens = await refreshAndUpdateToken(connection, userId, tokens, 'gmail');
          
          // Use the refreshed tokens directly (no need to decrypt again)
          const newAccessToken = refreshedTokens.access_token;
          
          // Retry the request with new token
          const result = await fetchGmailEmails(newAccessToken, {
            maxResults: parseInt(maxResults),
            query,
            pageToken,
          });
          
          // Update last_used_at
          await pool.query(
            'UPDATE workspace_connections SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
            [connectionId]
          );
          
          return res.json({
            emails: result.messages,
            nextPageToken: result.nextPageToken,
            totalEstimate: result.resultSizeEstimate,
          });
        } catch (retryError) {
          console.error('[Workspace] Failed after token refresh:', retryError);
          
          // Only mark as invalid if refresh token itself is invalid or expired
          // Don't mark invalid for API errors or other transient issues
          const isRefreshTokenError = retryError.message && (
            retryError.message.includes('refresh token') ||
            retryError.message.includes('invalid_grant') ||
            retryError.message.includes('No refresh token')
          );
          
          if (isRefreshTokenError) {
            // Refresh token is invalid, connection needs to be recreated
            try {
              await pool.query(
                `UPDATE workspace_connections 
                 SET status = 'invalid', 
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE id = $1`,
                [connectionId]
              );
              console.log(`[Workspace] Marked connection ${connectionId} as invalid due to invalid refresh token`);
            } catch (updateError) {
              console.error('[Workspace] Failed to mark connection as invalid:', updateError);
            }
          } else {
            // Token refresh succeeded but API call failed - don't mark as invalid
            // This could be a temporary API issue, rate limit, etc.
            console.log('[Workspace] Token refresh succeeded but API call failed - connection remains active');
          }
          
          return res.status(401).json({ 
            error: isRefreshTokenError 
              ? 'Authentication expired. Please reconnect your Gmail account.'
              : 'Failed to fetch emails after token refresh. Please try again.',
            action: isRefreshTokenError ? 'reconnect_required' : undefined,
            details: retryError.message 
          });
        }
      }
      
      // Other API errors
      console.error('[Workspace] Gmail API error:', apiError);
      res.status(500).json({ 
        error: 'Failed to fetch Gmail emails', 
        details: apiError.message 
      });
    }
  } catch (error) {
    console.error('[Workspace] Error fetching Gmail emails:', error);
    res.status(500).json({ error: 'Failed to fetch Gmail emails' });
  }
});

/**
 * Fetch a specific Gmail email
 * GET /api/workspace/connections/:connectionId/gmail/email/:emailId
 */
router.get('/connections/:connectionId/gmail/email/:emailId', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { connectionId, emailId } = req.params;
    
    const pool = getPool();
    
    // Get connection with decrypted credentials
    const { rows } = await pool.query(
      `SELECT id, service_name, encrypted_credentials, status
       FROM workspace_connections
       WHERE id = $1 AND user_id = $2 AND service_name = 'gmail' AND status = 'active'`,
      [connectionId, userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Gmail connection not found or inactive' });
    }
    
    const connection = rows[0];
    
    // Decrypt OAuth tokens
    let tokens;
    try {
      tokens = decryptOAuthTokens(connection.encrypted_credentials, userId);
    } catch (error) {
      console.error('[Workspace] Failed to decrypt Gmail tokens:', error);
      return res.status(500).json({ error: 'Failed to decrypt credentials' });
    }
    
    if (!tokens.access_token) {
      return res.status(400).json({ error: 'No access token found for Gmail connection' });
    }
    
    // Fetch specific email
    try {
      const email = await fetchGmailMessage(tokens.access_token, emailId);
      
      if (!email) {
        return res.status(404).json({ error: 'Email not found' });
      }
      
      // Update last_used_at
      await pool.query(
        'UPDATE workspace_connections SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
        [connectionId]
      );
      
      res.json({ email });
    } catch (apiError) {
      console.error('[Workspace] Gmail API error:', apiError);
      res.status(500).json({ 
        error: 'Failed to fetch Gmail email', 
        details: apiError.message 
      });
    }
  } catch (error) {
    console.error('[Workspace] Error fetching Gmail email:', error);
    res.status(500).json({ error: 'Failed to fetch Gmail email' });
  }
});

/**
 * Fetch a Gmail thread (all messages in conversation)
 * GET /api/workspace/connections/:connectionId/gmail/thread/:threadId
 */
router.get('/connections/:connectionId/gmail/thread/:threadId', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { connectionId, threadId } = req.params;
    
    const pool = getPool();
    
    // Get connection with decrypted credentials
    const { rows } = await pool.query(
      `SELECT id, service_name, encrypted_credentials, status
       FROM workspace_connections
       WHERE id = $1 AND user_id = $2 AND service_name = 'gmail' AND status = 'active'`,
      [connectionId, userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Gmail connection not found or inactive' });
    }
    
    const connection = rows[0];
    
    // Decrypt OAuth tokens with safe error handling
    const tokens = await safeDecryptOAuthTokens(connection.encrypted_credentials, userId, connectionId, pool);
    
    if (!tokens) {
      return res.status(401).json({ 
        error: 'Connection credentials are invalid or corrupted. Please disconnect and reconnect your Gmail account.',
        action: 'reconnect_required',
        connectionId 
      });
    }
    
    if (!tokens.access_token) {
      return res.status(400).json({ error: 'No access token found for Gmail connection' });
    }
    
    // Check if token needs refresh (proactive refresh)
    if (tokens.expires_at && shouldRefreshToken(tokens.expires_at)) {
      console.log('[Workspace] Gmail token expired or expiring soon, refreshing...');
      try {
        const refreshedTokens = await refreshAndUpdateToken(connection, userId, tokens, 'gmail');
        Object.assign(tokens, refreshedTokens);
      } catch (refreshError) {
        console.error('[Workspace] Failed to refresh token:', refreshError);
        return res.status(401).json({ 
          error: 'Authentication expired. Please reconnect your Gmail account.',
          details: refreshError.message 
        });
      }
    }
    
    // Fetch thread with all messages
    try {
      const thread = await fetchGmailThread(tokens.access_token, threadId);
      
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }
      
      // Convert thread to formatted text
      const { convertThreadToTextFormat } = await import('../utils/gmail-client.js');
      const threadContent = convertThreadToTextFormat(thread);
      
      // Update last_used_at
      await pool.query(
        'UPDATE workspace_connections SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
        [connectionId]
      );
      
      res.json({ thread, threadContent });
    } catch (apiError) {
      // Check if it's a 401 authentication error
      if (apiError.message && apiError.message.includes('401')) {
        console.log('[Workspace] Got 401 error, attempting token refresh...');
        try {
          // Refresh token
          const refreshedTokens = await refreshAndUpdateToken(connection, userId, tokens, 'gmail');
          Object.assign(tokens, refreshedTokens);
          
          // Retry the request with new token
          const thread = await fetchGmailThread(tokens.access_token, threadId);
          
          if (!thread) {
            return res.status(404).json({ error: 'Thread not found' });
          }
          
          // Convert thread to formatted text
          const { convertThreadToTextFormat } = await import('../utils/gmail-client.js');
          const threadContent = convertThreadToTextFormat(thread);
          
          // Update last_used_at
          await pool.query(
            'UPDATE workspace_connections SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
            [connectionId]
          );
          
          return res.json({ thread, threadContent });
        } catch (retryError) {
          console.error('[Workspace] Failed after token refresh:', retryError);
          return res.status(401).json({ 
            error: 'Authentication failed. Please reconnect your Gmail account.',
            action: 'reconnect_required',
            details: retryError.message 
          });
        }
      }
      
      // Other API errors
      console.error('[Workspace] Gmail API error:', apiError);
      res.status(500).json({ 
        error: 'Failed to fetch Gmail thread', 
        details: apiError.message 
      });
    }
  } catch (error) {
    console.error('[Workspace] Error fetching Gmail thread:', error);
    res.status(500).json({ error: 'Failed to fetch Gmail thread' });
  }
});

// ============================================================================
// SLACK INTEGRATION ENDPOINTS
// ============================================================================

/**
 * Fetch Slack conversations (channels)
 * GET /api/workspace/connections/:connectionId/slack/conversations
 */
router.get('/connections/:connectionId/slack/conversations', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { connectionId } = req.params;
    const { types = 'public_channel,private_channel,mpim,im', limit = 100 } = req.query;
    
    const pool = getPool();
    
    // Get connection with decrypted credentials
    const { rows } = await pool.query(
      `SELECT id, service_name, encrypted_credentials, status
       FROM workspace_connections
       WHERE id = $1 AND user_id = $2 AND service_name = 'slack' AND status = 'active'`,
      [connectionId, userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Slack connection not found or inactive' });
    }
    
    const connection = rows[0];
    
    // Decrypt OAuth tokens with safe error handling
    const tokens = await safeDecryptOAuthTokens(connection.encrypted_credentials, userId, connectionId, pool);
    
    if (!tokens) {
      return res.status(401).json({ 
        error: 'Connection credentials are invalid or corrupted. Please disconnect and reconnect your Slack account.',
        action: 'reconnect_required',
        connectionId 
      });
    }
    
    if (!tokens.access_token) {
      return res.status(400).json({ error: 'No access token found for Slack connection' });
    }
    
    // Check if token needs refresh (proactive refresh)
    if (tokens.expires_at && shouldRefreshToken(tokens.expires_at)) {
      console.log('[Workspace] Slack token expired or expiring soon, refreshing...');
      try {
        const refreshedTokens = await refreshAndUpdateToken(connection, userId, tokens, 'slack');
        Object.assign(tokens, refreshedTokens);
      } catch (refreshError) {
        console.error('[Workspace] Failed to refresh token:', refreshError);
        return res.status(401).json({ 
          error: 'Authentication expired. Please reconnect your Slack account.',
          details: refreshError.message 
        });
      }
    }
    
    // Fetch conversations using Slack API
    try {
      const result = await fetchSlackConversations(tokens.access_token, {
        types,
        limit: parseInt(limit),
      });
      
      // Update last_used_at
      await pool.query(
        'UPDATE workspace_connections SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
        [connectionId]
      );
      
      res.json({
        channels: result.channels,
        nextCursor: result.nextCursor,
      });
    } catch (apiError) {
      // Check if it's a 401 authentication error
      if (apiError.message && apiError.message.includes('401')) {
        console.log('[Workspace] Got 401 error, attempting token refresh...');
        try {
          // Refresh token
          const refreshedTokens = await refreshAndUpdateToken(connection, userId, tokens, 'slack');
          
          // Retry the request with new token
          const result = await fetchSlackConversations(refreshedTokens.access_token, {
            types,
            limit: parseInt(limit),
          });
          
          // Update last_used_at
          await pool.query(
            'UPDATE workspace_connections SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
            [connectionId]
          );
          
          return res.json({
            channels: result.channels,
            nextCursor: result.nextCursor,
          });
        } catch (retryError) {
          console.error('[Workspace] Failed after token refresh:', retryError);
          
          // Only mark as invalid if refresh token itself is invalid
          const isRefreshTokenError = retryError.message && (
            retryError.message.includes('refresh token') ||
            retryError.message.includes('invalid_grant') ||
            retryError.message.includes('No refresh token')
          );
          
          if (isRefreshTokenError) {
            await pool.query(
              `UPDATE workspace_connections SET status = 'invalid' WHERE id = $1`,
              [connectionId]
            );
          }
          
          return res.status(401).json({ 
            error: 'Authentication failed. Please reconnect your Slack account.',
            details: retryError.message 
          });
        }
      }
      
      console.error('[Workspace] Slack API error:', apiError);
      res.status(500).json({ 
        error: 'Failed to fetch Slack conversations', 
        details: apiError.message 
      });
    }
  } catch (error) {
    console.error('[Workspace] Error fetching Slack conversations:', error);
    res.status(500).json({ error: 'Failed to fetch Slack conversations' });
  }
});

/**
 * Fetch recent Slack messages across all channels
 * GET /api/workspace/connections/:connectionId/slack/messages
 */
router.get('/connections/:connectionId/slack/messages', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { connectionId } = req.params;
    const { limit = 50 } = req.query;
    
    const pool = getPool();
    
    // Get connection with decrypted credentials
    const { rows } = await pool.query(
      `SELECT id, service_name, encrypted_credentials, status
       FROM workspace_connections
       WHERE id = $1 AND user_id = $2 AND service_name = 'slack' AND status = 'active'`,
      [connectionId, userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Slack connection not found or inactive' });
    }
    
    const connection = rows[0];
    
    // Decrypt OAuth tokens with safe error handling
    const tokens = await safeDecryptOAuthTokens(connection.encrypted_credentials, userId, connectionId, pool);
    
    if (!tokens) {
      return res.status(401).json({ 
        error: 'Connection credentials are invalid or corrupted. Please disconnect and reconnect your Slack account.',
        action: 'reconnect_required',
        connectionId 
      });
    }
    
    if (!tokens.access_token) {
      return res.status(400).json({ error: 'No access token found for Slack connection' });
    }
    
    // Check if token needs refresh (proactive refresh)
    if (tokens.expires_at && shouldRefreshToken(tokens.expires_at)) {
      console.log('[Workspace] Slack token expired or expiring soon, refreshing...');
      try {
        const refreshedTokens = await refreshAndUpdateToken(connection, userId, tokens, 'slack');
        Object.assign(tokens, refreshedTokens);
      } catch (refreshError) {
        console.error('[Workspace] Failed to refresh token:', refreshError);
        return res.status(401).json({ 
          error: 'Authentication expired. Please reconnect your Slack account.',
          details: refreshError.message 
        });
      }
    }
    
    // Fetch recent messages using Slack API
    try {
      const messages = await fetchRecentSlackMessages(tokens.access_token, parseInt(limit));
      
      // Update last_used_at
      await pool.query(
        'UPDATE workspace_connections SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
        [connectionId]
      );
      
      res.json({
        messages,
        total: messages.length,
      });
    } catch (apiError) {
      // Check if it's a 401 authentication error
      if (apiError.message && apiError.message.includes('401')) {
        console.log('[Workspace] Got 401 error, attempting token refresh...');
        try {
          // Refresh token
          const refreshedTokens = await refreshAndUpdateToken(connection, userId, tokens, 'slack');
          
          // Retry the request with new token
          const messages = await fetchRecentSlackMessages(refreshedTokens.access_token, parseInt(limit));
          
          // Update last_used_at
          await pool.query(
            'UPDATE workspace_connections SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
            [connectionId]
          );
          
          return res.json({
            messages,
            total: messages.length,
          });
        } catch (retryError) {
          console.error('[Workspace] Failed after token refresh:', retryError);
          
          // Only mark as invalid if refresh token itself is invalid
          const isRefreshTokenError = retryError.message && (
            retryError.message.includes('refresh token') ||
            retryError.message.includes('invalid_grant') ||
            retryError.message.includes('No refresh token')
          );
          
          if (isRefreshTokenError) {
            await pool.query(
              `UPDATE workspace_connections SET status = 'invalid' WHERE id = $1`,
              [connectionId]
            );
          }
          
          return res.status(401).json({ 
            error: 'Authentication failed. Please reconnect your Slack account.',
            details: retryError.message 
          });
        }
      }
      
      console.error('[Workspace] Slack API error:', apiError);
      res.status(500).json({ 
        error: 'Failed to fetch Slack messages', 
        details: apiError.message 
      });
    }
  } catch (error) {
    console.error('[Workspace] Error fetching Slack messages:', error);
    res.status(500).json({ error: 'Failed to fetch Slack messages' });
  }
});

/**
 * Fetch messages from a specific Slack channel
 * GET /api/workspace/connections/:connectionId/slack/channel/:channelId/messages
 */
router.get('/connections/:connectionId/slack/channel/:channelId/messages', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { connectionId, channelId } = req.params;
    const { limit = 50 } = req.query;
    
    const pool = getPool();
    
    // Get connection with decrypted credentials
    const { rows } = await pool.query(
      `SELECT id, service_name, encrypted_credentials, status
       FROM workspace_connections
       WHERE id = $1 AND user_id = $2 AND service_name = 'slack' AND status = 'active'`,
      [connectionId, userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Slack connection not found or inactive' });
    }
    
    const connection = rows[0];
    
    // Decrypt OAuth tokens with safe error handling
    const tokens = await safeDecryptOAuthTokens(connection.encrypted_credentials, userId, connectionId, pool);
    
    if (!tokens) {
      return res.status(401).json({ 
        error: 'Connection credentials are invalid or corrupted. Please disconnect and reconnect your Slack account.',
        action: 'reconnect_required',
        connectionId 
      });
    }
    
    if (!tokens.access_token) {
      return res.status(400).json({ error: 'No access token found for Slack connection' });
    }
    
    // Check if token needs refresh (proactive refresh)
    if (tokens.expires_at && shouldRefreshToken(tokens.expires_at)) {
      console.log('[Workspace] Slack token expired or expiring soon, refreshing...');
      try {
        const refreshedTokens = await refreshAndUpdateToken(connection, userId, tokens, 'slack');
        Object.assign(tokens, refreshedTokens);
      } catch (refreshError) {
        console.error('[Workspace] Failed to refresh token:', refreshError);
        return res.status(401).json({ 
          error: 'Authentication expired. Please reconnect your Slack account.',
          details: refreshError.message 
        });
      }
    }
    
    // Fetch messages from channel
    try {
      const result = await fetchSlackMessages(tokens.access_token, channelId, {
        limit: parseInt(limit),
      });
      
      // Update last_used_at
      await pool.query(
        'UPDATE workspace_connections SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
        [connectionId]
      );
      
      res.json({
        messages: result.messages,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
      });
    } catch (apiError) {
      // Check if it's a 401 authentication error
      if (apiError.message && apiError.message.includes('401')) {
        console.log('[Workspace] Got 401 error, attempting token refresh...');
        try {
          // Refresh token
          const refreshedTokens = await refreshAndUpdateToken(connection, userId, tokens, 'slack');
          
          // Retry the request with new token
          const result = await fetchSlackMessages(refreshedTokens.access_token, channelId, {
            limit: parseInt(limit),
          });
          
          // Update last_used_at
          await pool.query(
            'UPDATE workspace_connections SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
            [connectionId]
          );
          
          return res.json({
            messages: result.messages,
            hasMore: result.hasMore,
            nextCursor: result.nextCursor,
          });
        } catch (retryError) {
          console.error('[Workspace] Failed after token refresh:', retryError);
          
          // Only mark as invalid if refresh token itself is invalid
          const isRefreshTokenError = retryError.message && (
            retryError.message.includes('refresh token') ||
            retryError.message.includes('invalid_grant') ||
            retryError.message.includes('No refresh token')
          );
          
          if (isRefreshTokenError) {
            await pool.query(
              `UPDATE workspace_connections SET status = 'invalid' WHERE id = $1`,
              [connectionId]
            );
          }
          
          return res.status(401).json({ 
            error: 'Authentication failed. Please reconnect your Slack account.',
            details: retryError.message 
          });
        }
      }
      
      console.error('[Workspace] Slack API error:', apiError);
      res.status(500).json({ 
        error: 'Failed to fetch Slack channel messages', 
        details: apiError.message 
      });
    }
  } catch (error) {
    console.error('[Workspace] Error fetching Slack channel messages:', error);
    res.status(500).json({ error: 'Failed to fetch Slack channel messages' });
  }
});

/**
 * Fetch thread replies from a Slack message
 * GET /api/workspace/connections/:connectionId/slack/thread/:channelId/:threadTs
 */
router.get('/connections/:connectionId/slack/thread/:channelId/:threadTs', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { connectionId, channelId, threadTs } = req.params;
    
    const pool = getPool();
    
    // Get connection with decrypted credentials
    const { rows } = await pool.query(
      `SELECT id, service_name, encrypted_credentials, status
       FROM workspace_connections
       WHERE id = $1 AND user_id = $2 AND service_name = 'slack' AND status = 'active'`,
      [connectionId, userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Slack connection not found or inactive' });
    }
    
    const connection = rows[0];
    
    // Decrypt OAuth tokens with safe error handling
    const tokens = await safeDecryptOAuthTokens(connection.encrypted_credentials, userId, connectionId, pool);
    
    if (!tokens) {
      return res.status(401).json({ 
        error: 'Connection credentials are invalid or corrupted. Please disconnect and reconnect your Slack account.',
        action: 'reconnect_required',
        connectionId 
      });
    }
    
    if (!tokens.access_token) {
      return res.status(400).json({ error: 'No access token found for Slack connection' });
    }
    
    // Check if token needs refresh (proactive refresh)
    if (tokens.expires_at && shouldRefreshToken(tokens.expires_at)) {
      console.log('[Workspace] Slack token expired or expiring soon, refreshing...');
      try {
        const refreshedTokens = await refreshAndUpdateToken(connection, userId, tokens, 'slack');
        Object.assign(tokens, refreshedTokens);
      } catch (refreshError) {
        console.error('[Workspace] Failed to refresh token:', refreshError);
        return res.status(401).json({ 
          error: 'Authentication expired. Please reconnect your Slack account.',
          details: refreshError.message 
        });
      }
    }
    
    // Fetch thread replies
    try {
      const result = await fetchSlackThreadReplies(tokens.access_token, channelId, threadTs);
      
      // Update last_used_at
      await pool.query(
        'UPDATE workspace_connections SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
        [connectionId]
      );
      
      res.json({
        messages: result.messages,
        hasMore: result.hasMore,
      });
    } catch (apiError) {
      // Check if it's a 401 authentication error
      if (apiError.message && apiError.message.includes('401')) {
        console.log('[Workspace] Got 401 error, attempting token refresh...');
        try {
          // Refresh token
          const refreshedTokens = await refreshAndUpdateToken(connection, userId, tokens, 'slack');
          
          // Retry the request with new token
          const result = await fetchSlackThreadReplies(refreshedTokens.access_token, channelId, threadTs);
          
          // Update last_used_at
          await pool.query(
            'UPDATE workspace_connections SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
            [connectionId]
          );
          
          return res.json({
            messages: result.messages,
            hasMore: result.hasMore,
          });
        } catch (retryError) {
          console.error('[Workspace] Failed after token refresh:', retryError);
          
          // Only mark as invalid if refresh token itself is invalid
          const isRefreshTokenError = retryError.message && (
            retryError.message.includes('refresh token') ||
            retryError.message.includes('invalid_grant')
          );
          
          if (isRefreshTokenError) {
            await pool.query(
              'UPDATE workspace_connections SET status = $1 WHERE id = $2',
              ['invalid', connectionId]
            );
          }
          
          return res.status(401).json({ 
            error: 'Authentication failed. Please reconnect your Slack account.',
            details: retryError.message 
          });
        }
      }
      
      console.error('[Workspace] Slack API error:', apiError);
      res.status(500).json({ 
        error: 'Failed to fetch Slack thread replies', 
        details: apiError.message 
      });
    }
  } catch (error) {
    console.error('[Workspace] Error fetching Slack thread replies:', error);
    res.status(500).json({ error: 'Failed to fetch Slack thread replies' });
  }
});

/**
 * Download a Slack file
 * POST /api/workspace/connections/:connectionId/slack/file/download
 * Note: JSON parsing is handled by route-level middleware, not global middleware
 */
router.post('/connections/:connectionId/slack/file/download', express.json(), requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { connectionId } = req.params;
    const { file } = req.body;
    
    if (!file || (!file.url_private_download && !file.url_private)) {
      return res.status(400).json({ error: 'File information is required' });
    }
    
    const pool = getPool();
    
    // Get connection with decrypted credentials
    const { rows } = await pool.query(
      `SELECT id, service_name, encrypted_credentials, status
       FROM workspace_connections
       WHERE id = $1 AND user_id = $2 AND service_name = 'slack' AND status = 'active'`,
      [connectionId, userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Slack connection not found or inactive' });
    }
    
    const connection = rows[0];
    
    // Decrypt OAuth tokens with safe error handling
    const tokens = await safeDecryptOAuthTokens(connection.encrypted_credentials, userId, connectionId, pool);
    
    if (!tokens) {
      return res.status(401).json({ 
        error: 'Connection credentials are invalid or corrupted. Please disconnect and reconnect your Slack account.',
        action: 'reconnect_required',
        connectionId 
      });
    }
    
    if (!tokens.access_token) {
      return res.status(400).json({ error: 'No access token found for Slack connection' });
    }
    
    // Check if token needs refresh (proactive refresh)
    if (tokens.expires_at && shouldRefreshToken(tokens.expires_at)) {
      console.log('[Workspace] Slack token expired or expiring soon, refreshing...');
      try {
        const refreshedTokens = await refreshAndUpdateToken(connection, userId, tokens, 'slack');
        Object.assign(tokens, refreshedTokens);
      } catch (refreshError) {
        console.error('[Workspace] Failed to refresh token:', refreshError);
        return res.status(401).json({ 
          error: 'Authentication expired. Please reconnect your Slack account.',
          details: refreshError.message 
        });
      }
    }
    
    // Download the file
    try {
      const fileBuffer = await downloadSlackFile(tokens.access_token, file);
      
      console.log(`[Workspace] Downloaded file buffer: ${fileBuffer.length} bytes, type: ${typeof fileBuffer}, isBuffer: ${Buffer.isBuffer(fileBuffer)}`);
      console.log(`[Workspace] First 20 bytes:`, fileBuffer.slice(0, 20));
      console.log(`[Workspace] Last 20 bytes:`, fileBuffer.slice(-20));
      console.log(`[Workspace] Sending file with mimetype: ${file.mimetype}, name: ${file.name}`);
      
      // Update last_used_at
      await pool.query(
        'UPDATE workspace_connections SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
        [connectionId]
      );
      
      // Ensure we're sending raw binary - use Node's raw response methods
      // This bypasses Express's response processing
      res.status(200);
      res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
      res.setHeader('Content-Length', fileBuffer.length);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      
      // Use write() + end() to send raw buffer without Express processing
      res.write(fileBuffer);
      res.end();
    } catch (apiError) {
      // Check if it's a 401 authentication error
      if (apiError.message && apiError.message.includes('401')) {
        console.log('[Workspace] Got 401 error, attempting token refresh...');
        try {
          // Refresh token
          const refreshedTokens = await refreshAndUpdateToken(connection, userId, tokens, 'slack');
          
          // Retry the request with new token
          const fileBuffer = await downloadSlackFile(refreshedTokens.access_token, file);
          
          // Update last_used_at
          await pool.query(
            'UPDATE workspace_connections SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
            [connectionId]
          );
          
          res.status(200);
          res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');
          res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
          res.setHeader('Content-Length', fileBuffer.length);
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.write(fileBuffer);
          return res.end();
        } catch (retryError) {
          console.error('[Workspace] Failed after token refresh:', retryError);
          
          // Only mark as invalid if refresh token itself is invalid
          const isRefreshTokenError = retryError.message && (
            retryError.message.includes('refresh token') ||
            retryError.message.includes('invalid_grant')
          );
          
          if (isRefreshTokenError) {
            await pool.query(
              'UPDATE workspace_connections SET status = $1 WHERE id = $2',
              ['invalid', connectionId]
            );
          }
          
          return res.status(401).json({ 
            error: 'Authentication failed. Please reconnect your Slack account.',
            details: retryError.message 
          });
        }
      }
      
      console.error('[Workspace] Slack API error:', apiError);
      res.status(500).json({ 
        error: 'Failed to download Slack file', 
        details: apiError.message 
      });
    }
  } catch (error) {
    console.error('[Workspace] Error downloading Slack file:', error);
    res.status(500).json({ error: 'Failed to download Slack file' });
  }
});

export default router;

