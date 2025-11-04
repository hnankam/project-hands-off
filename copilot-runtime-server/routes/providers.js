import express from 'express';
import { auth } from '../auth/index.js';
import { getPool } from '../config/database.js';
import { log } from '../utils/logger.js';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const router = express.Router();

const SUPPORTED_PROVIDER_TYPES = new Set([
  'anthropic',
  'anthropic_bedrock',
  'google',
  'openai',
  'azure_openai',
]);

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

const ensureHttps = (value) => {
  if (!value) return value;
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  return `https://${value}`;
};

const safeJsonParse = async (response) => {
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

async function testOpenAIProvider(credentials) {
  const apiKey = credentials?.api_key || credentials?.apiKey;
  if (!apiKey) {
    throw new Error('api_key is required to test OpenAI connectivity');
  }

  const response = await fetch('https://api.openai.com/v1/models', {
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
    message: 'Successfully connected to OpenAI API',
  };
}

async function testAzureOpenAIProvider(credentials) {
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

  const url = `${endpoint}/openai/deployments?api-version=${encodeURIComponent(apiVersion)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'api-key': apiKey,
    },
  });

  let payload = await safeJsonParse(response);

  if (!response.ok) {
    const fallbackMessage = `Azure OpenAI API responded with status ${response.status}`;
    const message = extractErrorMessage(payload, fallbackMessage);

    if (response.status === 404) {
      // Some Azure OpenAI resources return 404 for the deployments listing even when the
      // resource exists. Attempt a secondary check against the models endpoint instead.
      const modelsUrl = `${endpoint}/openai/models?api-version=${encodeURIComponent(apiVersion)}`;
      const modelsResponse = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          'api-key': apiKey,
        },
      });

      const modelsPayload = await safeJsonParse(modelsResponse);

      if (!modelsResponse.ok) {
        throw new Error(extractErrorMessage(modelsPayload, message));
      }

      if (modelsPayload && typeof modelsPayload === 'object' && modelsPayload.error) {
        throw new Error(extractErrorMessage(modelsPayload.error, message));
      }

      return {
        provider: 'azure_openai',
        message: 'Azure OpenAI endpoint reachable, but deployments list is restricted. Models endpoint responded successfully.',
      };
    }

    throw new Error(message);
  }

  if (payload && typeof payload === 'object' && payload.error) {
    throw new Error(extractErrorMessage(payload.error, 'Azure OpenAI API reported an error'));
  }

  return {
    provider: 'azure_openai',
    message: 'Successfully connected to Azure OpenAI endpoint',
  };
}

async function testAnthropicProvider(credentials) {
  const apiKey = credentials?.api_key || credentials?.apiKey;
  if (!apiKey) {
    throw new Error('api_key is required to test Anthropic connectivity');
  }

  const response = await fetch('https://api.anthropic.com/v1/models', {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  });

  if (!response.ok) {
    const payload = await safeJsonParse(response);
    throw new Error(extractErrorMessage(payload, `Anthropic API responded with status ${response.status}`));
  }

  return {
    provider: 'anthropic',
    message: 'Successfully connected to Anthropic API',
  };
}

async function testGoogleProvider(credentials) {
  const apiKey = credentials?.api_key || credentials?.apiKey;
  if (!apiKey) {
    throw new Error('api_key is required to test Google Generative AI connectivity');
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, {
    method: 'GET',
  });

  const payload = await safeJsonParse(response);

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, `Google Generative AI API responded with status ${response.status}`));
  }

  if (payload && typeof payload === 'object' && payload.error) {
    throw new Error(extractErrorMessage(payload.error, 'Google Generative AI API reported an error'));
  }

  if (!payload?.models) {
    throw new Error('Google Generative AI API response did not include models');
  }

  return {
    provider: 'google',
    message: 'Successfully connected to Google Generative AI API',
  };
}

async function testBedrockProvider(credentials) {
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
    // Attempt a minimal invocation against a well-known model. This validates the signature.
    const command = new InvokeModelCommand({
      modelId: 'amazon.titan-embed-text-v1',
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(JSON.stringify({ inputText: 'ping' })),
    });

    await client.send(command);

    return {
      provider: 'anthropic_bedrock',
      message: `Successfully validated AWS credentials for region ${region}`,
    };
  } catch (err) {
    const errorName = err?.name || err?.Code;
    const errorMessage = err?.message || err?.Message;

    if (
      errorName === 'AccessDeniedException' ||
      errorName === 'ModelNotReadyException' ||
      errorName === 'ResourceNotFoundException'
    ) {
      return {
        provider: 'anthropic_bedrock',
        message: `AWS credentials validated, but model access is restricted: ${errorMessage || errorName}`,
      };
    }

    throw new Error(errorMessage || `AWS Bedrock connectivity failed (${errorName || 'Unknown error'})`);
  }
}

async function testProviderConnectivity(providerType, credentials, bedrockModelSettings, _extra = {}) {
  switch (providerType) {
    case 'openai':
      return testOpenAIProvider(credentials);
    case 'azure_openai':
      return testAzureOpenAIProvider(credentials);
    case 'google':
      return testGoogleProvider(credentials);
    case 'anthropic':
      return testAnthropicProvider(credentials);
    case 'anthropic_bedrock':
      return testBedrockProvider(credentials, bedrockModelSettings);
    default:
      throw new Error(`Connectivity test for provider type "${providerType}" is not supported yet`);
  }
}

const toCamelProvider = (row) => ({
  id: row.id,
  providerKey: row.provider_key,
  providerType: row.provider_type,
  organizationId: row.organization_id,
  teamId: row.team_id,
  teamName: row.team_name || null,
  credentials: row.credentials || {},
  modelSettings: row.model_settings || {},
  bedrockModelSettings: row.bedrock_model_settings || null,
  metadata: row.metadata || {},
  enabled: row.enabled,
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
      `SELECT p.*, t.name AS team_name
       FROM providers p
       LEFT JOIN team t ON p.team_id = t.id
       WHERE p.organization_id = $1
         AND ($2::text IS NULL OR p.team_id = $2 OR p.team_id IS NULL)
       ORDER BY p.team_id IS NULL DESC, p.created_at DESC`,
      params,
    );

    res.json({ providers: rows.map(toCamelProvider), count: rows.length });
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
      providerKey,
      providerType,
      enabled = true,
      credentials,
      modelSettings,
      bedrockModelSettings,
      metadata,
    } = req.body || {};

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    if (!providerKey || typeof providerKey !== 'string') {
      return res.status(400).json({ error: 'providerKey is required' });
    }

    if (!providerType || !SUPPORTED_PROVIDER_TYPES.has(providerType)) {
      return res.status(400).json({ error: 'Invalid providerType' });
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

    const credentialsJSON = sanitizeJSON(credentials, {});
    const modelSettingsJSON = sanitizeJSON(modelSettings, {});
    const metadataJSON = sanitizeJSON(metadata, {});
    const bedrockSettingsJSON = bedrockModelSettings ? sanitizeJSON(bedrockModelSettings, {}) : null;

    const insertResult = await pool.query(
      `INSERT INTO providers (
         provider_key,
         provider_type,
         credentials,
         organization_id,
         team_id,
         model_settings,
         bedrock_model_settings,
         metadata,
         enabled
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        providerKey,
        providerType,
        credentialsJSON,
        organizationId,
        teamId,
        modelSettingsJSON,
        bedrockSettingsJSON,
        metadataJSON,
        enabled,
      ],
    );

    const provider = toCamelProvider(insertResult.rows[0]);
    log('[Providers API] Created provider', { providerId: provider.id, providerKey });

    res.status(201).json({ provider });
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'Provider key already exists' });
    }
    if (err?.message === 'Invalid JSON payload') {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.put('/:providerId', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { providerId } = req.params;
    const {
      organizationId,
      teamId = null,
      providerKey,
      providerType,
      enabled,
      credentials,
      modelSettings,
      bedrockModelSettings,
      metadata,
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

    const existingResult = await pool.query(
      'SELECT * FROM providers WHERE id = $1 AND organization_id = $2',
      [providerId, organizationId],
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const existing = existingResult.rows[0];

    const providerKeyValue = providerKey ?? existing.provider_key;
    const providerTypeValue = providerType ?? existing.provider_type;

    if (!SUPPORTED_PROVIDER_TYPES.has(providerTypeValue)) {
      return res.status(400).json({ error: 'Invalid providerType' });
    }

    const credentialsJSON = credentials === undefined ? existing.credentials : sanitizeJSON(credentials, existing.credentials || {});
    const modelSettingsJSON = modelSettings === undefined ? existing.model_settings : sanitizeJSON(modelSettings, existing.model_settings || {});
    const metadataJSON = metadata === undefined ? existing.metadata : sanitizeJSON(metadata, existing.metadata || {});
    const bedrockSettingsJSON = bedrockModelSettings === undefined
      ? existing.bedrock_model_settings
      : bedrockModelSettings === null
        ? null
        : sanitizeJSON(bedrockModelSettings, existing.bedrock_model_settings || {});

    const updateResult = await pool.query(
      `UPDATE providers SET
         provider_key = $1,
         provider_type = $2,
         credentials = $3,
         organization_id = $4,
         team_id = $5,
         model_settings = $6,
         bedrock_model_settings = $7,
         metadata = $8,
         enabled = $9,
         updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        providerKeyValue,
        providerTypeValue,
        credentialsJSON,
        organizationId,
        teamId,
        modelSettingsJSON,
        bedrockSettingsJSON,
        metadataJSON,
        enabled === undefined ? existing.enabled : !!enabled,
        providerId,
      ],
    );

    const provider = toCamelProvider(updateResult.rows[0]);
    log('[Providers API] Updated provider', { providerId });

    res.json({ provider });
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'Provider key already exists' });
    }
    if (err?.message === 'Invalid JSON payload') {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/:providerId/test', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { providerId } = req.params;
    const {
      organizationId,
      teamId = null,
      providerType,
      credentials,
      modelSettings,
      bedrockModelSettings,
      metadata,
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

    const existingResult = await pool.query(
      'SELECT * FROM providers WHERE id = $1 AND organization_id = $2',
      [providerId, organizationId],
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const existing = existingResult.rows[0];

    const providerTypeValue = providerType ?? existing.provider_type;
    if (!providerTypeValue) {
      return res.status(400).json({ error: 'providerType is required' });
    }

    let credentialsJSON;
    let modelSettingsJSON;
    let metadataJSON;
    let bedrockSettingsJSON;

    try {
      credentialsJSON =
        credentials === undefined
          ? existing.credentials || {}
          : sanitizeJSON(credentials, existing.credentials || {});

      modelSettingsJSON =
        modelSettings === undefined
          ? existing.model_settings || {}
          : sanitizeJSON(modelSettings, existing.model_settings || {});

      metadataJSON =
        metadata === undefined
          ? existing.metadata || {}
          : sanitizeJSON(metadata, existing.metadata || {});

      bedrockSettingsJSON =
        bedrockModelSettings === undefined
          ? existing.bedrock_model_settings || null
          : bedrockModelSettings === null
            ? null
            : sanitizeJSON(bedrockModelSettings, existing.bedrock_model_settings || {});
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Invalid JSON payload' });
    }

    try {
      const result = await testProviderConnectivity(providerTypeValue, credentialsJSON, bedrockSettingsJSON, {
        modelSettings: modelSettingsJSON,
        metadata: metadataJSON,
      });

      log('[Providers API] Provider connectivity test succeeded', { providerId, providerType: providerTypeValue });
      res.json({ ok: true, result });
    } catch (err) {
      log('[Providers API] Provider connectivity test failed', {
        providerId,
        providerType: providerTypeValue,
        error: err.message,
      });
      res.status(502).json({ error: err.message || 'Provider connectivity test failed' });
    }
  } catch (err) {
    next(err);
  }
});

router.delete('/:providerId', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { providerId } = req.params;
    const { organizationId } = req.query;

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    const pool = getPool();

    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    const deleteResult = await pool.query(
      'DELETE FROM providers WHERE id = $1 AND organization_id = $2 RETURNING provider_key',
      [providerId, organizationId],
    );

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    log('[Providers API] Deleted provider', { providerId, providerKey: deleteResult.rows[0].provider_key });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;

