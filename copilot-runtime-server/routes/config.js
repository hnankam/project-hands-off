/**
 * Configuration endpoints for side panel selectors
 * 
 * These endpoints provide data formatted specifically for the React components
 * in the Chrome extension's side panel:
 * 
 * - AgentSelector expects: { id: string, label: string, description?: string }
 * - ModelSelector expects: { id: string, label: string, provider: string }
 * 
 * Example responses:
 * 
 * GET /api/config/agents
 * {
 *   "agents": [
 *     { "id": "general", "label": "General Agent", "description": "..." },
 *     { "id": "wiki", "label": "Wiki Agent", "description": "..." }
 *   ],
 *   "count": 2
 * }
 * 
 * GET /api/config/models
 * {
 *   "models": [
 *     { "id": "claude-4.5-haiku", "label": "Claude 4.5 Haiku", "provider": "Anthropic" },
 *     { "id": "gemini-2.5-flash", "label": "Gemini 2.5 Flash", "provider": "Google" }
 *   ],
 *   "default_model": "claude-4.5-haiku",
 *   "count": 2
 * }
 * 
 * GET /api/config/defaults
 * {
 *   "default_agent": "general",
 *   "default_model": "claude-4.5-haiku"
 * }
 * 
 * GET /api/config (complete configuration)
 * {
 *   "agents": [...],
 *   "models": [...],
 *   "defaults": { "agent": "general", "model": "claude-4.5-haiku" }
 * }
 */

import { loadModelsConfig, loadAgentsConfig } from '../config/loader.js';

/**
 * GET /api/config/agents
 * Returns list of available agents for side panel selector
 * Format matches AgentSelector component: { id, label }
 */
export async function getAgentsHandler(req, res, next) {
  try {
    const config = await loadAgentsConfig();
    
    // Format for side panel AgentSelector: { id, label }
    const agents = config.agents
      .filter(agent => agent.enabled)
      .map(agent => ({
        id: agent.type,        // e.g., "general", "wiki", "jira"
        label: agent.name,     // e.g., "General Agent", "Wiki Agent"
        description: agent.description || ''
      }));
    
    res.json({
      agents,
      count: agents.length
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/config/models
 * Returns list of available models for side panel selector
 * Format matches ModelSelector component: { id, label, provider }
 */
export async function getModelsHandler(req, res, next) {
  try {
    const config = await loadModelsConfig();
    
    // Map provider keys to display names
    const providerDisplayNames = {
      'anthropic': 'Anthropic',
      'anthropic_bedrock': 'Anthropic',
      'google': 'Google',
      'azure_openai': 'OpenAI',
      'openai': 'OpenAI'
    };
    
    // Format for side panel ModelSelector: { id, label, provider }
    const models = config.models
      .filter(model => model.enabled)
      .map(model => ({
        id: model.key,                                          // e.g., "claude-4.5-haiku"
        label: model.name,                                      // e.g., "Claude 4.5 Haiku"
        provider: providerDisplayNames[model.provider] || model.provider  // e.g., "Anthropic"
      }));
    
    res.json({
      models,
      default_model: config.default_model,
      count: models.length
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/config/defaults
 * Returns default agent and model selections
 */
export async function getDefaultsHandler(req, res, next) {
  try {
    const modelsConfig = await loadModelsConfig();
    
    res.json({
      default_agent: modelsConfig.default_agent,
      default_model: modelsConfig.default_model
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/config
 * Returns complete configuration (agents + models + defaults)
 * Formats match the respective selector components
 */
export async function getCompleteConfigHandler(req, res, next) {
  try {
    const [modelsConfig, agentsConfig] = await Promise.all([
      loadModelsConfig(),
      loadAgentsConfig()
    ]);
    
    // Map provider keys to display names
    const providerDisplayNames = {
      'anthropic': 'Anthropic',
      'anthropic_bedrock': 'Anthropic',
      'google': 'Google',
      'azure_openai': 'OpenAI',
      'openai': 'OpenAI'
    };
    
    res.json({
      // Format for AgentSelector: { id, label, description }
      agents: agentsConfig.agents
        .filter(agent => agent.enabled)
        .map(agent => ({
          id: agent.type,
          label: agent.name,
          description: agent.description || ''
        })),
      // Format for ModelSelector: { id, label, provider }
      models: modelsConfig.models
        .filter(model => model.enabled)
        .map(model => ({
          id: model.key,
          label: model.name,
          provider: providerDisplayNames[model.provider] || model.provider
        })),
      defaults: {
        agent: modelsConfig.default_agent,
        model: modelsConfig.default_model
      }
    });
  } catch (error) {
    next(error);
  }
}

