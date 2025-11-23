/**
 * Base Instructions API Routes
 * 
 * Provides CRUD operations for base instructions (system prompts/guidelines)
 * that can be configured per organization. These instructions are used to
 * customize agent behavior and responses.
 * 
 * Endpoints:
 * - GET    /api/admin/base-instructions - List instructions
 * - POST   /api/admin/base-instructions - Create instruction
 * - PUT    /api/admin/base-instructions/:instructionId - Update instruction
 * - DELETE /api/admin/base-instructions/:instructionId - Delete instruction
 */

import express from 'express';
import { getPool } from '../config/database.js';
import { log } from '../utils/logger.js';
import {
  sanitizeJSON,
  ensureAuthenticated,
  ensureOrgAdmin,
} from '../utils/route-helpers.js';

const router = express.Router();

// ============================================================================
// Data Transformation
// ============================================================================

/**
 * Convert database row to camelCase instruction object
 * @param {Object} row - Database row
 * @returns {Object} Camel-cased instruction object
 */
const toCamelInstruction = row => ({
  id: row.id,
  instructionKey: row.instruction_key,
  instructionValue: row.instruction_value,
  description: row.description,
  organizationId: row.organization_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// Authentication & Authorization helpers imported from route-helpers.js

// ============================================================================
// Database Queries
// ============================================================================

/**
 * Fetch instruction by ID
 * @param {Object} pool - Database pool
 * @param {string} id - Instruction ID
 * @param {string} organizationId - Organization ID
 * @returns {Promise<Object|null>} Instruction object or null if not found
 */
async function fetchInstructionById(pool, id, organizationId) {
  const { rows } = await pool.query(
    `SELECT bi.*
     FROM base_instructions bi
     WHERE bi.id = $1 AND bi.organization_id = $2`,
    [id, organizationId],
  );

  return rows[0] ? toCamelInstruction(rows[0]) : null;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /api/admin/base-instructions
 * List all base instructions for an organization
 * 
 * Query params:
 * - organizationId (required): Organization ID
 * 
 * Returns: { instructions: Instruction[], count: number }
 */
router.get('/', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { organizationId } = req.query;

    const pool = getPool();
    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    const { rows } = await pool.query(
      `SELECT bi.*
       FROM base_instructions bi
       WHERE bi.organization_id = $1
       ORDER BY bi.created_at DESC`,
      [organizationId],
    );

    res.json({ 
      instructions: rows.map(toCamelInstruction), 
      count: rows.length 
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/base-instructions
 * Create a new base instruction
 * 
 * Body:
 * - organizationId (required): Organization ID
 * - instructionKey (required): Unique identifier for the instruction
 * - instructionValue (required): The instruction text/content
 * - description (optional): Description of the instruction's purpose
 * 
 * Returns: { instruction: Instruction }
 */
router.post('/', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const {
      organizationId,
      instructionKey,
      instructionValue,
      description,
    } = req.body || {};

    // Validate required fields
    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    if (!instructionKey || typeof instructionKey !== 'string') {
      return res.status(400).json({ error: 'instructionKey is required' });
    }

    if (!instructionValue || typeof instructionValue !== 'string') {
      return res.status(400).json({ error: 'instructionValue is required' });
    }

    const pool = getPool();

    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    // Check for duplicate instruction_key in organization
    const duplicateCheck = await pool.query(
      'SELECT id FROM base_instructions WHERE instruction_key = $1 AND organization_id = $2',
      [instructionKey.trim(), organizationId],
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Instruction key already exists in this organization' 
      });
    }

    const insertResult = await pool.query(
      `INSERT INTO base_instructions (
         instruction_key,
         instruction_value,
         description,
         organization_id
       ) VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        instructionKey.trim(),
        instructionValue.trim(),
        description?.trim() || null,
        organizationId,
      ],
    );

    const createdInstruction = await fetchInstructionById(
      pool, 
      insertResult.rows[0].id, 
      organizationId
    );
    
    res.status(201).json({ instruction: createdInstruction });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/base-instructions/:instructionId
 * Update an existing base instruction
 * 
 * Params:
 * - instructionId: Instruction UUID
 * 
 * Body: (all optional except organizationId)
 * - organizationId (required): Organization ID
 * - instructionKey: Unique identifier for the instruction
 * - instructionValue: The instruction text/content
 * - description: Description of the instruction's purpose
 * 
 * Returns: { instruction: Instruction }
 */
router.put('/:instructionId', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { instructionId } = req.params;
    const {
      organizationId,
      instructionKey,
      instructionValue,
      description,
    } = req.body || {};

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    const pool = getPool();

    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    const existingInstruction = await fetchInstructionById(pool, instructionId, organizationId);
    if (!existingInstruction) {
      return res.status(404).json({ error: 'Base instruction not found' });
    }

    // Check for duplicate instruction_key if it's being changed
    if (instructionKey && instructionKey.trim() !== existingInstruction.instructionKey) {
      const duplicateCheck = await pool.query(
        'SELECT id FROM base_instructions WHERE instruction_key = $1 AND organization_id = $2 AND id != $3',
        [instructionKey.trim(), organizationId, instructionId],
      );

      if (duplicateCheck.rows.length > 0) {
        return res.status(409).json({ 
          error: 'Instruction key already exists in this organization' 
        });
      }
    }

    await pool.query(
      `UPDATE base_instructions
       SET
         instruction_key = $1,
         instruction_value = $2,
         description = $3,
         updated_at = NOW()
       WHERE id = $4 AND organization_id = $5`,
      [
        instructionKey ? instructionKey.trim() : existingInstruction.instructionKey,
        instructionValue ? instructionValue.trim() : existingInstruction.instructionValue,
        description?.trim() || null,
        instructionId,
        organizationId,
      ],
    );

    const updatedInstruction = await fetchInstructionById(pool, instructionId, organizationId);
    res.json({ instruction: updatedInstruction });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/base-instructions/:instructionId
 * Delete a base instruction
 * 
 * Params:
 * - instructionId: Instruction UUID
 * 
 * Query params:
 * - organizationId (required): Organization ID
 * 
 * Returns: { ok: true }
 */
router.delete('/:instructionId', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { instructionId } = req.params;
    const { organizationId } = req.query;

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    const pool = getPool();

    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    const { rowCount } = await pool.query(
      'DELETE FROM base_instructions WHERE id = $1 AND organization_id = $2',
      [instructionId, organizationId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Base instruction not found' });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

