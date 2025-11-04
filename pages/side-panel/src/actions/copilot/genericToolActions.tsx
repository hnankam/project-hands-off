/**
 * Generic CopilotKit Actions
 * 
 * Dynamically creates CopilotKit actions for all backend tools that don't have
 * specific custom rendering logic defined elsewhere.
 * 
 * This component:
 * 1. Fetches tool list from backend /tools/{agent_type}/{model} endpoint
 * 2. Filters out tools already handled by specific action files (jira, search, screenshot, dom)
 * 3. Creates generic ActionStatus renderers for remaining tools
 */

import React, { useEffect, useState } from 'react';
import { ActionStatus } from '../../components/ActionStatus';

interface GenericToolActionDependencies {
  isLight: boolean;
  agentType: string;
  model: string;
  organizationId: string;
  teamId: string;
}

interface ToolParameter {
  name: string;
  type: string;
  description?: string;
  required: boolean;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  source: 'custom' | 'mcp' | 'builtin';
  mcp_server?: string;
}

/**
 * Default icon for generic tools (professional settings gear)
 */
const GenericToolIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0, marginRight: 6 }}
  >
    <defs>
      <linearGradient id="genericToolGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: '#3B82F6', stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: '#1E40AF', stopOpacity: 1 }} />
      </linearGradient>
    </defs>
    {/* Clean gear/settings icon */}
    <path
      stroke="url(#genericToolGradient)"
      fill="none"
      d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
    />
    <circle cx="12" cy="12" r="3" stroke="url(#genericToolGradient)" fill="none" />
  </svg>
);

/**
 * Helper to clip text for display
 */
const clipText = (text: string | undefined, maxLen: number): string => {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
};

/**
 * Helper to format tool name for display
 */
const formatToolName = (toolName: string): string => {
  // Remove common prefixes
  let formatted = toolName
    .replace(/^(corp-|mcp_|builtin_)/, '')
    .replace(/_/g, ' ')
    .trim();
  
  // Capitalize first letter of each word
  formatted = formatted
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  return formatted;
};

/**
 * Tools already handled by specific action files - these will be excluded from generic rendering
 * 
 * Note: Frontend-only tools (search, screenshot, DOM) are registered with useCopilotAction
 * and won't appear in the backend /tools endpoint, so they won't conflict. However, they're
 * included here as documentation and as a safeguard in case they're ever added to the backend.
 */
const EXCLUDED_TOOLS = new Set([
  // === MCP TOOLS WITH CUSTOM RENDERING ===
  // Jira tools (handled by jiraActions.tsx)
  'corp-jira_test_jira_auth',
  'corp-jira_search_jira_issues',
  'corp-jira_create_jira_issue',
  'corp-jira_update_jira_issue',
  'corp-jira_get_jira_comments',
  'corp-jira_add_jira_comment',
  'corp-jira_get_jira_transitions',
  'corp-jira_transition_jira_status',
  'corp-jira_transition_jira_status_by_name',
  
  // === BACKEND TOOLS WITH CUSTOM RENDERING ===
  // Plan tools (custom rendering in TaskProgressCard)
  'create_plan',
  'update_plan_step',
  
  // Weather tool (has custom WeatherCard rendering)
  'get_weather',
  
  // === FRONTEND-ONLY TOOLS (won't appear in /tools endpoint) ===
  // These are included as documentation/safeguard only
  // Search tools (frontend only, handled by searchActions.tsx)
  'searchPageContent',
  'searchFormData',
  'searchDOMUpdates',
  'searchClickableElements',
  
  // Screenshot tool (frontend only, handled by screenshotActions.tsx)
  'takeScreenshot',
  
  // DOM tools (frontend only, handled by domActions.tsx)
  'moveCursor',
  'clickElement',
  'typeInElement',
  'scrollToElement',
  'pressKey',
  'hoverElement',
  'focusElement',
]);

/**
 * Fetch available tools from backend
 */
const fetchTools = async (
  agentType: string,
  model: string,
  organizationId: string,
  teamId: string
): Promise<ToolDefinition[]> => {
  try {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';
    const url = `${backendUrl}/tools/${agentType}/${model}`;
    
    console.log('[GenericToolActions] Fetching from URL:', url);
    console.log('[GenericToolActions] Headers:', {
      'x-copilot-organization-id': organizationId,
      'x-copilot-team-id': teamId,
    });
    
    const response = await fetch(url, {
      headers: {
        'x-copilot-organization-id': organizationId,
        'x-copilot-team-id': teamId,
      },
    });
    
    console.log('[GenericToolActions] Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[GenericToolActions] Failed to fetch tools:', response.statusText, errorText);
      return [];
    }
    
    const data = await response.json();
    console.log('[GenericToolActions] Response data:', data);
    return data.tools || [];
  } catch (error) {
    console.error('[GenericToolActions] Error fetching tools:', error);
    console.error('[GenericToolActions] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return [];
  }
};

/**
 * Hook to fetch and cache tools
 */
export const useGenericTools = (deps: GenericToolActionDependencies): ToolDefinition[] => {
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const { agentType, model, organizationId, teamId } = deps;
  
  useEffect(() => {
    console.log('[GenericToolActions] useGenericTools called with:', { agentType, model, organizationId, teamId });
    
    // Skip if we don't have required params
    if (!agentType || !model || !organizationId || !teamId) {
      console.warn('[GenericToolActions] Missing required params, skipping fetch:', { agentType, model, organizationId, teamId });
      return;
    }
    
    let mounted = true;
    
    const loadTools = async () => {
      console.log('[GenericToolActions] Fetching tools from backend...');
      const fetchedTools = await fetchTools(agentType, model, organizationId, teamId);
      console.log(`[GenericToolActions] Received ${fetchedTools.length} tools from backend`);
      
      if (mounted) {
        // Filter out excluded tools
        const genericTools = fetchedTools.filter(tool => !EXCLUDED_TOOLS.has(tool.name));
        setTools(genericTools);
        
        console.log(`[GenericToolActions] Loaded ${genericTools.length} generic tools (${fetchedTools.length} total, ${fetchedTools.length - genericTools.length} excluded)`);
        if (genericTools.length > 0) {
          console.log('[GenericToolActions] First 5 generic tools:', genericTools.slice(0, 5).map(t => t.name));
        }
      }
    };
    
    loadTools();
    
    return () => {
      mounted = false;
    };
  }, [agentType, model, organizationId, teamId]);
  
  return tools;
};

/**
 * Creates generic CopilotKit actions for backend tools
 * 
 * Note: These actions are set to 'disabled' because they are executed by the backend.
 * The frontend only handles UI rendering when the backend calls these tools.
 */
export const createGenericToolActions = (
  tools: ToolDefinition[],
  isLight: boolean
) => {
  console.log(`[GenericToolActions] Creating ${tools.length} generic actions`);
  if (tools.length > 0) {
    console.log('[GenericToolActions] Action names:', tools.map(t => t.name));
  }
  
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description || `Execute ${formatToolName(tool.name)}`,
    available: 'disabled' as const,
    parameters: tool.parameters.map(param => ({
      name: param.name,
      type: param.type,
      description: param.description,
      required: param.required,
    })),
    render: ({ args, result, status, error }: any) => {
      // Build display name
      const displayName = formatToolName(tool.name);
      
      // Build context-aware messages
      let contextInfo = '';
      if (args) {
        // Try to find a meaningful context from args
        const firstParam = tool.parameters[0];
        if (firstParam && args[firstParam.name]) {
          const value = String(args[firstParam.name]);
          contextInfo = `: ${clipText(value, 40)}`;
        }
      }
      
      const messages = {
        pending: `Starting ${displayName}${contextInfo}...`,
        inProgress: `${displayName} in progress${contextInfo}...`,
        complete: error 
          ? `${displayName} failed: ${clipText(String(error), 60)}`
          : `${displayName} complete`,
      };
      
      // Add result summary to complete message if available
      if (status === 'complete' && result && !error) {
        if (typeof result === 'object') {
          // Try to extract meaningful result info
          if (result.count !== undefined) {
            messages.complete += ` (${result.count} items)`;
          } else if (result.total !== undefined) {
            messages.complete += ` (${result.total} total)`;
          } else if (result.success !== undefined) {
            messages.complete = result.success ? `${displayName} successful` : `${displayName} failed`;
          } else if (result.status) {
            messages.complete += ` (${result.status})`;
          }
        }
      }
      
      return (
        <ActionStatus
          toolName={displayName}
          status={status as any}
          isLight={isLight}
          icon={<GenericToolIcon />}
          messages={messages}
          args={args}
          result={result}
          error={error}
        />
      );
    },
  }));
};

