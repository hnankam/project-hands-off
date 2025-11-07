import express from 'express';
import { auth } from '../auth/index.js';
import { getPool } from '../config/database.js';
import { log } from '../utils/logger.js';

const router = express.Router();

const RANGE_PRESETS = {
  '1h': { label: 'Last hour', durationMs: 60 * 60 * 1000, bucket: 'minute', minBuckets: 12 },
  '24h': { label: 'Last 24 hours', durationMs: 24 * 60 * 60 * 1000, bucket: 'hour', minBuckets: 12 },
  '7d': { label: 'Last 7 days', durationMs: 7 * 24 * 60 * 60 * 1000, bucket: 'day', minBuckets: 7 },
  '30d': { label: 'Last 30 days', durationMs: 30 * 24 * 60 * 60 * 1000, bucket: 'day', minBuckets: 10 },
  '90d': { label: 'Last 90 days', durationMs: 90 * 24 * 60 * 60 * 1000, bucket: 'day', minBuckets: 10 },
  all: { label: 'All time', durationMs: null, bucket: 'day', minBuckets: 12 },
};

const RANGE_OPTIONS = Object.entries(RANGE_PRESETS).map(([value, config]) => ({
  value,
  label: config.label,
}));

const parseRoleValue = roleValue => {
  if (!roleValue) {
    return [];
  }
  if (Array.isArray(roleValue)) {
    return roleValue.filter(Boolean);
  }
  if (typeof roleValue === 'string') {
    try {
      const parsed = JSON.parse(roleValue);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean);
      }
    } catch {
      // ignore - not JSON encoded
    }
    return roleValue ? [roleValue] : [];
  }
  return [];
};

async function resolveActiveContext(pool, session) {
  if (!session?.session) {
    return { organizationId: null, teamId: null };
  }

  let organizationId = session.session.activeOrganizationId || null;
  let teamId = session.session.activeTeamId || null;

  if (!organizationId && session.session.id) {
    try {
      const { rows } = await pool.query(
        'SELECT "activeOrganizationId", "activeTeamId" FROM session WHERE id = $1 LIMIT 1',
        [session.session.id],
      );
      if (rows.length > 0) {
        organizationId = rows[0].activeOrganizationId || organizationId;
        teamId = rows[0].activeTeamId || teamId;
      }
    } catch (err) {
      console.warn('[Usage API] Failed to resolve active context from session row:', err.message);
    }
  }

  return { organizationId, teamId };
}

async function fetchMemberRoles(pool, organizationId, userId) {
  const { rows } = await pool.query(
    'SELECT role FROM member WHERE "organizationId" = $1 AND "userId" = $2 LIMIT 1',
    [organizationId, userId],
  );

  if (rows.length === 0) {
    return [];
  }

  return parseRoleValue(rows[0].role);
}

async function fetchTeamsForScope(pool, organizationId, userId, role) {
  if (!organizationId) {
    return [];
  }

  if (role === 'owner') {
    const { rows } = await pool.query(
      'SELECT id::text AS id, name FROM team WHERE "organizationId" = $1 ORDER BY name ASC',
      [organizationId],
    );
    return rows;
  }

  const { rows } = await pool.query(
    `
      SELECT t.id::text AS id, t.name
      FROM team t
      INNER JOIN "teamMember" tm ON tm."teamId" = t.id
      WHERE t."organizationId" = $1
        AND tm."userId" = $2
      ORDER BY t.name ASC
    `,
    [organizationId, userId],
  );
  return rows;
}

async function fetchAgentsForScope(pool, organizationId, accessibleTeamIds, role) {
  if (!organizationId) {
    return [];
  }

  if (role === 'owner') {
    const { rows } = await pool.query(
      `
        SELECT id::text AS id,
               agent_name AS name,
               agent_type AS code,
               COALESCE(team_id::text, NULL) AS team_id
        FROM agents
        WHERE organization_id = $1
        ORDER BY agent_name ASC
      `,
      [organizationId],
    );
    return rows;
  }

  if (!accessibleTeamIds || accessibleTeamIds.length === 0) {
    return [];
  }

  const params = [organizationId, accessibleTeamIds];
  const { rows } = await pool.query(
    `
      SELECT id::text AS id,
             agent_name AS name,
             agent_type AS code,
             COALESCE(team_id::text, NULL) AS team_id
      FROM agents
      WHERE organization_id = $1
        AND (team_id IS NULL OR team_id::text = ANY($2::text[]))
      ORDER BY agent_name ASC
    `,
    params,
  );

  return rows;
}

async function fetchModelsForScope(pool, organizationId, accessibleTeamIds, role) {
  if (!organizationId) {
    return [];
  }

  if (role === 'owner') {
    const { rows } = await pool.query(
      `
        SELECT m.id::text AS id,
               COALESCE(m.display_name, m.model_name, m.model_key) AS name,
               m.model_key AS code,
               p.provider_type AS provider,
               COALESCE(m.team_id::text, NULL) AS team_id
        FROM models m
        LEFT JOIN providers p ON p.id = m.provider_id
        WHERE m.organization_id = $1
        ORDER BY name ASC
      `,
      [organizationId],
    );
    return rows;
  }

  if (!accessibleTeamIds || accessibleTeamIds.length === 0) {
    return [];
  }

  const params = [organizationId, accessibleTeamIds];
  const { rows } = await pool.query(
    `
      SELECT m.id::text AS id,
             COALESCE(m.display_name, m.model_name, m.model_key) AS name,
             m.model_key AS code,
             p.provider_type AS provider,
             COALESCE(m.team_id::text, NULL) AS team_id
      FROM models m
      LEFT JOIN providers p ON p.id = m.provider_id
      WHERE m.organization_id = $1
        AND (m.team_id IS NULL OR m.team_id::text = ANY($2::text[]))
      ORDER BY name ASC
    `,
    params,
  );
  return rows;
}

async function fetchUsersForScope(pool, organizationId, teamIds, role, activeUserId) {
  if (!organizationId) {
    return [];
  }

  // Members can only see themselves
  if (role === 'member') {
    const { rows } = await pool.query(
      `
        SELECT
          u.id::text AS id,
          COALESCE(NULLIF(u.name, ''), NULLIF(u.email, ''), u.id::text) AS label
        FROM "user" u
        WHERE u.id = $1
      `,
      [activeUserId],
    );
    return rows;
  }

  if (role === 'owner') {
    const { rows } = await pool.query(
      `
        SELECT
          u.id::text AS id,
          COALESCE(NULLIF(u.name, ''), NULLIF(u.email, ''), u.id::text) AS label
        FROM "user" u
        INNER JOIN member m ON m."userId" = u.id
        WHERE m."organizationId" = $1
        ORDER BY label ASC
      `,
      [organizationId],
    );
    return rows;
  }

  // Admin role
  if (!teamIds || teamIds.length === 0) {
    const { rows } = await pool.query(
      `
        SELECT
          u.id::text AS id,
          COALESCE(NULLIF(u.name, ''), NULLIF(u.email, ''), u.id::text) AS label
        FROM "user" u
        WHERE u.id = $1
      `,
      [activeUserId],
    );
    return rows;
  }

  const params = [teamIds, organizationId];
  const { rows } = await pool.query(
    `
      SELECT DISTINCT
        u.id::text AS id,
        COALESCE(NULLIF(u.name, ''), NULLIF(u.email, ''), u.id::text) AS label
      FROM "user" u
      INNER JOIN "teamMember" tm ON tm."userId" = u.id
      INNER JOIN team t ON t.id = tm."teamId"
      WHERE tm."teamId"::text = ANY($1::text[])
        AND t."organizationId" = $2
      ORDER BY label ASC
    `,
    params,
  );

  return rows;
}

function resolveRangeConfig(rangeKey) {
  const normalized = (rangeKey || '').toLowerCase();
  if (RANGE_PRESETS[normalized]) {
    return { key: normalized, ...RANGE_PRESETS[normalized] };
  }
  return { key: '24h', ...RANGE_PRESETS['24h'] };
}

function buildUsageConditions({
  organizationId,
  startDate,
  teamId,
  userId,
  agentId,
  modelId,
  includeOrgLevelWithTeam = true,
  paramOffset = 0,
}) {
  const params = [];
  const clauses = [];

  if (organizationId) {
    params.push(organizationId);
    clauses.push(`u.organization_id = $${params.length + paramOffset}`);
  } else {
    clauses.push('u.organization_id IS NULL');
  }

  if (startDate) {
    params.push(startDate.toISOString());
    clauses.push(`u.created_at >= $${params.length + paramOffset}`);
  }

  if (teamId) {
    params.push(teamId);
    const placeholder = `$${params.length + paramOffset}`;
    if (includeOrgLevelWithTeam) {
      clauses.push(`(u.team_id = ${placeholder} OR u.team_id IS NULL)`);
    } else {
      clauses.push(`u.team_id = ${placeholder}`);
    }
  }

  if (userId) {
    params.push(userId);
    clauses.push(`u.user_id = $${params.length + paramOffset}`);
  }

  if (agentId) {
    params.push(agentId);
    clauses.push(`u.agent_id = $${params.length + paramOffset}`);
  }

  if (modelId) {
    params.push(modelId);
    clauses.push(`u.model_id = $${params.length + paramOffset}`);
  }

  return {
    clause: clauses.length ? clauses.join(' AND ') : 'TRUE',
    params,
  };
}

function mapBreakdownRow(row) {
  return {
    id: row.id,
    label: row.label,
    requestTokens: Number(row.request_tokens) || 0,
    responseTokens: Number(row.response_tokens) || 0,
    totalTokens: Number(row.total_tokens) || 0,
    count: Number(row.call_count) || 0,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session || !session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const pool = getPool();
    const userId = session.user.id;
    
    // Check if organizationId is provided in query params (for admin filtering)
    const requestedOrgId = typeof req.query.organizationId === 'string' ? req.query.organizationId.trim() : '';
    
    // Get the active context from session as fallback
    const { organizationId: sessionOrgId, teamId: sessionTeamId } = await resolveActiveContext(pool, session);
    
    // Use requested org if provided and user has access, otherwise use session org
    let organizationId = sessionOrgId;
    
    if (requestedOrgId) {
      // Check if user has access to the requested organization
      const requestedOrgRoles = await fetchMemberRoles(pool, requestedOrgId, userId);
      if (requestedOrgRoles.length > 0) {
        organizationId = requestedOrgId;
      } else {
        return res.status(403).json({ error: 'Forbidden: not a member of requested organization' });
      }
    }

    if (!organizationId) {
      return res.status(400).json({ error: 'No active organization in session' });
    }

    const roles = await fetchMemberRoles(pool, organizationId, userId);
    if (roles.length === 0) {
      return res.status(403).json({ error: 'Forbidden: not a member of this organization' });
    }

    const role = roles.includes('owner') ? 'owner' : roles.includes('admin') ? 'admin' : 'member';

    const rangeConfig = resolveRangeConfig(req.query.range);
    const startDate =
      rangeConfig.durationMs != null ? new Date(Date.now() - rangeConfig.durationMs) : null;

    const accessibleTeams = await fetchTeamsForScope(pool, organizationId, userId, role);
    const accessibleTeamIds = accessibleTeams.map(team => team.id);

    const accessibleAgents = await fetchAgentsForScope(
      pool,
      organizationId,
      accessibleTeamIds,
      role,
    );

    const accessibleModels = await fetchModelsForScope(
      pool,
      organizationId,
      accessibleTeamIds,
      role,
    );

    const accessibleUsers = await fetchUsersForScope(
      pool,
      organizationId,
      role === 'owner' ? null : accessibleTeamIds.length ? accessibleTeamIds : null,
      role,
      userId,
    );

    const requestedTeamId = typeof req.query.teamId === 'string' ? req.query.teamId.trim() : '';
    const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
    const requestedAgentId = typeof req.query.agentId === 'string' ? req.query.agentId.trim() : '';
    const requestedModelId = typeof req.query.modelId === 'string' ? req.query.modelId.trim() : '';

    let effectiveTeamId = null;
    let includeOrgLevelWithTeam = true;

    if (role === 'owner') {
      if (requestedTeamId && requestedTeamId !== 'all') {
        if (!accessibleTeams.some(team => team.id === requestedTeamId)) {
          return res.status(404).json({ error: 'Team not found in organization' });
        }
        effectiveTeamId = requestedTeamId;
      }
    } else if (role === 'admin') {
      const fallbackTeamId = sessionTeamId || accessibleTeamIds[0] || null;
      const candidateTeamId =
        requestedTeamId && requestedTeamId !== 'all' ? requestedTeamId : fallbackTeamId;

      if (!candidateTeamId) {
        return res.status(403).json({ error: 'Team scope required for admin role' });
      }

      if (!accessibleTeamIds.includes(candidateTeamId)) {
        return res.status(403).json({ error: 'Forbidden: cannot access requested team' });
      }

      effectiveTeamId = candidateTeamId;
    } else {
      effectiveTeamId = null;
    }

    let effectiveUserId = null;
    if (role === 'owner') {
      if (requestedUserId && requestedUserId !== 'all') {
        if (!accessibleUsers.some(user => user.id === requestedUserId)) {
          return res.status(404).json({ error: 'User not found in organization' });
        }
        effectiveUserId = requestedUserId;
      }
    } else if (role === 'admin') {
      if (requestedUserId && requestedUserId !== 'all') {
        if (!accessibleUsers.some(user => user.id === requestedUserId)) {
          return res.status(403).json({ error: 'Forbidden: cannot access requested user' });
        }
        effectiveUserId = requestedUserId;
      }
    } else {
      effectiveUserId = userId;
    }

    let effectiveAgentId = null;
    if (requestedAgentId) {
      const canAccessAgent =
        role === 'owner'
          ? accessibleAgents.some(agent => agent.id === requestedAgentId)
          : accessibleAgents.some(agent => agent.id === requestedAgentId);
      if (!canAccessAgent) {
        return res.status(403).json({ error: 'Forbidden: cannot access requested agent' });
      }
      effectiveAgentId = requestedAgentId;
    }

    let effectiveModelId = null;
    if (requestedModelId) {
      const canAccessModel =
        role === 'owner'
          ? accessibleModels.some(model => model.id === requestedModelId)
          : accessibleModels.some(model => model.id === requestedModelId);
      if (!canAccessModel) {
        return res.status(403).json({ error: 'Forbidden: cannot access requested model' });
      }
      effectiveModelId = requestedModelId;
    }

    const { clause, params } = buildUsageConditions({
      organizationId,
      startDate,
      teamId: effectiveTeamId,
      userId: effectiveUserId,
      agentId: effectiveAgentId,
      modelId: effectiveModelId,
      includeOrgLevelWithTeam,
    });
    const whereClause = `WHERE ${clause}`;

    // For timeseries, we need offset parameters since $1 is the bucket
    const { clause: timeseriesClause, params: timeseriesParams } = buildUsageConditions({
      organizationId,
      startDate,
      teamId: effectiveTeamId,
      userId: effectiveUserId,
      agentId: effectiveAgentId,
      modelId: effectiveModelId,
      includeOrgLevelWithTeam,
      paramOffset: 1,
    });
    const timeseriesWhereClause = `WHERE ${timeseriesClause}`;

    const summaryPromise = pool.query(
      `
        SELECT
          COALESCE(SUM(u.request_tokens), 0) AS request_tokens,
          COALESCE(SUM(u.response_tokens), 0) AS response_tokens,
          COALESCE(SUM(u.request_tokens + u.response_tokens), 0) AS total_tokens,
          COUNT(*) AS call_count,
          COALESCE(SUM(u.cost), 0) AS total_cost,
          COALESCE(AVG(u.request_tokens + u.response_tokens), 0) AS avg_tokens
        FROM usage u
        ${whereClause}
      `,
      params,
    );

    const timeseriesPromise = pool.query(
      `
        SELECT
          date_trunc($1, u.created_at) AS bucket,
          SUM(u.request_tokens) AS request_tokens,
          SUM(u.response_tokens) AS response_tokens,
          SUM(u.request_tokens + u.response_tokens) AS total_tokens,
          COUNT(*) AS call_count
        FROM usage u
        ${timeseriesWhereClause}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
      [rangeConfig.bucket, ...timeseriesParams],
    );

    const modelsPromise = pool.query(
      `
        SELECT
          COALESCE(m.id::text, u.model_id::text, 'unknown') AS id,
          COALESCE(NULLIF(m.display_name, ''), m.model_name, m.model_key, u.model_id::text, 'Unspecified model') AS label,
          SUM(u.request_tokens) AS request_tokens,
          SUM(u.response_tokens) AS response_tokens,
          SUM(u.request_tokens + u.response_tokens) AS total_tokens,
          COUNT(*) AS call_count
        FROM usage u
        LEFT JOIN models m ON m.id = u.model_id
        ${whereClause}
        GROUP BY m.id, m.display_name, m.model_name, m.model_key, u.model_id
        ORDER BY total_tokens DESC
        LIMIT 10
      `,
      params,
    );

    const agentsPromise = pool.query(
      `
        SELECT
          COALESCE(a.id::text, u.agent_id::text, 'unknown') AS id,
          COALESCE(NULLIF(a.agent_name, ''), a.agent_type, u.agent_id::text, 'Unspecified agent') AS label,
          SUM(u.request_tokens) AS request_tokens,
          SUM(u.response_tokens) AS response_tokens,
          SUM(u.request_tokens + u.response_tokens) AS total_tokens,
          COUNT(*) AS call_count
        FROM usage u
        LEFT JOIN agents a ON a.id = u.agent_id
        ${whereClause}
        GROUP BY a.id, a.agent_name, a.agent_type, u.agent_id
        ORDER BY total_tokens DESC
        LIMIT 10
      `,
      params,
    );

    const teamsPromise = pool.query(
      `
        SELECT
          COALESCE(t.id::text, 'organization') AS id,
          COALESCE(t.name, 'Organization-wide') AS label,
          SUM(u.request_tokens) AS request_tokens,
          SUM(u.response_tokens) AS response_tokens,
          SUM(u.request_tokens + u.response_tokens) AS total_tokens,
          COUNT(*) AS call_count
        FROM usage u
        LEFT JOIN team t ON t.id = u.team_id
        ${whereClause}
        GROUP BY t.id, t.name
        ORDER BY total_tokens DESC
        LIMIT 10
      `,
      params,
    );

    const usersPromise = pool.query(
      `
        SELECT
          COALESCE(u2.id::text, u.user_id::text, 'unknown') AS id,
          COALESCE(NULLIF(u2.name, ''), NULLIF(u2.email, ''), u.user_id::text, 'Unspecified user') AS label,
          SUM(u.request_tokens) AS request_tokens,
          SUM(u.response_tokens) AS response_tokens,
          SUM(u.request_tokens + u.response_tokens) AS total_tokens,
          COUNT(*) AS call_count
        FROM usage u
        LEFT JOIN "user" u2 ON u2.id = u.user_id
        ${whereClause}
        GROUP BY u2.id, u2.name, u2.email, u.user_id
        ORDER BY total_tokens DESC
        LIMIT 10
      `,
      params,
    );

    // Parse pagination parameters
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const offset = (page - 1) * limit;

    // Get total count for pagination
    const countPromise = pool.query(
      `
        SELECT COUNT(*) as total
        FROM usage u
        ${whereClause}
      `,
      params,
    );

    const recentPromise = pool.query(
      `
        SELECT
          u.id,
          u.session_id,
          u.created_at,
          COALESCE(a.agent_name, a.agent_type, u.agent_id::text) AS agent_label,
          COALESCE(m.display_name, m.model_name, m.model_key, u.model_id::text) AS model_label,
          COALESCE(t.name, 'Organization') AS team_label,
          COALESCE(u2.name, u2.email, u.user_id::text) AS user_label,
          u.request_tokens,
          u.response_tokens,
          COALESCE(u.request_tokens, 0) + COALESCE(u.response_tokens, 0) AS total_tokens,
          u.cost,
          u.status
        FROM usage u
        LEFT JOIN agents a ON a.id = u.agent_id
        LEFT JOIN models m ON m.id = u.model_id
        LEFT JOIN team t ON t.id = u.team_id
        LEFT JOIN "user" u2 ON u2.id = u.user_id
        ${whereClause}
        ORDER BY u.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset],
    );

    const [
      summaryResult,
      timeseriesResult,
      modelsResult,
      agentsResult,
      teamsResult,
      usersResult,
      countResult,
      recentResult,
    ] = await Promise.all([
      summaryPromise,
      timeseriesPromise,
      modelsPromise,
      agentsPromise,
      teamsPromise,
      usersPromise,
      countPromise,
      recentPromise,
    ]);

    let modelsTimeseriesRows = [];
    if (modelsResult.rows.length > 0) {
      const topModelIds = modelsResult.rows.map(row => row.id);

      const modelsTimeseriesResult = await pool.query(
        `
          SELECT
            date_trunc($1, u.created_at) AS bucket,
            COALESCE(m.id::text, u.model_id::text, 'unknown') AS model_id,
            COALESCE(NULLIF(m.display_name, ''), m.model_name, m.model_key, u.model_id::text, 'Unspecified model') AS label,
            SUM(u.request_tokens) AS request_tokens,
            SUM(u.response_tokens) AS response_tokens,
            SUM(u.request_tokens + u.response_tokens) AS total_tokens
          FROM usage u
          LEFT JOIN models m ON m.id = u.model_id
          ${timeseriesWhereClause}
            AND COALESCE(m.id::text, u.model_id::text, 'unknown') = ANY($${timeseriesParams.length + 2})
          GROUP BY bucket, m.id, m.display_name, m.model_name, m.model_key, u.model_id
          ORDER BY bucket ASC
        `,
        [rangeConfig.bucket, ...timeseriesParams, topModelIds],
      );

      modelsTimeseriesRows = modelsTimeseriesResult.rows;
    }

    const modelsTimeseriesMap = new Map();
    for (const row of modelsTimeseriesRows) {
      const modelId = row.model_id;
      if (!modelsTimeseriesMap.has(modelId)) {
        modelsTimeseriesMap.set(modelId, {
          id: modelId,
          label: row.label,
          points: [],
        });
      }

      modelsTimeseriesMap.get(modelId).points.push({
        bucket: row.bucket,
        requestTokens: Number(row.request_tokens) || 0,
        responseTokens: Number(row.response_tokens) || 0,
        totalTokens: Number(row.total_tokens) || 0,
      });
    }

    const modelsTimeseries = Array.from(modelsTimeseriesMap.values()).map(series => ({
      ...series,
      points: series.points.sort((a, b) => new Date(a.bucket) - new Date(b.bucket)),
    }));

    // Build agents timeseries
    let agentsTimeseriesRows = [];
    if (agentsResult.rows.length > 0) {
      const topAgentIds = agentsResult.rows.map(row => row.id);

      const agentsTimeseriesResult = await pool.query(
        `
          SELECT
            date_trunc($1, u.created_at) AS bucket,
            COALESCE(a.id::text, u.agent_id::text, 'unknown') AS agent_id,
            COALESCE(NULLIF(a.agent_name, ''), a.agent_type, u.agent_id::text, 'Unspecified agent') AS label,
            SUM(u.request_tokens) AS request_tokens,
            SUM(u.response_tokens) AS response_tokens,
            SUM(u.request_tokens + u.response_tokens) AS total_tokens
          FROM usage u
          LEFT JOIN agents a ON a.id = u.agent_id
          ${timeseriesWhereClause}
            AND COALESCE(a.id::text, u.agent_id::text, 'unknown') = ANY($${timeseriesParams.length + 2})
          GROUP BY bucket, a.id, a.agent_name, a.agent_type, u.agent_id
          ORDER BY bucket ASC
        `,
        [rangeConfig.bucket, ...timeseriesParams, topAgentIds],
      );

      agentsTimeseriesRows = agentsTimeseriesResult.rows;
    }

    const agentsTimeseriesMap = new Map();
    for (const row of agentsTimeseriesRows) {
      const agentId = row.agent_id;
      if (!agentsTimeseriesMap.has(agentId)) {
        agentsTimeseriesMap.set(agentId, {
          id: agentId,
          label: row.label,
          points: [],
        });
      }

      agentsTimeseriesMap.get(agentId).points.push({
        bucket: row.bucket,
        requestTokens: Number(row.request_tokens) || 0,
        responseTokens: Number(row.response_tokens) || 0,
        totalTokens: Number(row.total_tokens) || 0,
      });
    }

    const agentsTimeseries = Array.from(agentsTimeseriesMap.values()).map(series => ({
      ...series,
      points: series.points.sort((a, b) => new Date(a.bucket) - new Date(b.bucket)),
    }));

    // Build teams timeseries
    let teamsTimeseriesRows = [];
    if (teamsResult.rows.length > 0) {
      const topTeamIds = teamsResult.rows.map(row => row.id);

      const teamsTimeseriesResult = await pool.query(
        `
          SELECT
            date_trunc($1, u.created_at) AS bucket,
            COALESCE(t.id::text, 'organization') AS team_id,
            COALESCE(t.name, 'Organization-wide') AS label,
            SUM(u.request_tokens) AS request_tokens,
            SUM(u.response_tokens) AS response_tokens,
            SUM(u.request_tokens + u.response_tokens) AS total_tokens
          FROM usage u
          LEFT JOIN team t ON t.id = u.team_id
          ${timeseriesWhereClause}
            AND COALESCE(t.id::text, 'organization') = ANY($${timeseriesParams.length + 2})
          GROUP BY bucket, t.id, t.name
          ORDER BY bucket ASC
        `,
        [rangeConfig.bucket, ...timeseriesParams, topTeamIds],
      );

      teamsTimeseriesRows = teamsTimeseriesResult.rows;
    }

    const teamsTimeseriesMap = new Map();
    for (const row of teamsTimeseriesRows) {
      const teamId = row.team_id;
      if (!teamsTimeseriesMap.has(teamId)) {
        teamsTimeseriesMap.set(teamId, {
          id: teamId,
          label: row.label,
          points: [],
        });
      }

      teamsTimeseriesMap.get(teamId).points.push({
        bucket: row.bucket,
        requestTokens: Number(row.request_tokens) || 0,
        responseTokens: Number(row.response_tokens) || 0,
        totalTokens: Number(row.total_tokens) || 0,
      });
    }

    const teamsTimeseries = Array.from(teamsTimeseriesMap.values()).map(series => ({
      ...series,
      points: series.points.sort((a, b) => new Date(a.bucket) - new Date(b.bucket)),
    }));

    // Build users timeseries
    let usersTimeseriesRows = [];
    if (usersResult.rows.length > 0) {
      const topUserIds = usersResult.rows.map(row => row.id);

      const usersTimeseriesResult = await pool.query(
        `
          SELECT
            date_trunc($1, u.created_at) AS bucket,
            COALESCE(u2.id::text, u.user_id::text, 'unknown') AS user_id,
            COALESCE(NULLIF(u2.name, ''), NULLIF(u2.email, ''), u.user_id::text, 'Unspecified user') AS label,
            SUM(u.request_tokens) AS request_tokens,
            SUM(u.response_tokens) AS response_tokens,
            SUM(u.request_tokens + u.response_tokens) AS total_tokens
          FROM usage u
          LEFT JOIN "user" u2 ON u2.id = u.user_id
          ${timeseriesWhereClause}
            AND COALESCE(u2.id::text, u.user_id::text, 'unknown') = ANY($${timeseriesParams.length + 2})
          GROUP BY bucket, u2.id, u2.name, u2.email, u.user_id
          ORDER BY bucket ASC
        `,
        [rangeConfig.bucket, ...timeseriesParams, topUserIds],
      );

      usersTimeseriesRows = usersTimeseriesResult.rows;
    }

    const usersTimeseriesMap = new Map();
    for (const row of usersTimeseriesRows) {
      const userId = row.user_id;
      if (!usersTimeseriesMap.has(userId)) {
        usersTimeseriesMap.set(userId, {
          id: userId,
          label: row.label,
          points: [],
        });
      }

      usersTimeseriesMap.get(userId).points.push({
        bucket: row.bucket,
        requestTokens: Number(row.request_tokens) || 0,
        responseTokens: Number(row.response_tokens) || 0,
        totalTokens: Number(row.total_tokens) || 0,
      });
    }

    const usersTimeseries = Array.from(usersTimeseriesMap.values()).map(series => ({
      ...series,
      points: series.points.sort((a, b) => new Date(a.bucket) - new Date(b.bucket)),
    }));

    const summaryRow = summaryResult.rows[0] || {};

    const responsePayload = {
      scope: {
        role,
        organizationId,
        enforcedTeamId: effectiveTeamId,
        enforcedUserId: role === 'member' ? userId : null,
      },
      filters: {
        range: {
          options: RANGE_OPTIONS,
          selected: rangeConfig.key,
        },
        teams: {
          options: accessibleTeams,
          selected: effectiveTeamId,
        },
        users: {
          options: accessibleUsers,
          selected: effectiveUserId,
        },
        agents: {
          options: accessibleAgents,
          selected: effectiveAgentId,
        },
        models: {
          options: accessibleModels,
          selected: effectiveModelId,
        },
      },
      summary: {
        requestTokens: Number(summaryRow.request_tokens) || 0,
        responseTokens: Number(summaryRow.response_tokens) || 0,
        totalTokens: Number(summaryRow.total_tokens) || 0,
        callCount: Number(summaryRow.call_count) || 0,
        totalCost: Number(summaryRow.total_cost) || 0,
        avgTokens: Number(summaryRow.avg_tokens) || 0,
      },
      timeseries: timeseriesResult.rows.map(row => ({
        bucket: row.bucket,
        requestTokens: Number(row.request_tokens) || 0,
        responseTokens: Number(row.response_tokens) || 0,
        totalTokens: Number(row.total_tokens) || 0,
        callCount: Number(row.call_count) || 0,
      })),
      breakdowns: {
        models: modelsResult.rows.map(mapBreakdownRow),
        agents: agentsResult.rows.map(mapBreakdownRow),
        teams: teamsResult.rows.map(mapBreakdownRow),
        users: usersResult.rows.map(mapBreakdownRow),
      },
      modelsTimeseries,
      agentsTimeseries,
      teamsTimeseries,
      usersTimeseries,
      recent: {
        data: recentResult.rows.map(row => ({
          id: row.id,
          sessionId: row.session_id,
          createdAt: row.created_at,
          agent: row.agent_label,
          model: row.model_label,
          team: row.team_label,
          user: row.user_label,
          requestTokens: Number(row.request_tokens) || 0,
          responseTokens: Number(row.response_tokens) || 0,
          totalTokens: Number(row.total_tokens) || 0,
          cost: row.cost != null ? Number(row.cost) : null,
          status: row.status || 'completed',
        })),
        pagination: {
          page,
          limit,
          total: Number(countResult.rows[0].total) || 0,
          totalPages: Math.ceil((Number(countResult.rows[0].total) || 0) / limit),
        },
      },
    };

    return res.json(responsePayload);
  } catch (error) {
    log(`[Usage API] Error: ${error.message}`);
    next(error);
  }
});

export default router;

