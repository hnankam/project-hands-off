/**
 * Skills Routes (Admin)
 *
 * Manages Agent Skills for organizations.
 * Supports manual (programmatic) and Git-based skills.
 *
 * @module routes/skills
 */

import { Router } from 'express';
import { getPool } from '../config/database.js';
import { invalidateCache as invalidateDbCache } from '../config/db-loaders.js';
import { invalidateCache as invalidateLoaderCache } from '../config/loader.js';
import { syncTeamAssociations } from '../lib/team-helpers.js';
import { sanitizeJSON, ensureAuthenticated, ensureOrgAdmin } from '../utils/route-helpers.js';

const router = Router();

// ============================================================================
// Data Transformation
// ============================================================================

const toCamelSkill = row => ({
  id: row.id,
  skillKey: row.skill_key,
  name: row.name,
  description: row.description,
  sourceType: row.source_type,
  content: row.content,
  metadata: row.metadata || {},
  gitConfig: row.git_config || null,
  organizationId: row.organization_id,
  enabled: row.enabled,
  teams: row.teams || [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

function invalidateConfigCaches() {
  invalidateDbCache();
  invalidateLoaderCache();
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /api/admin/skills
 * List skills for an organization, optionally filtered by teams
 */
router.get('/', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { organizationId, teamIds: teamIdsParam = null } = req.query;
    const teamIds = Array.isArray(teamIdsParam) ? teamIdsParam : teamIdsParam ? [teamIdsParam] : [];

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    const pool = getPool();
    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    const params = [organizationId];
    let teamFilter = '';

    if (teamIds.length > 0) {
      teamFilter = `
        AND (
          NOT EXISTS (SELECT 1 FROM skill_teams st WHERE st.skill_id = s.id)
          OR EXISTS (
            SELECT 1 FROM skill_teams st
            WHERE st.skill_id = s.id AND st.team_id = ANY($2::text[])
          )
        )
      `;
      params.push(teamIds);
    }

    const { rows } = await pool.query(
      `SELECT
         s.*,
         COALESCE(
           (SELECT json_agg(json_build_object('id', t.id, 'name', t.name) ORDER BY t.name)
            FROM skill_teams st
            JOIN team t ON t.id = st.team_id
            WHERE st.skill_id = s.id
              AND t."organizationId" = $1),
           '[]'::json
         ) as teams
       FROM skills s
       WHERE s.organization_id = $1
         AND s.deleted_at IS NULL
         ${teamFilter}
       ORDER BY s.name ASC`,
      params,
    );

    res.json({ skills: rows.map(toCamelSkill), count: rows.length });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/skills
 * Create a new skill
 */
router.post('/', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const {
      organizationId,
      skillKey,
      name,
      description,
      sourceType,
      content,
      metadata = {},
      gitConfig,
      teamIds = [],
      enabled = true,
    } = req.body || {};

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }
    if (!skillKey || typeof skillKey !== 'string') {
      return res.status(400).json({ error: 'skillKey is required' });
    }
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!description || typeof description !== 'string') {
      return res.status(400).json({ error: 'description is required' });
    }
    if (!sourceType || !['manual', 'git'].includes(sourceType)) {
      return res.status(400).json({ error: 'sourceType must be "manual" or "git"' });
    }
    if (sourceType === 'git' && !gitConfig?.repo_url) {
      return res.status(400).json({ error: 'gitConfig.repo_url is required for git skills' });
    }

    const pool = getPool();
    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    if (teamIds.length > 0) {
      const { rows } = await pool.query('SELECT id FROM team WHERE id = ANY($1::text[]) AND "organizationId" = $2', [
        teamIds,
        organizationId,
      ]);
      if (rows.length !== teamIds.length) {
        return res.status(404).json({ error: 'One or more teams not found in organization' });
      }
    }

    const metadataJSON = sanitizeJSON(metadata, {});
    const gitConfigJSON = sourceType === 'git' ? sanitizeJSON(gitConfig, {}) : null;

    const insertResult = await pool.query(
      `INSERT INTO skills (
         skill_key,
         name,
         description,
         source_type,
         content,
         metadata,
         git_config,
         organization_id,
         enabled
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        skillKey.trim().toLowerCase().replace(/\s+/g, '-'),
        name.trim(),
        description.trim(),
        sourceType,
        sourceType === 'manual' ? content || '' : null,
        metadataJSON,
        gitConfigJSON,
        organizationId,
        Boolean(enabled),
      ],
    );

    const skillId = insertResult.rows[0].id;

    if (teamIds.length > 0) {
      await syncTeamAssociations(pool, 'skill_teams', 'skill_id', skillId, teamIds);
    }

    invalidateConfigCaches();

    const { rows } = await pool.query(
      `SELECT s.*, '[]'::json as teams
       FROM skills s
       WHERE s.id = $1`,
      [skillId],
    );

    res.status(201).json({ skill: toCamelSkill(rows[0]) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A skill with this key already exists in this organization' });
    }
    next(err);
  }
});

/**
 * POST /api/admin/skills/test-git
 * Test Git config before saving (for create form)
 * Must be defined before /:skillId routes
 */
router.post('/test-git', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { organizationId, gitConfig } = req.body || {};

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }
    if (!gitConfig?.repo_url) {
      return res.status(400).json({ error: 'gitConfig.repo_url is required' });
    }

    const pool = getPool();
    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    const pythonBackendUrl = process.env.PYDANTIC_SERVICE_URL || 'http://localhost:8001';
    console.log(
      '[skills] test-git: proxying to',
      `${pythonBackendUrl}/api/admin/skills/test-git`,
      'repo_url=',
      gitConfig?.repo_url,
    );

    try {
      const response = await fetch(`${pythonBackendUrl}/api/admin/skills/test-git`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gitConfig }),
      });

      const result = await response.json();
      console.log(
        '[skills] test-git: Python response status=%d',
        response.status,
        'result=',
        JSON.stringify(result).slice(0, 200),
      );

      if (!response.ok) {
        return res.status(response.status).json({
          error: result.error || 'Failed to connect to Git repository',
          details: result.details,
        });
      }

      res.json({
        success: true,
        message: result.message || 'Successfully connected to Git repository',
      });
    } catch (fetchErr) {
      console.error('[skills] test-git: Failed to reach Python backend:', fetchErr.message, fetchErr);
      return res.status(503).json({
        error: 'Python backend unavailable',
        details: `Could not connect to Python backend at ${pythonBackendUrl}. Please ensure it is running.`,
      });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/skills/:skillId
 * Update an existing skill
 */
router.put('/:skillId', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { skillId } = req.params;
    const { organizationId, skillKey, name, description, sourceType, content, metadata, gitConfig, teamIds, enabled } =
      req.body || {};

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    const pool = getPool();
    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    const { rows: existing } = await pool.query(
      'SELECT * FROM skills WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
      [skillId, organizationId],
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    const current = existing[0];
    const metadataJSON = metadata !== undefined ? sanitizeJSON(metadata, current.metadata || {}) : current.metadata;
    const gitConfigJSON =
      gitConfig !== undefined ? (sourceType === 'git' ? sanitizeJSON(gitConfig, {}) : null) : current.git_config;

    await pool.query(
      `UPDATE skills SET
         skill_key = COALESCE($1, skill_key),
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         source_type = COALESCE($4, source_type),
         content = CASE WHEN $4 = 'git' THEN NULL ELSE COALESCE($5, content) END,
         metadata = COALESCE($6, metadata),
         git_config = $7,
         enabled = COALESCE($8, enabled),
         updated_at = NOW()
       WHERE id = $9 AND organization_id = $10`,
      [
        skillKey?.trim().toLowerCase().replace(/\s+/g, '-'),
        name?.trim(),
        description?.trim(),
        sourceType,
        content,
        metadataJSON,
        gitConfigJSON,
        enabled !== undefined ? Boolean(enabled) : current.enabled,
        skillId,
        organizationId,
      ],
    );

    if (teamIds !== undefined) {
      await syncTeamAssociations(pool, 'skill_teams', 'skill_id', skillId, teamIds);
    }

    invalidateConfigCaches();

    const { rows } = await pool.query(
      `SELECT s.*,
         COALESCE(
           (SELECT json_agg(json_build_object('id', t.id, 'name', t.name) ORDER BY t.name)
            FROM skill_teams st
            JOIN team t ON t.id = st.team_id
            WHERE st.skill_id = s.id),
           '[]'::json
         ) as teams
       FROM skills s
       WHERE s.id = $1`,
      [skillId],
    );

    res.json({ skill: toCamelSkill(rows[0]) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A skill with this key already exists in this organization' });
    }
    next(err);
  }
});

/**
 * DELETE /api/admin/skills/:skillId
 * Soft delete a skill
 */
router.delete('/:skillId', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { skillId } = req.params;
    const { organizationId } = req.query;

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    const pool = getPool();
    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    const { rowCount } = await pool.query(
      'UPDATE skills SET deleted_at = NOW() WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
      [skillId, organizationId],
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    invalidateConfigCaches();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/skills/:skillId/test
 * Test Git connection for an existing skill (for edit form)
 */
router.post('/:skillId/test', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { skillId } = req.params;
    const { organizationId } = req.body || {};

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    const pool = getPool();
    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    const { rows } = await pool.query(
      'SELECT git_config FROM skills WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL AND source_type = $3',
      [skillId, organizationId, 'git'],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Skill not found or is not a Git skill' });
    }

    const gitConfig = rows[0].git_config;
    if (!gitConfig?.repo_url) {
      return res.status(400).json({ error: 'Skill has no valid Git config' });
    }

    const pythonBackendUrl = process.env.PYDANTIC_SERVICE_URL || 'http://localhost:8001';

    try {
      const response = await fetch(`${pythonBackendUrl}/api/admin/skills/test-git`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gitConfig }),
      });

      const result = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          error: result.error || 'Failed to connect to Git repository',
          details: result.details,
        });
      }

      res.json({
        success: true,
        message: result.message || 'Successfully connected to Git repository',
      });
    } catch (fetchErr) {
      console.error('[skills] Failed to reach Python backend:', fetchErr.message);
      return res.status(503).json({
        error: 'Python backend unavailable',
        details: `Could not connect to Python backend at ${pythonBackendUrl}. Please ensure it is running.`,
      });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
