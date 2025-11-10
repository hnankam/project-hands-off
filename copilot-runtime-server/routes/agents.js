import express from 'express';
import { auth } from '../auth/index.js';
import { getPool } from '../config/database.js';
import { invalidateCache as invalidateDbCache } from '../config/db-loaders.js';
import { invalidateCache as invalidateLoaderCache } from '../config/loader.js';
import { log } from '../utils/logger.js';
import { syncTeamAssociations } from '../lib/team-helpers.js';

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

const validateModelIds = async (pool, organizationId, teamIds, modelIds) => {
  if (!modelIds || modelIds.length === 0) {
    return [];
  }

  // Query models with their team associations
  const { rows } = await pool.query(
    `
      SELECT 
        m.id::text AS id,
        COALESCE(
          (SELECT json_agg(mt.team_id)
           FROM model_teams mt 
           WHERE mt.model_id = m.id),
          '[]'::json
        ) as teams
      FROM models m
      WHERE m.id = ANY($1::uuid[])
        AND m.organization_id = $2
    `,
    [modelIds, organizationId],
  );

  if (rows.length !== modelIds.length) {
    throw new ValidationError('One or more selected models were not found for this organization');
  }

  // Validate scope constraints
  if (!teamIds || teamIds.length === 0) {
    // Organization-scoped agent: can only use org-wide models
    const invalid = rows.filter(row => row.teams && row.teams.length > 0);
    if (invalid.length > 0) {
      throw new ValidationError('Organization-scoped agents can only use organization-wide models');
    }
  } else {
    // Team-scoped agent: can use org-wide or models from selected teams
    const effectiveTeamIds = teamIds.filter(id => id);
    const invalid = rows.filter(row => {
      if (!row.teams || row.teams.length === 0) {
        // Org-wide model - OK
        return false;
      }
      // Model has team restrictions - must have at least one team in common
      return !row.teams.some(modelTeamId => effectiveTeamIds.includes(modelTeamId));
    });
    
    if (invalid.length > 0) {
      throw new ValidationError('One or more selected models are not available for the selected team(s)');
    }
  }

  return rows.map(row => row.id);
};

const extractToolIds = body => {
  if (!body || !Object.prototype.hasOwnProperty.call(body, 'toolIds')) {
    return { provided: false, toolIds: [] };
  }

  const rawValue = body.toolIds;
  if (rawValue == null) {
    return { provided: true, toolIds: [] };
  }

  if (!Array.isArray(rawValue)) {
    throw new ValidationError('toolIds must be an array of UUID strings');
  }

  const normalized = [];
  for (const value of rawValue) {
    if (typeof value !== 'string') {
      throw new ValidationError('toolIds must be an array of UUID strings');
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    if (!UUID_REGEX.test(trimmed)) {
      throw new ValidationError(`Invalid toolId: ${value}`);
    }
    if (!normalized.includes(trimmed)) {
      normalized.push(trimmed);
    }
  }

  return { provided: true, toolIds: normalized };
};

const validateToolIds = async (pool, organizationId, teamIds, toolIds) => {
  if (!toolIds || toolIds.length === 0) {
    return [];
  }

  // Query tools with their team associations
  // Use the same enabled logic as GET /api/admin/tools: check organization_tool_settings for global tools
  const { rows } = await pool.query(
    `
      SELECT 
        t.id::text AS id, 
        t.organization_id,
        COALESCE(
          (SELECT json_agg(tt.team_id)
           FROM tool_teams tt 
           WHERE tt.tool_id = t.id),
          '[]'::json
        ) as teams,
        CASE 
          WHEN t.organization_id IS NULL THEN 
            COALESCE(ots.enabled, t.enabled)
          ELSE 
            t.enabled
        END as effective_enabled
      FROM tools t
      LEFT JOIN organization_tool_settings ots ON ots.tool_id = t.id AND ots.organization_id = $2
      WHERE t.id = ANY($1::uuid[])
        AND (t.organization_id IS NULL OR t.organization_id = $2)
        AND (
          CASE 
            WHEN t.organization_id IS NULL THEN 
              COALESCE(ots.enabled, t.enabled)
            ELSE 
              t.enabled
          END
        ) = true
    `,
    [toolIds, organizationId],
  );

  if (rows.length !== toolIds.length) {
    const foundIds = rows.map(r => r.id);
    const missingIds = toolIds.filter(id => !foundIds.includes(id));
    throw new ValidationError(
      `One or more selected tools were not found for this scope. ` +
      `Requested: ${toolIds.length}, Found: ${rows.length}. ` +
      `Missing tool IDs: ${missingIds.join(', ')}`
    );
  }

  // Validate scope constraints
  if (!teamIds || teamIds.length === 0) {
    // Organization-scoped agent: can only use org-wide or global tools
    const invalid = rows.filter(row => row.teams && row.teams.length > 0);
    if (invalid.length > 0) {
      throw new ValidationError('Organization-scoped agents can only use organization-wide or global tools');
    }
  } else {
    // Team-scoped agent: can use org-wide, global, or tools from selected teams
    const effectiveTeamIds = teamIds.filter(id => id);
    const invalid = rows.filter(row => {
      if (!row.teams || row.teams.length === 0) {
        // Org-wide or global tool - OK
        return false;
      }
      // Tool has team restrictions - must have at least one team in common
      return !row.teams.some(toolTeamId => effectiveTeamIds.includes(toolTeamId));
    });
    
    if (invalid.length > 0) {
      throw new ValidationError('One or more selected tools are not available for the selected team(s)');
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

const replaceAgentToolMappings = async (pool, agentId, toolIds) => {
  await pool.query('DELETE FROM agent_tool_mappings WHERE agent_id = $1', [agentId]);

  if (!toolIds || toolIds.length === 0) {
    return;
  }

  await pool.query(
    `
      INSERT INTO agent_tool_mappings (agent_id, tool_id)
      SELECT $1, id
      FROM UNNEST($2::uuid[]) AS id
    `,
    [agentId, toolIds],
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
  teams: row.teams || [], // Array of {id, name} objects from the view
  metadata: row.metadata || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  modelIds: Array.isArray(row.model_ids) ? row.model_ids.filter(Boolean) : [],
  toolIds: Array.isArray(row.tool_ids) ? row.tool_ids.filter(Boolean) : [],
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
       a.id, a.agent_type, a.agent_name, a.description, a.prompt_template,
       a.enabled, a.organization_id, a.metadata, a.created_at, a.updated_at,
       COALESCE(
         (SELECT json_agg(json_build_object('id', team.id, 'name', team.name) ORDER BY team.name)
          FROM agent_teams at
          JOIN team ON team.id = at.team_id
          WHERE at.agent_id = a.id
            AND team."organizationId" = $2),
         '[]'::json
       ) as teams,
       COALESCE(
         (SELECT array_agg(amm.model_id::text)
          FROM agent_model_mappings amm
          WHERE amm.agent_id = a.id),
         '{}'::text[]
       ) AS model_ids,
       COALESCE(
         (SELECT array_agg(atm.tool_id::text)
          FROM agent_tool_mappings atm
          WHERE atm.agent_id = a.id),
         '{}'::text[]
       ) AS tool_ids
     FROM agents a
     WHERE a.id = $1 AND a.organization_id = $2`,
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

    const { organizationId, teamIds: teamIdsParam = null } = req.query;
    // Handle both single teamIds param and array of teamIds params
    const teamIds = Array.isArray(teamIdsParam) ? teamIdsParam : (teamIdsParam ? [teamIdsParam] : []);

    const pool = getPool();
    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    const params = [organizationId];
    let teamFilter = '';
    
    // If teamIds are specified, filter to show only agents that:
    // 1. Are organization-wide (no team restrictions), OR
    // 2. Include at least one of the specified teams
    if (teamIds.length > 0) {
      teamFilter = `
        AND (
          NOT EXISTS (SELECT 1 FROM agent_teams at WHERE at.agent_id = a.id)
          OR EXISTS (
            SELECT 1 FROM agent_teams at 
            WHERE at.agent_id = a.id AND at.team_id = ANY($2::text[])
          )
        )
      `;
      params.push(teamIds);
    }

    // Get all agents for the organization with their teams (filtered by org and optionally by team)
    const { rows } = await pool.query(
      `SELECT 
         a.id, a.agent_type, a.agent_name, a.description, a.prompt_template,
         a.enabled, a.organization_id, a.metadata, a.created_at, a.updated_at,
         COALESCE(
           (SELECT json_agg(json_build_object('id', team.id, 'name', team.name) ORDER BY team.name)
            FROM agent_teams at
            JOIN team ON team.id = at.team_id
            WHERE at.agent_id = a.id
              AND team."organizationId" = $1),
           '[]'::json
         ) as teams,
         COALESCE(
           (SELECT array_agg(amm.model_id::text)
            FROM agent_model_mappings amm
            WHERE amm.agent_id = a.id),
           '{}'::text[]
         ) AS model_ids,
         COALESCE(
           (SELECT array_agg(atm.tool_id::text)
            FROM agent_tool_mappings atm
            WHERE atm.agent_id = a.id),
           '{}'::text[]
         ) AS tool_ids
       FROM agents a
       WHERE a.organization_id = $1
         ${teamFilter}
       ORDER BY a.created_at DESC`,
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
      teamIds = [], // Array of team IDs for multi-team support
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

    let extractedToolIds;
    try {
      extractedToolIds = extractToolIds(req.body);
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

    // Validate teams if provided
    if (teamIds.length > 0) {
      // Deduplicate team IDs for validation
      const uniqueTeamIds = Array.from(new Set(teamIds));
      const { rows } = await pool.query(
        'SELECT id FROM team WHERE id = ANY($1::text[]) AND "organizationId" = $2',
        [uniqueTeamIds, organizationId],
      );
      if (rows.length !== uniqueTeamIds.length) {
        return res.status(404).json({ error: 'One or more teams not found in organization' });
      }
    }

    // Check for duplicate agent_type in organization
    const duplicateCheck = await pool.query(
      'SELECT id FROM agents WHERE agent_type = $1 AND organization_id = $2',
      [agentType.trim(), organizationId],
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Agent type already exists in this organization' });
    }

    let sanitizedModelIds = [];
    try {
      sanitizedModelIds = await validateModelIds(pool, organizationId, teamIds, extractedModelIds.modelIds);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(err.status).json({ error: err.message });
      }
      throw err;
    }

    let sanitizedToolIds = [];
    try {
      sanitizedToolIds = await validateToolIds(pool, organizationId, teamIds, extractedToolIds.toolIds);
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
         enabled,
         metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        agentType.trim(),
        agentName.trim(),
        description?.trim() || null,
        promptTemplate.trim(),
        organizationId,
        Boolean(enabled),
        metadataJSON,
      ],
    );

    const agentId = insertResult.rows[0].id;

    // Associate with teams if provided
    if (teamIds.length > 0) {
      await syncTeamAssociations(pool, 'agent_teams', 'agent_id', agentId, teamIds);
    }

    await replaceAgentModelMappings(pool, agentId, sanitizedModelIds);
    if (extractedToolIds.provided) {
      await replaceAgentToolMappings(pool, agentId, sanitizedToolIds);
    }

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
      teamIds = [], // Array of team IDs for multi-team support
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

    let extractedToolIds;
    try {
      extractedToolIds = extractToolIds(body);
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

    // Validate teams if provided
    if (teamIds.length > 0) {
      // Deduplicate team IDs for validation
      const uniqueTeamIds = Array.from(new Set(teamIds));
      const { rows } = await pool.query(
        'SELECT id FROM team WHERE id = ANY($1::text[]) AND "organizationId" = $2',
        [uniqueTeamIds, organizationId],
      );
      if (rows.length !== uniqueTeamIds.length) {
        return res.status(404).json({ error: 'One or more teams not found in organization' });
      }
    }

    const existingAgent = await fetchAgentById(pool, agentId, organizationId);
    if (!existingAgent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Check for duplicate agent_type if it's being changed
    if (agentType && agentType.trim() !== existingAgent.agentType) {
      const duplicateCheck = await pool.query(
        'SELECT id FROM agents WHERE agent_type = $1 AND organization_id = $2 AND id != $3',
        [agentType.trim(), organizationId, agentId],
      );

      if (duplicateCheck.rows.length > 0) {
        return res.status(409).json({ error: 'Agent type already exists in this organization' });
      }
    }

    const modelIdsToApply = extractedModelIds.provided ? extractedModelIds.modelIds : (existingAgent.modelIds || []);
    const toolIdsToApply = extractedToolIds.provided ? extractedToolIds.toolIds : (existingAgent.toolIds || []);

    let sanitizedModelIds = [];
    try {
      sanitizedModelIds = await validateModelIds(pool, organizationId, teamIds, modelIdsToApply);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(err.status).json({ error: err.message });
      }
      throw err;
    }

    let sanitizedToolIds = [];
    try {
      sanitizedToolIds = await validateToolIds(pool, organizationId, teamIds, toolIdsToApply);
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
         enabled = $5,
         metadata = $6,
         updated_at = NOW()
       WHERE id = $7 AND organization_id = $8`,
      [
        agentType ? agentType.trim() : existingAgent.agentType,
        agentName ? agentName.trim() : existingAgent.agentName,
        description?.trim() || null,
        promptTemplate ? promptTemplate.trim() : existingAgent.promptTemplate,
        Boolean(enabled),
        metadataJSON,
        agentId,
        organizationId,
      ],
    );

    // Update team associations (always sync when teamIds is provided in request)
    if (teamIds !== undefined) {
      await syncTeamAssociations(pool, 'agent_teams', 'agent_id', agentId, teamIds);
    }

    await replaceAgentModelMappings(pool, agentId, sanitizedModelIds);
    await replaceAgentToolMappings(pool, agentId, sanitizedToolIds);

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

