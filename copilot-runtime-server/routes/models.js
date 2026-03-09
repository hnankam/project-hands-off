/**
 * Model Routes (Admin)
 * 
 * Manages LLM model configurations for organizations.
 * Models define the specific AI models (e.g., GPT-4, Claude, Gemini) that can be used
 * by agents within an organization.
 * 
 * **Features:**
 * - CRUD operations for models
 * - Multi-team support (org-wide or team-specific)
 * - Provider connectivity testing
 * - Model-provider compatibility validation
 * - Team scope validation
 * - Configuration cache invalidation
 * 
 * **Multi-Tenancy:**
 * - Organization-scoped (all models belong to an organization)
 * - Team-scoped (models can be restricted to specific teams)
 * - Validation ensures models and providers share compatible team scopes
 * 
 * **Supported Providers:**
 * - OpenAI (GPT models)
 * - Azure OpenAI (GPT models via Azure)
 * - Google (Gemini models)
 * - Anthropic (Claude models via API)
 * - Anthropic Bedrock (Claude models via AWS Bedrock)
 * 
 * **Connectivity Testing:**
 * Each provider type has dedicated test functions that verify:
 * - Valid credentials
 * - Model/deployment accessibility
 * - Proper configuration
 * 
 * @module routes/models
 */

import express from 'express';
import { AnthropicFoundry } from '@anthropic-ai/foundry-sdk';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { getPool } from '../config/database.js';
import { invalidateCache as invalidateDbCache } from '../config/db-loaders.js';
import { invalidateCache as invalidateLoaderCache } from '../config/loader.js';
import { log, logError } from '../utils/logger.js';
import { syncTeamAssociations } from '../lib/team-helpers.js';
import {
  sanitizeJSON,
  normalizeAzureOpenAIEndpoint,
  safeJsonParse,
  extractErrorMessage,
  ensureAuthenticated,
  ensureOrgAdmin,
  validateTeamBelongsToOrg,
} from '../utils/route-helpers.js';

const router = express.Router();

// Utility functions imported from route-helpers.js

/**
 * Resolves model identifier from modelName or modelKey
 * Prioritizes modelKey over modelName
 * @param {string} modelName - Model name (e.g., 'gpt-4')
 * @param {string} modelKey - Model key (e.g., 'gpt-4-turbo')
 * @returns {string|null} Resolved identifier or null
 */
const resolveModelIdentifier = (modelName, modelKey) => {
  if (modelKey && typeof modelKey === 'string' && modelKey.trim()) {
    return modelKey.trim();
  }
  if (modelName && typeof modelName === 'string' && modelName.trim()) {
    return modelName.trim();
  }
  return null;
};

// ============================================================================
// Provider Connectivity Test Functions
// ============================================================================

/**
 * Test OpenAI model connectivity
 * Verifies that the model exists and is accessible with the provided API key
 * @param {Object} credentials - Provider credentials
 * @param {string} credentials.api_key - OpenAI API key
 * @param {string} modelName - Model name to test
 * @param {string} modelKey - Model key (fallback)
 * @returns {Promise<{provider: string, message: string}>} Success result
 * @throws {Error} If connectivity test fails
 */
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

/**
 * Test Azure OpenAI model connectivity
 * Sends a minimal chat completion request to verify the deployment is reachable.
 * Uses POST (chat completions) instead of GET deployment, which may not exist on Cognitive Services.
 * @param {Object} credentials - Provider credentials
 * @param {string} credentials.api_key - Azure OpenAI API key
 * @param {string} credentials.endpoint - Azure OpenAI endpoint
 * @param {string} credentials.api_version - API version (default: 2024-02-15-preview)
 * @param {string} modelName - Deployment name to test
 * @param {string} modelKey - Alternative deployment name (fallback)
 * @returns {Promise<{provider: string, message: string}>} Success result
 * @throws {Error} If connectivity test fails
 */
async function testAzureOpenAIModel(credentials, modelName, modelKey) {
  const deployment = resolveModelIdentifier(modelName, modelKey);
  if (!deployment) {
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

  const endpoint = normalizeAzureOpenAIEndpoint(endpointRaw);
  const url = `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Hi' }],
      max_completion_tokens: 10,
    }),
  });

  const payload = await safeJsonParse(response);

  if (!response.ok) {
    throw new Error(
      extractErrorMessage(
        payload?.error || payload,
        `Azure OpenAI deployment "${deployment}" test failed (${response.status})`
      )
    );
  }

  return {
    provider: 'azure_openai',
    message: `Azure OpenAI deployment "${deployment}" is reachable`,
  };
}

/**
 * Test Google Generative AI model connectivity
 * Verifies that the model exists and is accessible with the provided API key
 * @param {Object} credentials - Provider credentials
 * @param {string} credentials.api_key - Google API key
 * @param {string} modelName - Model name to test (e.g., 'gemini-2.5-flash')
 * @param {string} modelKey - Model key (fallback)
 * @returns {Promise<{provider: string, message: string}>} Success result
 * @throws {Error} If connectivity test fails
 */
async function testGoogleModel(credentials, modelName, modelKey) {
  const identifier = resolveModelIdentifier(modelName, modelKey);
  if (!identifier) {
    throw new Error('Model name is required to test Google Generative AI connectivity');
  }

  const apiKey = credentials?.api_key || credentials?.apiKey;
  if (!apiKey) {
    throw new Error('api_key is required to test Google Generative AI connectivity');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(identifier)}?key=${encodeURIComponent(apiKey)}`
  );
  const payload = await safeJsonParse(response);

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, `Google Generative AI API responded with status ${response.status}`));
  }

  // Check for error in payload (Google sometimes returns 200 with error)
  if (payload && typeof payload === 'object' && payload.error) {
    throw new Error(extractErrorMessage(payload.error, 'Google Generative AI API reported an error'));
  }

  return {
    provider: 'google',
    message: `Google Generative AI model "${identifier}" is reachable`,
  };
}

/**
 * Test Anthropic model connectivity
 * Lists available models and verifies the requested model exists
 * @param {Object} credentials - Provider credentials
 * @param {string} credentials.api_key - Anthropic API key
 * @param {string} modelName - Model name to test (e.g., 'claude-3-5-sonnet-20241022')
 * @param {string} modelKey - Model key (fallback)
 * @returns {Promise<{provider: string, message: string}>} Success result
 * @throws {Error} If connectivity test fails
 */
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

/**
 * Test AWS Bedrock model connectivity
 * Attempts to invoke the model with a test payload
 * @param {Object} credentials - Provider credentials
 * @param {string} credentials.aws_access_key_id - AWS access key ID
 * @param {string} credentials.aws_secret_access_key - AWS secret access key
 * @param {string} credentials.region - AWS region
 * @param {string} credentials.aws_session_token - AWS session token (optional)
 * @param {string} modelName - Bedrock model ID to test
 * @param {string} modelKey - Model key (fallback)
 * @returns {Promise<{provider: string, message: string}>} Success result
 * @throws {Error} If connectivity test fails
 */
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

    // Some errors indicate the service is reachable but the request is invalid
    // This is still considered a successful connectivity test
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

/**
 * Test Anthropic Foundry model connectivity
 * Uses Anthropic Foundry SDK with the specified model
 * @param {Object} credentials - Provider credentials (api_key, base_url)
 * @param {string} modelName - Model name (deployment name) to test
 * @param {string} modelKey - Model key (fallback)
 * @returns {Promise<{provider: string, message: string}>} Success result
 */
async function testAnthropicFoundryModel(credentials, modelName, modelKey) {
  const identifier = resolveModelIdentifier(modelName, modelKey);
  if (!identifier) {
    throw new Error('Model name is required to test Anthropic Foundry connectivity');
  }

  const apiKey = credentials?.api_key || credentials?.apiKey;
  const baseUrl = credentials?.base_url || credentials?.baseUrl;
  if (!apiKey) {
    throw new Error('api_key is required to test Anthropic Foundry connectivity');
  }
  if (!baseUrl) {
    throw new Error('base_url is required to test Anthropic Foundry connectivity');
  }

  const baseURL = baseUrl.replace(/\/$/, '');
  const client = new AnthropicFoundry({
    apiKey,
    baseURL,
  });

  await client.messages.create({
    model: identifier,
    max_tokens: 1,
    messages: [{ role: 'user', content: 'Hi' }],
  });

  return {
    provider: 'anthropic_foundry',
    message: `Anthropic Foundry model "${identifier}" is reachable`,
  };
}

/**
 * Test model connectivity based on provider type
 * Routes to the appropriate provider-specific test function
 * @param {string} providerType - Provider type (openai, azure_openai, google, anthropic, anthropic_bedrock, anthropic_foundry)
 * @param {Object} credentials - Provider credentials
 * @param {string} modelName - Model name to test
 * @param {string} modelKey - Model key (fallback)
 * @returns {Promise<{provider: string, message: string}>} Success result
 * @throws {Error} If connectivity test fails or provider type unsupported
 */
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
    case 'anthropic_foundry':
      return testAnthropicFoundryModel(credentials, modelName, modelKey);
    default:
      throw new Error(`Connectivity test for provider type "${providerType}" is not supported yet`);
  }
}

// ============================================================================
// Data Transformation Functions
// ============================================================================

/**
 * Transform database row to camelCase model object
 * @param {Object} row - Database row from models_with_teams view
 * @returns {Object} Camel-cased model object
 */
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

// Authentication & Authorization helpers imported from route-helpers.js

// ============================================================================
// Database Query Helpers
// ============================================================================

/**
 * Fetches a model by ID with provider and team information
 * @param {Pool} pool - Database connection pool
 * @param {string} id - Model ID
 * @param {string} organizationId - Organization ID
 * @returns {Promise<Object|null>} Model object or null if not found
 */
async function fetchModelById(pool, id, organizationId) {
  const { rows } = await pool.query(
    `SELECT m.*, p.provider_key, p.provider_type
     FROM models_with_teams m
     JOIN providers p ON m.provider_id = p.id
     WHERE m.id = $1 AND m.organization_id = $2 AND m.deleted_at IS NULL`,
    [id, organizationId],
  );

  return rows[0] ? toCamelModel(rows[0]) : null;
}

/**
 * Invalidates all configuration caches after model changes
 * Must be called after any create/update/delete operation
 */
function invalidateConfigCaches() {
  invalidateDbCache();
  invalidateLoaderCache();
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /api/admin/models
 * List all models for an organization, optionally filtered by teams
 * 
 * Requires: Authentication, Organization Admin/Owner role
 * 
 * Query Parameters:
 * - organizationId: string (required, UUID) - Organization ID
 * - teamIds?: string | string[] (optional) - Team ID(s) to filter by
 * 
 * Team Filtering Logic:
 * - If teamIds provided: Returns models that are either org-wide OR assigned to any of the specified teams
 * - If teamIds omitted: Returns all models for the organization
 * 
 * Responses:
 * - 200 OK: { models: ModelObject[], count: number }
 * - 400 Bad Request: Missing organizationId
 * - 401 Unauthorized: Not authenticated
 * - 403 Forbidden: User is not admin/owner
 * - 500 Internal Server Error: Database or server error
 */
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
         AND m.deleted_at IS NULL
         ${teamFilter}
       ORDER BY COALESCE(m.display_name, m.model_name) ASC`,
      params,
    );

    res.json({ models: rows.map(toCamelModel), count: rows.length });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/models
 * Create a new model configuration
 * 
 * Requires: Authentication, Organization Admin/Owner role
 * 
 * Body:
 * - organizationId: string (required, UUID) - Organization ID
 * - providerId?: string (UUID) - Provider ID (either providerId or providerKey required)
 * - providerKey?: string - Provider key (e.g., 'anthropic_bedrock')
 * - modelKey: string (required) - Model key (e.g., 'claude-4.5-haiku')
 * - modelName: string (required) - Model name/ID (e.g., 'claude-4-5-haiku-20250514')
 * - displayName?: string - Human-readable display name
 * - description?: string - Model description
 * - enabled?: boolean - Whether model is enabled (default: true)
 * - modelSettings?: object - Model-specific settings override
 * - metadata?: object - Additional metadata
 * - teamIds?: string[] - Array of team IDs to associate (empty = org-wide)
 * 
 * Responses:
 * - 201 Created: { model: ModelObject }
 * - 400 Bad Request: Invalid input or validation error
 * - 401 Unauthorized: Not authenticated
 * - 403 Forbidden: User is not admin/owner
 * - 404 Not Found: Provider or team not found
 * - 500 Internal Server Error: Database or server error
 */
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

/**
 * PUT /api/admin/models/:modelId
 * Update an existing model configuration
 * 
 * Requires: Authentication, Organization Admin/Owner role
 * 
 * Path Parameters:
 * - modelId: string (UUID) - Model ID to update
 * 
 * Body:
 * - organizationId: string (required, UUID) - Organization ID
 * - providerId?: string (UUID) - Provider ID to change to
 * - providerKey?: string - Provider key to change to
 * - modelKey?: string - Model key to update
 * - modelName?: string - Model name/ID to update
 * - displayName?: string - Display name to update
 * - description?: string - Description to update
 * - enabled?: boolean - Enabled status to update
 * - modelSettings?: object - Model settings to update
 * - metadata?: object - Metadata to update
 * - teamIds?: string[] - Team associations to update (replaces all)
 * 
 * Responses:
 * - 200 OK: { model: ModelObject }
 * - 400 Bad Request: Invalid input or validation error
 * - 401 Unauthorized: Not authenticated
 * - 403 Forbidden: User is not admin/owner
 * - 404 Not Found: Model, provider, or team not found
 * - 500 Internal Server Error: Database or server error
 */
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

/**
 * POST /api/admin/models/:modelId/test
 * Test connectivity for an existing model configuration
 * 
 * Tests that the model is accessible with the provider's credentials.
 * Optionally allows testing with override parameters before saving.
 * 
 * Requires: Authentication, Organization Admin/Owner role
 * 
 * Path Parameters:
 * - modelId: string (UUID) - Model ID to test
 * 
 * Body:
 * - organizationId: string (required, UUID) - Organization ID
 * - teamId?: string (UUID) - Team ID for team-scoped validation
 * - providerId?: string (UUID) - Override provider for testing
 * - modelKey?: string - Override model key for testing
 * - modelName?: string - Override model name for testing
 * - modelSettings?: object - Override settings for testing (not saved)
 * - metadata?: object - Override metadata for testing (not saved)
 * 
 * Team Scope Validation:
 * If both model and provider have team restrictions, they must share at least one team.
 * 
 * Responses:
 * - 200 OK: { ok: true, result: { provider, message } }
 * - 400 Bad Request: Invalid input or team compatibility error
 * - 401 Unauthorized: Not authenticated
 * - 403 Forbidden: User is not admin/owner
 * - 404 Not Found: Model, provider, or team not found
 * - 502 Bad Gateway: Connectivity test failed
 * - 500 Internal Server Error: Database or server error
 */
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
        WHERE m.id = $1 AND m.organization_id = $2 AND m.deleted_at IS NULL`,
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

/**
 * POST /api/admin/models/test-new
 * Test connectivity for a new model before creating it
 * 
 * Allows testing model connectivity without saving the configuration.
 * Useful for validating credentials and model availability before creation.
 * 
 * Requires: Authentication, Organization Admin/Owner role
 * 
 * Body:
 * - organizationId: string (required, UUID) - Organization ID
 * - providerId: string (required, UUID) - Provider ID
 * - modelKey?: string - Model key for testing
 * - modelName: string (required) - Model name/ID to test
 * - modelSettings?: object - Settings for testing (not saved)
 * - metadata?: object - Metadata for testing (not saved)
 * 
 * Responses:
 * - 200 OK: { ok: true, result: { provider, message } }
 * - 400 Bad Request: Invalid input or validation error
 * - 401 Unauthorized: Not authenticated
 * - 403 Forbidden: User is not admin/owner
 * - 404 Not Found: Provider not found
 * - 502 Bad Gateway: Connectivity test failed
 * - 500 Internal Server Error: Database or server error
 */
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

/**
 * DELETE /api/admin/models/:modelId
 * Delete a model configuration
 * 
 * Requires: Authentication, Organization Admin/Owner role
 * 
 * Path Parameters:
 * - modelId: string (UUID) - Model ID to delete
 * 
 * Query Parameters:
 * - organizationId: string (required, UUID) - Organization ID
 * 
 * Responses:
 * - 200 OK: { ok: true }
 * - 400 Bad Request: Missing organizationId
 * - 401 Unauthorized: Not authenticated
 * - 403 Forbidden: User is not admin/owner
 * - 404 Not Found: Model not found
 * - 500 Internal Server Error: Database or server error
 */
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

    // Soft delete: set deleted_at timestamp instead of hard delete
    const { rowCount } = await pool.query(
      'UPDATE models SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
      [modelId, organizationId]
    );

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

