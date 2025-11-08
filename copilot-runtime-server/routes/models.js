import express from 'express';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
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

const ensureHttps = value => {
  if (!value) return value;
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  return `https://${value}`;
};

const safeJsonParse = async response => {
  try {
    return await response.json();
  } catch (err) {
    return null;
  }
};

const extractErrorMessage = (payload, fallback) => {
  if (!payload) return fallback;

  if (typeof payload === 'string') {
    return payload;
  }

  const errField = payload.error;
  if (errField) {
    if (typeof errField === 'string') {
      return errField;
    }
    if (typeof errField.message === 'string') {
      return errField.message;
    }
    if (typeof errField.error === 'string') {
      return errField.error;
    }
    if (errField.error && typeof errField.error.message === 'string') {
      return errField.error.message;
    }
  }

  if (typeof payload.message === 'string') {
    return payload.message;
  }

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const first = payload.errors[0];
    if (typeof first === 'string') {
      return first;
    }
    if (first && typeof first.message === 'string') {
      return first.message;
    }
  }

  if (typeof payload.detail === 'string') {
    return payload.detail;
  }

  if (typeof payload.title === 'string') {
    return payload.title;
  }

  return fallback;
};

const resolveModelIdentifier = (modelName, modelKey) => {
  if (modelName && typeof modelName === 'string' && modelName.trim()) {
    return modelName.trim();
  }
  if (modelKey && typeof modelKey === 'string' && modelKey.trim()) {
    return modelKey.trim();
  }
  return null;
};

async function testOpenAIModel(credentials, modelName, modelKey) {
  const identifier = resolveModelIdentifier(modelName, modelKey);
  if (!identifier) {
    throw new Error('Model name is required to test OpenAI connectivity');
  }

  const apiKey = credentials?.api_key || credentials?.apiKey;
  if (!apiKey) {
    throw new Error('api_key is required to test OpenAI connectivity');
  }

  const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(identifier)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const payload = await safeJsonParse(response);
    throw new Error(extractErrorMessage(payload, `OpenAI API responded with status ${response.status}`));
  }

  return {
    provider: 'openai',
    message: `OpenAI model "${identifier}" is reachable`,
  };
}

async function testAzureOpenAIModel(credentials, modelName, modelKey) {
  const candidateNames = Array.from(new Set([modelName, modelKey].filter(Boolean).map(value => value.trim()).filter(Boolean)));
  if (candidateNames.length === 0) {
    throw new Error('Deployment name is required to test Azure OpenAI connectivity');
  }

  const apiKey = credentials?.api_key || credentials?.apiKey;
  const endpointRaw = credentials?.endpoint || credentials?.api_base || credentials?.resourceName;
  const apiVersion = credentials?.api_version || credentials?.apiVersion || credentials?.api_version_alt || '2024-02-15-preview';

  if (!apiKey) {
    throw new Error('api_key is required to test Azure OpenAI connectivity');
  }

  if (!endpointRaw) {
    throw new Error('endpoint is required to test Azure OpenAI connectivity');
  }

  const endpoint = ensureHttps(
    endpointRaw.includes('.openai.azure.com') ? endpointRaw : `${endpointRaw}.openai.azure.com`,
  ).replace(/\/$/, '');

  let lastNotFound = null;

  for (const deployment of candidateNames) {
    const url = `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}?api-version=${encodeURIComponent(apiVersion)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'api-key': apiKey,
      },
    });

    if (response.ok) {
      return {
        provider: 'azure_openai',
        message: `Azure OpenAI deployment "${deployment}" is reachable`,
      };
    }

    if (response.status !== 404) {
      const payload = await safeJsonParse(response);
      throw new Error(extractErrorMessage(payload, `Azure OpenAI API responded with status ${response.status}`));
    }

    lastNotFound = deployment;
  }

  throw new Error(`Azure OpenAI deployment "${lastNotFound}" was not found or is inaccessible`);
}

async function testGoogleModel(credentials, modelName, modelKey) {
  const identifier = resolveModelIdentifier(modelName, modelKey);
  if (!identifier) {
    throw new Error('Model name is required to test Google Generative AI connectivity');
  }

  const apiKey = credentials?.api_key || credentials?.apiKey;
  if (!apiKey) {
    throw new Error('api_key is required to test Google Generative AI connectivity');
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(identifier)}?key=${encodeURIComponent(apiKey)}`);
  const payload = await safeJsonParse(response);

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, `Google Generative AI API responded with status ${response.status}`));
  }

  if (payload && typeof payload === 'object' && payload.error) {
    throw new Error(extractErrorMessage(payload.error, 'Google Generative AI API reported an error'));
  }

  return {
    provider: 'google',
    message: `Google Generative AI model "${identifier}" is reachable`,
  };
}

async function testAnthropicModel(credentials, modelName, modelKey) {
  const apiKey = credentials?.api_key || credentials?.apiKey;
  if (!apiKey) {
    throw new Error('api_key is required to test Anthropic connectivity');
  }

  const identifier = resolveModelIdentifier(modelName, modelKey);
  if (!identifier) {
    throw new Error('Model name is required to test Anthropic connectivity');
  }

  const response = await fetch('https://api.anthropic.com/v1/models', {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  });

  const payload = await safeJsonParse(response);

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, `Anthropic API responded with status ${response.status}`));
  }

  const models = Array.isArray(payload?.data) ? payload.data : [];
  const match = models.find(item => item && (item.id === identifier || item.name === identifier));

  if (!match) {
    throw new Error(`Anthropic did not return model "${identifier}"`);
  }

  return {
    provider: 'anthropic',
    message: `Anthropic model "${identifier}" is reachable`,
  };
}

async function testBedrockModel(credentials, modelName, modelKey) {
  const identifier = resolveModelIdentifier(modelName, modelKey);
  if (!identifier) {
    throw new Error('Model name is required to test Bedrock connectivity');
  }

  const accessKeyId =
    credentials?.aws_access_key_id || credentials?.accessKeyId || credentials?.access_key_id;
  const secretAccessKey =
    credentials?.aws_secret_access_key || credentials?.secretAccessKey || credentials?.secret_key;
  const sessionToken = credentials?.aws_session_token || credentials?.sessionToken;
  const region = credentials?.region || credentials?.aws_region || credentials?.default_region;

  if (!accessKeyId || !secretAccessKey || !region) {
    throw new Error('AWS access key, secret access key, and region are required to test Bedrock connectivity');
  }

  const client = new BedrockRuntimeClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
      sessionToken,
    },
  });

  try {
    const command = new InvokeModelCommand({
      modelId: identifier,
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(JSON.stringify({ inputText: 'ping' })),
    });

    await client.send(command);

    return {
      provider: 'anthropic_bedrock',
      message: `Bedrock model "${identifier}" is reachable`,
    };
  } catch (err) {
    const errorName = err?.name || err?.Code;
    const errorMessage = err?.message || err?.Message;

    if (
      errorName === 'ValidationException' ||
      errorName === 'ModelNotReadyException' ||
      errorName === 'ThrottlingException'
    ) {
      return {
        provider: 'anthropic_bedrock',
        message: `Bedrock responded but rejected the request: ${errorMessage || errorName}`,
      };
    }

    throw new Error(errorMessage || `AWS Bedrock connectivity failed (${errorName || 'Unknown error'})`);
  }
}

async function testModelConnectivity(providerType, credentials, modelName, modelKey) {
  switch (providerType) {
    case 'openai':
      return testOpenAIModel(credentials, modelName, modelKey);
    case 'azure_openai':
      return testAzureOpenAIModel(credentials, modelName, modelKey);
    case 'google':
      return testGoogleModel(credentials, modelName, modelKey);
    case 'anthropic':
      return testAnthropicModel(credentials, modelName, modelKey);
    case 'anthropic_bedrock':
      return testBedrockModel(credentials, modelName, modelKey);
    default:
      throw new Error(`Connectivity test for provider type "${providerType}" is not supported yet`);
  }
}

const toCamelModel = row => ({
  id: row.id,
  modelKey: row.model_key,
  modelName: row.model_name,
  displayName: row.display_name,
  description: row.description,
  enabled: row.enabled,
  organizationId: row.organization_id,
  teams: row.teams || [], // Array of {id, name} objects from the view
  providerId: row.provider_id,
  providerKey: row.provider_key,
  providerType: row.provider_type,
  modelSettingsOverride: row.model_settings_override || null,
  metadata: row.metadata || null,
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

async function fetchModelById(pool, id, organizationId) {
  const { rows } = await pool.query(
    `SELECT m.*, p.provider_key, p.provider_type
     FROM models_with_teams m
     JOIN providers p ON m.provider_id = p.id
     WHERE m.id = $1 AND m.organization_id = $2`,
    [id, organizationId],
  );

  return rows[0] ? toCamelModel(rows[0]) : null;
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
    
    // If teamIds are specified, filter to show only models that:
    // 1. Are organization-wide (no team restrictions), OR
    // 2. Include at least one of the specified teams
    if (teamIds.length > 0) {
      teamFilter = `
        AND (
          NOT EXISTS (SELECT 1 FROM model_teams mt WHERE mt.model_id = m.id)
          OR EXISTS (
            SELECT 1 FROM model_teams mt 
            WHERE mt.model_id = m.id AND mt.team_id = ANY($2::text[])
          )
        )
      `;
      params.push(teamIds);
    }

    // Get all models for the organization with their teams (filtered by org and optionally by team)
    const { rows } = await pool.query(
      `SELECT 
         m.*,
         p.provider_key,
         p.provider_type,
         COALESCE(
           (SELECT json_agg(json_build_object('id', team.id, 'name', team.name) ORDER BY team.name)
            FROM model_teams mt
            JOIN team ON team.id = mt.team_id
            WHERE mt.model_id = m.id
              AND team."organizationId" = $1),
           '[]'::json
         ) as teams
       FROM models m
       JOIN providers p ON m.provider_id = p.id
       WHERE m.organization_id = $1
         ${teamFilter}
       ORDER BY m.created_at DESC`,
      params,
    );

    res.json({ models: rows.map(toCamelModel), count: rows.length });
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
      providerId,
      providerKey,
      modelKey,
      modelName,
      displayName,
      description,
      enabled = true,
      modelSettings,
      metadata,
    } = req.body || {};

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    if (!modelKey || typeof modelKey !== 'string') {
      return res.status(400).json({ error: 'modelKey is required' });
    }

    if (!modelName || typeof modelName !== 'string') {
      return res.status(400).json({ error: 'modelName is required' });
    }

    const pool = getPool();

    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    // Validate teams if provided
    if (teamIds.length > 0) {
      const { rows } = await pool.query(
        'SELECT id FROM team WHERE id = ANY($1::text[]) AND "organizationId" = $2',
        [teamIds, organizationId],
      );
      if (rows.length !== teamIds.length) {
        return res.status(404).json({ error: 'One or more teams not found in organization' });
      }
    }

    const providerIdentifier = providerId || providerKey;
    if (!providerIdentifier) {
      return res.status(400).json({ error: 'providerId or providerKey is required' });
    }

    const providerQuery = providerId
      ? ['SELECT id FROM providers WHERE id = $1 AND organization_id = $2', [providerId, organizationId]]
      : ['SELECT id FROM providers WHERE provider_key = $1 AND organization_id = $2', [providerKey, organizationId]];

    const providerResult = await pool.query(providerQuery[0], providerQuery[1]);
    if (providerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Provider not found for organization' });
    }

    const providerRow = providerResult.rows[0];

    const modelSettingsJSON = sanitizeJSON(modelSettings, {});
    const metadataJSON = sanitizeJSON(metadata, {});

    const insertResult = await pool.query(
      `INSERT INTO models (
         provider_id,
         model_key,
         model_name,
         display_name,
         description,
         model_settings_override,
         organization_id,
         enabled,
         metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        providerRow.id,
        modelKey.trim(),
        modelName.trim(),
        displayName?.trim() || null,
        description?.trim() || null,
        Object.keys(modelSettingsJSON).length > 0 ? modelSettingsJSON : null,
        organizationId,
        Boolean(enabled),
        metadataJSON,
      ],
    );

    const modelId = insertResult.rows[0].id;

    // Associate with teams if provided
    if (teamIds.length > 0) {
      await syncTeamAssociations(pool, 'model_teams', 'model_id', modelId, teamIds);
    }

    invalidateConfigCaches();

    const createdModel = await fetchModelById(pool, modelId, organizationId);
    res.status(201).json({ model: createdModel });
  } catch (err) {
    next(err);
  }
});

router.put('/:modelId', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { modelId } = req.params;
    const {
      organizationId,
      teamIds = [], // Array of team IDs for multi-team support
      providerId,
      providerKey,
      modelKey,
      modelName,
      displayName,
      description,
      enabled = true,
      modelSettings,
      metadata,
    } = req.body || {};

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    const pool = getPool();

    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    // Validate teams if provided
    if (teamIds.length > 0) {
      const { rows } = await pool.query(
        'SELECT id FROM team WHERE id = ANY($1::text[]) AND "organizationId" = $2',
        [teamIds, organizationId],
      );
      if (rows.length !== teamIds.length) {
        return res.status(404).json({ error: 'One or more teams not found in organization' });
      }
    }

    const existingModel = await fetchModelById(pool, modelId, organizationId);
    if (!existingModel) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const providerIdentifier = providerId || providerKey || existingModel.providerId;

    const providerQuery = providerId || providerKey
      ? providerId
        ? ['SELECT id FROM providers WHERE id = $1 AND organization_id = $2', [providerId, organizationId]]
        : ['SELECT id FROM providers WHERE provider_key = $1 AND organization_id = $2', [providerKey, organizationId]]
      : ['SELECT id FROM providers WHERE id = $1 AND organization_id = $2', [existingModel.providerId, organizationId]];

    const providerResult = await pool.query(providerQuery[0], providerQuery[1]);
    if (providerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Provider not found for organization' });
    }

    const providerRow = providerResult.rows[0];

    const modelSettingsJSON = sanitizeJSON(modelSettings, {});
    const metadataJSON = sanitizeJSON(metadata, {});

    await pool.query(
      `UPDATE models
       SET
         provider_id = $1,
         model_key = $2,
         model_name = $3,
         display_name = $4,
         description = $5,
         model_settings_override = $6,
         enabled = $7,
         metadata = $8,
         updated_at = NOW()
       WHERE id = $9 AND organization_id = $10`,
      [
        providerRow.id,
        modelKey ? modelKey.trim() : existingModel.modelKey,
        modelName ? modelName.trim() : existingModel.modelName,
        displayName?.trim() || null,
        description?.trim() || null,
        Object.keys(modelSettingsJSON).length > 0 ? modelSettingsJSON : null,
        Boolean(enabled),
        metadataJSON,
        modelId,
        organizationId,
      ],
    );

    // Update team associations (always sync when teamIds is provided in request)
    if (teamIds !== undefined) {
      await syncTeamAssociations(pool, 'model_teams', 'model_id', modelId, teamIds);
    }

    invalidateConfigCaches();

    const updatedModel = await fetchModelById(pool, modelId, organizationId);
    res.json({ model: updatedModel });
  } catch (err) {
    next(err);
  }
});

router.post('/:modelId/test', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { modelId } = req.params;
    const {
      organizationId,
      teamId = undefined,
      providerId: providerIdOverride = null,
      modelKey = null,
      modelName = null,
      modelSettings = undefined,
      metadata = undefined,
    } = req.body || {};

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
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

    const { rows } = await pool.query(
      `SELECT m.id,
              m.model_key,
              m.model_name,
              COALESCE(
                (SELECT json_agg(mt.team_id)
                 FROM model_teams mt 
                 WHERE mt.model_id = m.id),
                '[]'::json
              ) as model_teams,
              p.id AS provider_id,
              p.provider_key,
              p.provider_type,
              p.credentials,
              p.bedrock_model_settings,
              COALESCE(
                (SELECT json_agg(pt.team_id)
                 FROM provider_teams pt 
                 WHERE pt.provider_id = p.id),
                '[]'::json
              ) as provider_teams
         FROM models m
         JOIN providers p ON m.provider_id = p.id
        WHERE m.id = $1 AND m.organization_id = $2`,
      [modelId, organizationId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const modelRow = rows[0];

    let providerRow = {
      id: modelRow.provider_id,
      provider_key: modelRow.provider_key,
      provider_type: modelRow.provider_type,
      credentials: modelRow.credentials || {},
      bedrock_model_settings: modelRow.bedrock_model_settings || null,
      teams: modelRow.provider_teams || [],
    };

    if (providerIdOverride && providerIdOverride !== modelRow.provider_id) {
      const providerResult = await pool.query(
        `SELECT id, provider_key, provider_type, credentials, bedrock_model_settings,
                COALESCE(
                  (SELECT json_agg(pt.team_id)
                   FROM provider_teams pt 
                   WHERE pt.provider_id = id),
                  '[]'::json
                ) as teams
         FROM providers WHERE id = $1 AND organization_id = $2`,
        [providerIdOverride, organizationId],
      );

      if (providerResult.rows.length === 0) {
        return res.status(404).json({ error: 'Provider not found for organization' });
      }

      providerRow = providerResult.rows[0];
    }

    // Validate provider-model team compatibility
    const modelTeams = modelRow.model_teams || [];
    const providerTeams = providerRow.teams || [];
    
    if (modelTeams.length > 0 && providerTeams.length > 0) {
      // Both have team restrictions - must have at least one team in common
      const hasCommonTeam = modelTeams.some(mt => providerTeams.includes(mt));
      if (!hasCommonTeam) {
        return res.status(400).json({ error: 'Team-scoped provider must share at least one team with team-scoped model' });
      }
    }

    try {
      if (modelSettings !== undefined) {
        sanitizeJSON(modelSettings, {});
      }
      if (metadata !== undefined) {
        sanitizeJSON(metadata, {});
      }
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Invalid JSON payload' });
    }

    const finalModelName = typeof modelName === 'string' && modelName.trim() ? modelName.trim() : modelRow.model_name;
    const finalModelKey = typeof modelKey === 'string' && modelKey.trim() ? modelKey.trim() : modelRow.model_key;

    let result;
    try {
      result = await testModelConnectivity(
        providerRow.provider_type,
        providerRow.credentials || {},
        finalModelName,
        finalModelKey,
      );
    } catch (err) {
      log('[Models API] Model connectivity test failed', {
        modelId,
        providerId: providerRow.id,
        providerType: providerRow.provider_type,
        organizationId,
        error: err?.message,
      });
      return res.status(502).json({ error: err?.message || 'Model connectivity test failed' });
    }

    log('[Models API] Model connectivity test succeeded', {
      modelId,
      providerId: providerRow.id,
      providerType: providerRow.provider_type,
      organizationId,
    });

    res.json({ ok: true, result });
  } catch (err) {
    next(err);
  }
});

router.post('/test-new', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const {
      organizationId,
      providerId,
      modelKey,
      modelName,
      modelSettings = undefined,
      metadata = undefined,
    } = req.body || {};

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    if (!providerId) {
      return res.status(400).json({ error: 'providerId is required' });
    }

    if (!modelName || !modelName.trim()) {
      return res.status(400).json({ error: 'modelName is required' });
    }

    const pool = getPool();
    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    const providerResult = await pool.query(
      'SELECT id, provider_key, provider_type, credentials, bedrock_model_settings FROM providers WHERE id = $1 AND organization_id = $2',
      [providerId, organizationId],
    );

    if (providerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Provider not found for organization' });
    }

    const providerRow = providerResult.rows[0];

    try {
      if (modelSettings !== undefined) {
        sanitizeJSON(modelSettings, {});
      }
      if (metadata !== undefined) {
        sanitizeJSON(metadata, {});
      }
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Invalid JSON payload' });
    }

    const finalModelName = modelName.trim();
    const finalModelKey = typeof modelKey === 'string' && modelKey.trim() ? modelKey.trim() : finalModelName;

    let result;
    try {
      result = await testModelConnectivity(
        providerRow.provider_type,
        providerRow.credentials || {},
        finalModelName,
        finalModelKey,
      );
    } catch (err) {
      log('[Models API] New model connectivity test failed', {
        providerId: providerRow.id,
        providerType: providerRow.provider_type,
        organizationId,
        error: err?.message,
      });
      return res.status(502).json({ error: err?.message || 'Model connectivity test failed' });
    }

    log('[Models API] New model connectivity test succeeded', {
      providerId: providerRow.id,
      providerType: providerRow.provider_type,
      organizationId,
    });

    res.json({ ok: true, result });
  } catch (err) {
    next(err);
  }
});

router.delete('/:modelId', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { modelId } = req.params;
    const { organizationId } = req.query;

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    const pool = getPool();

    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    const { rowCount } = await pool.query('DELETE FROM models WHERE id = $1 AND organization_id = $2', [modelId, organizationId]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Model not found' });
    }

    invalidateConfigCaches();

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

