/**
 * Workspace routes for personal resources management
 * Handles files, notes, and API connections (OAuth)
 */

import express from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { getPool } from '../config/database.js';
import { encryptCredential, decryptCredential, encryptOAuthTokens, decryptOAuthTokens } from '../utils/encryption.js';

const router = express.Router();

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
// FILES ENDPOINTS
// ============================================================================

/**
 * List user's workspace files
 * GET /api/workspace/files?folder=root&tags=important&limit=50&offset=0
 */
router.get('/files', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { folder, tags, limit = 50, offset = 0 } = req.query;
    
    const pool = getPool();
    let query = 'SELECT * FROM workspace_files WHERE user_id = $1';
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
 * Delete file from workspace
 * DELETE /api/workspace/files/:fileId
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
    const encryptedData = password ? encryptCredential(password) : null;
    
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO workspace_credentials (user_id, name, type, key, encrypted_data)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, type, key, created_at, updated_at`,
      [userId, name, type, key || null, encryptedData]
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
      const encryptedData = encryptCredential(password);
      query += `, encrypted_data = $${params.length + 1}`;
      params.push(encryptedData);
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

export default router;

