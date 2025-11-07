import express from 'express';
import { auth } from '../auth/index.js';
import { getPool } from '../config/database.js';
import { invalidateCache as invalidateDbCache } from '../config/db-loaders.js';
import { invalidateCache as invalidateLoaderCache } from '../config/loader.js';
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

const extractModelIds = body => {
  if (!body || !Object.prototype.hasOwnProperty.call(body, 'modelIds')) {
    return { provided: false, modelIds: [] };
  }

  const rawValue = body.modelIds;
  if (rawValue == null) {
    return { provided: true, modelIds: [] };
  }

  if (!Array.isArray(rawValue)) {
    throw new ValidationError('modelIds must be an array of UUID strings');
  }

  const normalized = [];
  for (const value of rawValue) {
    if (typeof value !== 'string') {
      throw new ValidationError('modelIds must be an array of UUID strings');
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    if (!UUID_REGEX.test(trimmed)) {
      throw new ValidationError(`Invalid modelId: ${value}`);
    }
    if (!normalized.includes(trimmed)) {
      normalized.push(trimmed);
    }
  }

  return { provided: true, modelIds: normalized };
};

const validateModelIds = async (pool, organizationId, teamId, modelIds) => {
  if (!modelIds || modelIds.length === 0) {
    return [];
  }

  const { rows } = await pool.query(
    `
      SELECT id::text AS id, team_id
      FROM models
      WHERE id = ANY($1::uuid[])
        AND organization_id = $2
    `,
    [modelIds, organizationId],
  );

  if (rows.length !== modelIds.length) {
    throw new ValidationError('One or more selected models were not found for this organization');
  }

  const effectiveTeamId = teamId || null;

  if (effectiveTeamId) {
    const invalid = rows.filter(row => row.team_id && row.team_id !== effectiveTeamId);
    if (invalid.length > 0) {
      throw new ValidationError('Team-scoped agents can only use models scoped to the same team or organization-wide models');
    }
  } else {
    const invalid = rows.filter(row => row.team_id);
    if (invalid.length > 0) {
      throw new ValidationError('Organization-scoped agents can only use organization-wide models');
    }
  }

  return rows.map(row => row.id);
};

const replaceAgentModelMappings = async (pool, agentId, modelIds) => {
  await pool.query('DELETE FROM agent_model_mappings WHERE agent_id = $1', [agentId]);

  if (!modelIds || modelIds.length === 0) {
    return;
  }

  await pool.query(
    `
      INSERT INTO agent_model_mappings (agent_id, model_id)
      SELECT $1, id
      FROM UNNEST($2::uuid[]) AS id
    `,
    [agentId, modelIds],
  );
};

const toCamelAgent = row => ({
  id: row.id,
  agentType: row.agent_type,
  agentName: row.agent_name,
  description: row.description,
  promptTemplate: row.prompt_template,
  enabled: row.enabled,
  organizationId: row.organization_id,
  teamId: row.team_id,
  teamName: row.team_name || null,
  metadata: row.metadata || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  modelIds: Array.isArray(row.model_ids) ? row.model_ids.filter(Boolean) : [],
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

async function validateTeamBelongsToOrg(pool, organizationId, teamId) {
  if (!teamId) {
    return true;
  }

  const teamResult = await pool.query(
    'SELECT id FROM team WHERE id = $1 AND "organizationId" = $2',
    [teamId, organizationId],
  );

  return teamResult.rows.length > 0;
}

async function fetchAgentById(pool, id, organizationId) {
  const { rows } = await pool.query(
    `SELECT 
       a.*,
       t.name AS team_name,
       array_remove(array_agg(DISTINCT amm.model_id::text), NULL) AS model_ids
     FROM agents a
     LEFT JOIN team t ON a.team_id = t.id
     LEFT JOIN agent_model_mappings amm ON amm.agent_id = a.id
     WHERE a.id = $1 AND a.organization_id = $2
     GROUP BY a.id, t.name`,
    [id, organizationId],
  );

  return rows[0] ? toCamelAgent(rows[0]) : null;
}

function invalidateConfigCaches() {
  invalidateDbCache();
  invalidateLoaderCache();
}

router.get('/', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { organizationId, teamId } = req.query;

    const pool = getPool();
    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    if (teamId) {
      const teamIsValid = await validateTeamBelongsToOrg(pool, organizationId, teamId);
      if (!teamIsValid) {
        return res.status(404).json({ error: 'Team not found in organization' });
      }
    }

    const params = [organizationId, teamId || null];
    const { rows } = await pool.query(
      `SELECT 
         a.*,
         t.name AS team_name,
         array_remove(array_agg(DISTINCT amm.model_id::text), NULL) AS model_ids
       FROM agents a
       LEFT JOIN team t ON a.team_id = t.id
       LEFT JOIN agent_model_mappings amm ON amm.agent_id = a.id
       WHERE a.organization_id = $1
         AND ($2::text IS NULL OR a.team_id = $2 OR a.team_id IS NULL)
       GROUP BY a.id, t.name
       ORDER BY a.team_id IS NULL DESC, a.created_at DESC`,
      params,
    );

    res.json({ agents: rows.map(toCamelAgent), count: rows.length });
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
      teamId = null,
      agentType,
      agentName,
      description,
      promptTemplate,
      enabled = true,
      metadata,
    } = req.body || {};

    let extractedModelIds;
    try {
      extractedModelIds = extractModelIds(req.body);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(err.status).json({ error: err.message });
      }
      throw err;
    }

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    if (!agentType || typeof agentType !== 'string') {
      return res.status(400).json({ error: 'agentType is required' });
    }

    if (!agentName || typeof agentName !== 'string') {
      return res.status(400).json({ error: 'agentName is required' });
    }

    if (!promptTemplate || typeof promptTemplate !== 'string') {
      return res.status(400).json({ error: 'promptTemplate is required' });
    }

    const pool = getPool();

    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    if (teamId) {
      const teamIsValid = await validateTeamBelongsToOrg(pool, organizationId, teamId);
      if (!teamIsValid) {
        return res.status(404).json({ error: 'Team not found in organization' });
      }
    }

    // Check for duplicate agent_type
    const duplicateCheck = await pool.query(
      'SELECT id FROM agents WHERE agent_type = $1 AND organization_id = $2 AND ($3::text IS NULL OR team_id = $3)',
      [agentType.trim(), organizationId, teamId || null],
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Agent type already exists in this scope' });
    }

    let sanitizedModelIds = [];
    try {
      sanitizedModelIds = await validateModelIds(pool, organizationId, teamId || null, extractedModelIds.modelIds);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(err.status).json({ error: err.message });
      }
      throw err;
    }

    const metadataJSON = sanitizeJSON(metadata, {});

    const insertResult = await pool.query(
      `INSERT INTO agents (
         agent_type,
         agent_name,
         description,
         prompt_template,
         organization_id,
         team_id,
         enabled,
         metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        agentType.trim(),
        agentName.trim(),
        description?.trim() || null,
        promptTemplate.trim(),
        organizationId,
        teamId || null,
        Boolean(enabled),
        metadataJSON,
      ],
    );

    await replaceAgentModelMappings(pool, insertResult.rows[0].id, sanitizedModelIds);

    invalidateConfigCaches();

    const createdAgent = await fetchAgentById(pool, insertResult.rows[0].id, organizationId);
    res.status(201).json({ agent: createdAgent });
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    next(err);
  }
});

router.put('/:agentId', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { agentId } = req.params;
    const body = req.body || {};
    const {
      organizationId,
      teamId,
      agentType,
      agentName,
      description,
      promptTemplate,
      enabled = true,
      metadata,
    } = body;

    let extractedModelIds;
    try {
      extractedModelIds = extractModelIds(body);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(err.status).json({ error: err.message });
      }
      throw err;
    }

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    const pool = getPool();

    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    const existingAgent = await fetchAgentById(pool, agentId, organizationId);
    if (!existingAgent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const nextTeamId = teamId !== undefined ? (teamId || null) : existingAgent.teamId;

    if (nextTeamId) {
      const teamIsValid = await validateTeamBelongsToOrg(pool, organizationId, nextTeamId);
      if (!teamIsValid) {
        return res.status(404).json({ error: 'Team not found in organization' });
      }
    }

    // Check for duplicate agent_type if it's being changed
    if (agentType && agentType.trim() !== existingAgent.agentType) {
      const duplicateCheck = await pool.query(
        'SELECT id FROM agents WHERE agent_type = $1 AND organization_id = $2 AND ($3::text IS NULL OR team_id = $3) AND id != $4',
        [agentType.trim(), organizationId, nextTeamId || null, agentId],
      );

      if (duplicateCheck.rows.length > 0) {
        return res.status(409).json({ error: 'Agent type already exists in this scope' });
      }
    }

    const modelIdsToApply = extractedModelIds.provided ? extractedModelIds.modelIds : (existingAgent.modelIds || []);

    let sanitizedModelIds = [];
    try {
      sanitizedModelIds = await validateModelIds(pool, organizationId, nextTeamId || null, modelIdsToApply);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(err.status).json({ error: err.message });
      }
      throw err;
    }

    const metadataJSON = sanitizeJSON(metadata, {});

    await pool.query(
      `UPDATE agents
       SET
         agent_type = $1,
         agent_name = $2,
         description = $3,
         prompt_template = $4,
         team_id = $5,
         enabled = $6,
         metadata = $7,
         updated_at = NOW()
       WHERE id = $8 AND organization_id = $9`,
      [
        agentType ? agentType.trim() : existingAgent.agentType,
        agentName ? agentName.trim() : existingAgent.agentName,
        description?.trim() || null,
        promptTemplate ? promptTemplate.trim() : existingAgent.promptTemplate,
        nextTeamId || null,
        Boolean(enabled),
        metadataJSON,
        agentId,
        organizationId,
      ],
    );

    await replaceAgentModelMappings(pool, agentId, sanitizedModelIds);

    invalidateConfigCaches();

    const updatedAgent = await fetchAgentById(pool, agentId, organizationId);
    res.json({ agent: updatedAgent });
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    next(err);
  }
});

router.delete('/:agentId', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { agentId } = req.params;
    const { organizationId } = req.query;

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    const pool = getPool();

    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    const { rowCount } = await pool.query('DELETE FROM agents WHERE id = $1 AND organization_id = $2', [agentId, organizationId]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    invalidateConfigCaches();

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

