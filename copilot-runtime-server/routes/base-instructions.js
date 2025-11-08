import express from 'express';
import { auth } from '../auth/index.js';
import { getPool } from '../config/database.js';
import { log } from '../utils/logger.js';

const router = express.Router();

const sanitizeJSON = (value, fallback = {}) => {
  if (value == null) {
    return fallback;
  }

  if (typeof value === 'object') {
    return value;
  }

  if (typeof value === 'string' && value.trim() === '') {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (err) {
    throw new Error('Invalid JSON payload');
  }
};

const toCamelInstruction = row => ({
  id: row.id,
  instructionKey: row.instruction_key,
  instructionValue: row.instruction_value,
  description: row.description,
  organizationId: row.organization_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function ensureAuthenticated(req, res) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session || !session.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  return session;
}

async function ensureOrgAdmin(pool, organizationId, userId, res) {
  if (!organizationId) {
    res.status(400).json({ error: 'organizationId is required' });
    return null;
  }

  const memberResult = await pool.query(
    'SELECT role FROM member WHERE "organizationId" = $1 AND "userId" = $2',
    [organizationId, userId],
  );

  if (memberResult.rows.length === 0) {
    res.status(403).json({ error: 'Forbidden: user is not a member of the organization' });
    return null;
  }

  const roleValue = memberResult.rows[0].role;
  const roles = Array.isArray(roleValue)
    ? roleValue
    : typeof roleValue === 'string'
      ? [roleValue]
      : [];

  if (!roles.includes('owner') && !roles.includes('admin')) {
    res.status(403).json({ error: 'Forbidden: admin or owner role required' });
    return null;
  }

  return roles;
}


async function fetchInstructionById(pool, id, organizationId) {
  const { rows } = await pool.query(
    `SELECT bi.*
     FROM base_instructions bi
     WHERE bi.id = $1 AND bi.organization_id = $2`,
    [id, organizationId],
  );

  return rows[0] ? toCamelInstruction(rows[0]) : null;
}

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

    res.json({ instructions: rows.map(toCamelInstruction), count: rows.length });
  } catch (err) {
    next(err);
  }
});

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

    // Check for duplicate instruction_key
    const duplicateCheck = await pool.query(
      'SELECT id FROM base_instructions WHERE instruction_key = $1 AND organization_id = $2',
      [instructionKey.trim(), organizationId],
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Instruction key already exists in this organization' });
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

    const createdInstruction = await fetchInstructionById(pool, insertResult.rows[0].id, organizationId);
    res.status(201).json({ instruction: createdInstruction });
  } catch (err) {
    next(err);
  }
});

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
        return res.status(409).json({ error: 'Instruction key already exists in this organization' });
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

    const { rowCount } = await pool.query('DELETE FROM base_instructions WHERE id = $1 AND organization_id = $2', [instructionId, organizationId]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Base instruction not found' });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

