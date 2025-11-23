/**
 * Provider Routes (Admin)
 * 
 * Manages LLM provider configurations for organizations.
 * Providers define the API credentials and settings for accessing LLM services
 * (e.g., OpenAI, Anthropic, Google Gemini, Azure OpenAI, AWS Bedrock).
 * 
 * **Features:**
 * - CRUD operations for providers
 * - Multi-team support (org-wide or team-specific)
 * - Provider connectivity testing
 * - Credential validation
 * - Team scope validation
 * 
 * **Multi-Tenancy:**
 * - Organization-scoped (all providers belong to an organization)
 * - Team-scoped (providers can be restricted to specific teams)
 * - Models must use providers within compatible team scopes
 * 
 * **Supported Provider Types:**
 * - `openai` - OpenAI API (GPT models)
 * - `azure_openai` - Azure OpenAI Service (GPT models via Azure)
 * - `google` - Google Generative AI (Gemini models)
 * - `anthropic` - Anthropic API (Claude models)
 * - `anthropic_bedrock` - AWS Bedrock (Claude models via Bedrock)
 * 
 * **Connectivity Testing:**
 * Each provider type has dedicated test functions that verify:
 * - Valid API credentials
 * - Service accessibility
 * - Proper configuration
 * 
 * @module routes/providers
 */

import express from 'express';
import { getPool } from '../config/database.js';
import { log, logError } from '../utils/logger.js';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { syncTeamAssociations } from '../lib/team-helpers.js';
import {
  sanitizeJSON,
  ensureHttps,
  safeJsonParse,
  extractErrorMessage,
  ensureAuthenticated,
  ensureOrgAdmin,
  validateTeamBelongsToOrg,
} from '../utils/route-helpers.js';

const router = express.Router();

// ============================================================================
// Constants
// ============================================================================

/**
 * Supported LLM provider types
 * @constant {Set<string>}
 */
const SUPPORTED_PROVIDER_TYPES = new Set([
  'anthropic',
  'anthropic_bedrock',
  'google',
  'openai',
  'azure_openai',
]);

// Utility functions imported from route-helpers.js

// ============================================================================
// Provider Connectivity Test Functions
// ============================================================================

/**
 * Test OpenAI provider connectivity
 * Lists available models to verify API key validity
 * @param {Object} credentials - Provider credentials
 * @param {string} credentials.api_key - OpenAI API key
 * @returns {Promise<{provider: string, message: string}>} Success result
 * @throws {Error} If connectivity test fails
 */
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

/**
 * Test Azure OpenAI provider connectivity
 * Attempts to list deployments, falls back to models endpoint on 404
 * @param {Object} credentials - Provider credentials
 * @param {string} credentials.api_key - Azure OpenAI API key
 * @param {string} credentials.endpoint - Azure OpenAI endpoint
 * @param {string} credentials.api_version - API version (default: 2024-02-15-preview)
 * @returns {Promise<{provider: string, message: string}>} Success result
 * @throws {Error} If connectivity test fails
 */
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

    // Some Azure OpenAI resources return 404 for deployments listing
    // Try fallback to models endpoint
    if (response.status === 404) {
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

/**
 * Test Anthropic provider connectivity
 * Lists available models to verify API key validity
 * @param {Object} credentials - Provider credentials
 * @param {string} credentials.api_key - Anthropic API key
 * @returns {Promise<{provider: string, message: string}>} Success result
 * @throws {Error} If connectivity test fails
 */
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

/**
 * Test Google Generative AI provider connectivity
 * Lists available models to verify API key validity and model availability
 * @param {Object} credentials - Provider credentials
 * @param {string} credentials.api_key - Google API key
 * @returns {Promise<{provider: string, message: string}>} Success result
 * @throws {Error} If connectivity test fails
 */
async function testGoogleProvider(credentials) {
  const apiKey = credentials?.api_key || credentials?.apiKey;
  if (!apiKey) {
    throw new Error('api_key is required to test Google Generative AI connectivity');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'GET',
    }
  );

  const payload = await safeJsonParse(response);

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, `Google Generative AI API responded with status ${response.status}`));
  }

  // Check for error in payload (Google sometimes returns 200 with error)
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

/**
 * Test AWS Bedrock provider connectivity
 * Attempts to invoke a test model to validate AWS credentials
 * @param {Object} credentials - Provider credentials
 * @param {string} credentials.aws_access_key_id - AWS access key ID
 * @param {string} credentials.aws_secret_access_key - AWS secret access key
 * @param {string} credentials.region - AWS region
 * @param {string} credentials.aws_session_token - AWS session token (optional)
 * @returns {Promise<{provider: string, message: string}>} Success result
 * @throws {Error} If connectivity test fails
 */
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
    // Attempt a minimal invocation against a well-known model to validate credentials
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

    // Some errors indicate credentials are valid but model access is restricted
    // This is still considered a successful connectivity test
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

/**
 * Test provider connectivity based on provider type
 * Routes to the appropriate provider-specific test function
 * @param {string} providerType - Provider type (openai, azure_openai, google, anthropic, anthropic_bedrock)
 * @param {Object} credentials - Provider credentials
 * @param {Object} bedrockModelSettings - Bedrock-specific settings (unused, for API compatibility)
 * @param {Object} _extra - Additional settings (unused, reserved for future use)
 * @returns {Promise<{provider: string, message: string}>} Success result
 * @throws {Error} If connectivity test fails or provider type unsupported
 */
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

// ============================================================================
// Data Transformation Functions
// ============================================================================

/**
 * Transform database row to camelCase provider object
 * @param {Object} row - Database row from providers_with_teams view
 * @returns {Object} Camel-cased provider object
 */
const toCamelProvider = (row) => ({
  id: row.id,
  providerKey: row.provider_key,
  providerType: row.provider_type,
  organizationId: row.organization_id,
  teams: row.teams || [], // Array of {id, name} objects from the view
  credentials: row.credentials || {},
  modelSettings: row.model_settings || {},
  bedrockModelSettings: row.bedrock_model_settings || null,
  metadata: row.metadata || {},
  enabled: row.enabled,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// Authentication & Authorization helpers imported from route-helpers.js

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /api/admin/providers
 * List all providers for an organization, optionally filtered by teams
 * 
 * Requires: Authentication, Organization Admin/Owner role
 * 
 * Query Parameters:
 * - organizationId: string (required, UUID) - Organization ID
 * - teamIds?: string | string[] (optional) - Team ID(s) to filter by
 * 
 * Team Filtering Logic:
 * - If teamIds provided: Returns providers that are either org-wide OR assigned to any of the specified teams
 * - If teamIds omitted: Returns all providers for the organization
 * 
 * Responses:
 * - 200 OK: { providers: ProviderObject[], count: number }
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
    
    // If teamIds are specified, filter to show only providers that:
    // 1. Are organization-wide (no team restrictions), OR
    // 2. Include at least one of the specified teams
    if (teamIds.length > 0) {
      teamFilter = `
        AND (
          NOT EXISTS (SELECT 1 FROM provider_teams pt WHERE pt.provider_id = p.id)
          OR EXISTS (
            SELECT 1 FROM provider_teams pt 
            WHERE pt.provider_id = p.id AND pt.team_id = ANY($2::text[])
          )
        )
      `;
      params.push(teamIds);
    }

    // Get all providers for the organization with their teams (filtered by org and optionally by team)
    const { rows } = await pool.query(
      `SELECT 
         p.*,
         COALESCE(
           (SELECT json_agg(json_build_object('id', team.id, 'name', team.name) ORDER BY team.name)
            FROM provider_teams pt
            JOIN team ON team.id = pt.team_id
            WHERE pt.provider_id = p.id
              AND team."organizationId" = $1),
           '[]'::json
         ) as teams
       FROM providers p
       WHERE p.organization_id = $1
         ${teamFilter}
       ORDER BY p.created_at DESC`,
      params,
    );

    res.json({ providers: rows.map(toCamelProvider), count: rows.length });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/providers
 * Create a new provider configuration
 * 
 * Requires: Authentication, Organization Admin/Owner role
 * 
 * Body:
 * - organizationId: string (required, UUID) - Organization ID
 * - providerKey: string (required) - Unique provider key (e.g., 'my-openai')
 * - providerType: string (required) - Provider type (openai, azure_openai, google, anthropic, anthropic_bedrock)
 * - enabled?: boolean - Whether provider is enabled (default: true)
 * - credentials: object (required) - Provider-specific credentials
 * - modelSettings?: object - Default model settings
 * - bedrockModelSettings?: object - Bedrock-specific settings
 * - metadata?: object - Additional metadata
 * - teamIds?: string[] - Array of team IDs to associate (empty = org-wide)
 * 
 * Responses:
 * - 201 Created: { provider: ProviderObject }
 * - 400 Bad Request: Invalid input or validation error
 * - 401 Unauthorized: Not authenticated
 * - 403 Forbidden: User is not admin/owner
 * - 404 Not Found: Team not found
 * - 409 Conflict: Provider key already exists
 * - 500 Internal Server Error: Database or server error
 */
router.post('/', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const {
      organizationId,
      teamIds = [], // Array of team IDs for multi-team support
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
         model_settings,
         bedrock_model_settings,
         metadata,
         enabled
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        providerKey,
        providerType,
        credentialsJSON,
        organizationId,
        modelSettingsJSON,
        bedrockSettingsJSON,
        metadataJSON,
        enabled,
      ],
    );

    const providerId = insertResult.rows[0].id;

    // Associate with teams if provided
    if (teamIds.length > 0) {
      await syncTeamAssociations(pool, 'provider_teams', 'provider_id', providerId, teamIds);
    }

    // Fetch the created provider with teams
    const { rows } = await pool.query('SELECT * FROM providers_with_teams WHERE id = $1', [providerId]);
    const provider = toCamelProvider(rows[0]);
    
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

/**
 * PUT /api/admin/providers/:providerId
 * Update an existing provider configuration
 * 
 * Requires: Authentication, Organization Admin/Owner role
 * 
 * Path Parameters:
 * - providerId: string (UUID) - Provider ID to update
 * 
 * Body:
 * - organizationId: string (required, UUID) - Organization ID
 * - providerKey?: string - Provider key to update
 * - providerType?: string - Provider type to update
 * - enabled?: boolean - Enabled status to update
 * - credentials?: object - Credentials to update
 * - modelSettings?: object - Model settings to update
 * - bedrockModelSettings?: object | null - Bedrock settings to update (null to clear)
 * - metadata?: object - Metadata to update
 * - teamIds?: string[] - Team associations to update (replaces all)
 * 
 * Responses:
 * - 200 OK: { provider: ProviderObject }
 * - 400 Bad Request: Invalid input or validation error
 * - 401 Unauthorized: Not authenticated
 * - 403 Forbidden: User is not admin/owner
 * - 404 Not Found: Provider or team not found
 * - 409 Conflict: Provider key already exists
 * - 500 Internal Server Error: Database or server error
 */
router.put('/:providerId', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { providerId } = req.params;
    const {
      organizationId,
      teamIds = [], // Array of team IDs for multi-team support
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

    await pool.query(
      `UPDATE providers SET
         provider_key = $1,
         provider_type = $2,
         credentials = $3,
         organization_id = $4,
         model_settings = $5,
         bedrock_model_settings = $6,
         metadata = $7,
         enabled = $8,
         updated_at = NOW()
       WHERE id = $9`,
      [
        providerKeyValue,
        providerTypeValue,
        credentialsJSON,
        organizationId,
        modelSettingsJSON,
        bedrockSettingsJSON,
        metadataJSON,
        enabled === undefined ? existing.enabled : !!enabled,
        providerId,
      ],
    );

    // Update team associations (always sync when teamIds is provided in request)
    if (teamIds !== undefined) {
      await syncTeamAssociations(pool, 'provider_teams', 'provider_id', providerId, teamIds);
    }

    // Fetch the updated provider with teams
    const { rows } = await pool.query('SELECT * FROM providers_with_teams WHERE id = $1', [providerId]);
    const provider = toCamelProvider(rows[0]);
    
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

/**
 * POST /api/admin/providers/:providerId/test
 * Test connectivity for an existing provider configuration
 * 
 * Tests that the provider is accessible with the configured credentials.
 * Optionally allows testing with override parameters before saving.
 * 
 * Requires: Authentication, Organization Admin/Owner role
 * 
 * Path Parameters:
 * - providerId: string (UUID) - Provider ID to test
 * 
 * Body:
 * - organizationId: string (required, UUID) - Organization ID
 * - teamIds?: string[] - Team IDs for validation (not used in test)
 * - providerType?: string - Override provider type for testing
 * - credentials?: object - Override credentials for testing
 * - modelSettings?: object - Override model settings for testing (not saved)
 * - bedrockModelSettings?: object - Override Bedrock settings for testing (not saved)
 * - metadata?: object - Override metadata for testing (not saved)
 * 
 * Responses:
 * - 200 OK: { ok: true, result: { provider, message } }
 * - 400 Bad Request: Invalid input or validation error
 * - 401 Unauthorized: Not authenticated
 * - 403 Forbidden: User is not admin/owner
 * - 404 Not Found: Provider or team not found
 * - 502 Bad Gateway: Connectivity test failed
 * - 500 Internal Server Error: Database or server error
 */
router.post('/:providerId/test', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const { providerId } = req.params;
    const {
      organizationId,
      teamIds = [],
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

/**
 * POST /api/admin/providers/test-new
 * Test connectivity for a new provider before creating it
 * 
 * Allows testing provider connectivity without saving the configuration.
 * Useful for validating credentials and service availability before creation.
 * 
 * Requires: Authentication, Organization Admin/Owner role
 * 
 * Body:
 * - organizationId: string (required, UUID) - Organization ID
 * - providerType: string (required) - Provider type to test
 * - credentials: object (required) - Credentials to test
 * - modelSettings?: object - Model settings for testing (not saved)
 * - bedrockModelSettings?: object - Bedrock settings for testing (not saved)
 * - metadata?: object - Metadata for testing (not saved)
 * 
 * Responses:
 * - 200 OK: { ok: true, result: { provider, message } }
 * - 400 Bad Request: Invalid input or validation error
 * - 401 Unauthorized: Not authenticated
 * - 403 Forbidden: User is not admin/owner
 * - 502 Bad Gateway: Connectivity test failed
 * - 500 Internal Server Error: Database or server error
 */
router.post('/test-new', async (req, res, next) => {
  try {
    const session = await ensureAuthenticated(req, res);
    if (!session) return;

    const {
      organizationId,
      providerType,
      credentials,
      modelSettings,
      bedrockModelSettings,
      metadata,
    } = req.body || {};

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    if (!providerType) {
      return res.status(400).json({ error: 'providerType is required' });
    }

    const pool = getPool();

    const roles = await ensureOrgAdmin(pool, organizationId, session.user.id, res);
    if (!roles) return;

    let credentialsJSON;
    let modelSettingsJSON;
    let metadataJSON;
    let bedrockSettingsJSON;

    try {
      credentialsJSON = sanitizeJSON(credentials, {});
      modelSettingsJSON = sanitizeJSON(modelSettings, {});
      metadataJSON = sanitizeJSON(metadata, {});
      bedrockSettingsJSON = bedrockModelSettings ? sanitizeJSON(bedrockModelSettings, {}) : null;
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Invalid JSON payload' });
    }

    try {
      const result = await testProviderConnectivity(providerType, credentialsJSON, bedrockSettingsJSON, {
        modelSettings: modelSettingsJSON,
        metadata: metadataJSON,
      });

      log('[Providers API] New provider connectivity test succeeded', { providerType });
      res.json({ ok: true, result });
    } catch (err) {
      log('[Providers API] New provider connectivity test failed', {
        providerType,
        error: err.message,
      });
      res.status(502).json({ error: err.message || 'Provider connectivity test failed' });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/providers/:providerId
 * Delete a provider configuration
 * 
 * Note: Deleting a provider will affect all models that depend on it.
 * Ensure models are updated or removed before deleting a provider.
 * 
 * Requires: Authentication, Organization Admin/Owner role
 * 
 * Path Parameters:
 * - providerId: string (UUID) - Provider ID to delete
 * 
 * Query Parameters:
 * - organizationId: string (required, UUID) - Organization ID
 * 
 * Responses:
 * - 204 No Content: Provider deleted successfully
 * - 400 Bad Request: Missing organizationId
 * - 401 Unauthorized: Not authenticated
 * - 403 Forbidden: User is not admin/owner
 * - 404 Not Found: Provider not found
 * - 500 Internal Server Error: Database or server error
 */
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

