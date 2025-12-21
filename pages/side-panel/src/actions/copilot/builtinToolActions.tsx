/**
 * Builtin Tool CopilotKit Actions
 *
 * V2 ReactToolCallRenderer implementations for backend builtin tools:
 * - web_search: Web search with query display
 * - code_execution: Code execution with language/prompt display
 * - url_context: URL context loading with URL count display
 * - run_graph: Multi-agent graph execution
 * - generate_images: Image generation with gallery display
 * - * (wildcard): Default renderer for unhandled tools
 *
 * Uses Zod schemas for type-safe parameter definitions.
 * Configure via CopilotKitProvider's renderToolCalls prop.
 */

import React from 'react';
import { z } from 'zod';
import { ActionStatus } from '../../components/feedback/ActionStatus';
import { ImageGalleryCard } from '../../components/cards/ImageGalleryCard';
import { FileManagementCard } from '../../components/feedback/FileManagementCard';

// ============================================================================
// ZOD SCHEMAS FOR BACKEND TOOL PARAMETERS
// ============================================================================

/** Schema for web_search parameters */
export const webSearchSchema = z.object({
  prompt: z.string().optional(),
  query: z.string().optional(),
});

/** Schema for code_execution parameters */
export const codeExecutionSchema = z.object({
  prompt: z.string().optional(),
  code: z.string().optional(),
  language: z.string().optional(),
});

/** Schema for url_context parameters */
export const urlContextSchema = z.object({
  urls: z.array(z.string()).optional(),
});

/** Schema for run_graph parameters */
export const runGraphSchema = z.object({
  query: z.string(),
  max_iterations: z.number().optional(),
});

/** Schema for generate_images parameters */
export const generateImagesSchema = z.object({
  prompt: z.string(),
  num_images: z.number().optional(),
});

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum length for prompt text display */
const MAX_PROMPT_LENGTH = 60;

/** Maximum length for URL text display */
const MAX_URL_LENGTH = 50;

/** Icon size in pixels */
const ICON_SIZE = 14;

/** Icon margin right in pixels */
const ICON_MARGIN_RIGHT = 6;

// Note: Icon colors are now handled by ActionStatus component which reads theme from storage

// ============================================================================
// TYPES
// ============================================================================

/** Status values for tool render */
type ToolStatus = 'pending' | 'inProgress' | 'complete' | 'error';

/** Dependencies required by builtin tool renderers */
interface BuiltinToolDependencies {
  clipText: (text: string, maxLength: number) => string;
}


// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get icon style (layout only - color is handled by ActionStatus wrapper)
 */
function getIconStyle(): React.CSSProperties {
  return {
    flexShrink: 0,
    marginRight: ICON_MARGIN_RIGHT,
  };
}

/**
 * Common SVG props for all icons
 */
const svgProps = {
  width: ICON_SIZE,
  height: ICON_SIZE,
  viewBox: '0 0 24 24',
  fill: 'none',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/**
 * Safely get first element from array
 */
function getFirstElement<T>(arr: unknown): T | undefined {
  if (Array.isArray(arr) && arr.length > 0) {
    return arr[0] as T;
  }
  return undefined;
}


// ============================================================================
// ICONS
// ============================================================================

/** Globe icon for web search */
function GlobeIcon({ style }: { style: React.CSSProperties }): React.ReactElement {
  return (
    <svg {...svgProps} style={style}>
      <circle stroke="currentColor" cx="12" cy="12" r="10" />
      <path
        stroke="currentColor"
        d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
      />
      <path stroke="currentColor" d="M2 12h20" />
    </svg>
  );
}

/** Terminal icon for code execution */
function TerminalIcon({ style }: { style: React.CSSProperties }): React.ReactElement {
  return (
    <svg {...svgProps} style={style}>
      <rect stroke="currentColor" x="2" y="4" width="20" height="16" rx="2" />
      <path stroke="currentColor" d="M6 10l4 4-4 4" />
      <line stroke="currentColor" x1="14" y1="14" x2="18" y2="14" />
    </svg>
  );
}

/** Link chain icon for URL context */
function LinkIcon({ style }: { style: React.CSSProperties }): React.ReactElement {
  return (
    <svg {...svgProps} style={style}>
      <path
        stroke="currentColor"
        d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
      />
      <path
        stroke="currentColor"
        d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
      />
    </svg>
  );
}

/** Graph/network icon for multi-agent graph */
function GraphIcon({ style }: { style: React.CSSProperties }): React.ReactElement {
  return (
    <svg {...svgProps} style={style}>
      <circle stroke="currentColor" cx="18" cy="5" r="3" />
      <circle stroke="currentColor" cx="6" cy="12" r="3" />
      <circle stroke="currentColor" cx="18" cy="19" r="3" />
      <line stroke="currentColor" x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line stroke="currentColor" x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

/** Image icon for image generation */
function ImageIcon({ style }: { style: React.CSSProperties }): React.ReactElement {
  return (
    <svg {...svgProps} style={style}>
      <rect stroke="currentColor" x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle stroke="currentColor" cx="8.5" cy="8.5" r="1.5" />
      <polyline stroke="currentColor" points="21 15 16 10 5 21" />
    </svg>
  );
}

// ============================================================================
// V2 TOOL CALL RENDERERS (for CopilotKitProvider renderToolCalls prop)
// ============================================================================

/** V2 status type alias */
type V2ToolStatus = 'inProgress' | 'executing' | 'complete';

/** Map V2 status to our internal status */
function mapV2Status(status: V2ToolStatus): ToolStatus {
  switch (status) {
    case 'inProgress':
      return 'inProgress';
    case 'executing':
      return 'inProgress';
    case 'complete':
      return 'complete';
    default:
      return 'pending';
  }
}

/** V2 render props */
interface V2RenderProps<T> {
  name: string;
  args: T;
  status: V2ToolStatus;
  result?: string;
}

/**
 * Creates V2-compatible ReactToolCallRenderer for web_search
 */
export function createWebSearchRenderer(deps: BuiltinToolDependencies) {
  const { clipText } = deps;
  
  return {
    name: 'web_search',
    args: webSearchSchema,
    render: (props: V2RenderProps<z.infer<typeof webSearchSchema>>) => {
      const prompt = props.args?.prompt || props.args?.query || '';
      const displayText = prompt ? ` "${clipText(prompt, MAX_PROMPT_LENGTH)}"` : '';
      const status = mapV2Status(props.status);

      const instanceId = `web-search-${clipText(prompt, 50)}`;

      return (
        <ActionStatus
          toolName="Web Search"
          status={status}
          icon={<GlobeIcon style={getIconStyle()} />}
          messages={{
            pending: `Starting web search${displayText}…`,
            inProgress: `Searching the web${displayText}…`,
            complete: `Web search complete${displayText}`,
          }}
          args={props.args}
          result={props.result}
          instanceId={instanceId}
        />
      );
    },
  };
}

/**
 * Creates V2-compatible ReactToolCallRenderer for code_execution
 */
export function createCodeExecutionRenderer(deps: BuiltinToolDependencies) {
  const { clipText } = deps;
  
  return {
    name: 'code_execution',
    args: codeExecutionSchema,
    render: (props: V2RenderProps<z.infer<typeof codeExecutionSchema>>) => {
      const prompt = props.args?.prompt || '';
      const displayText = prompt ? ` "${clipText(prompt, MAX_PROMPT_LENGTH)}"` : '';
      const status = mapV2Status(props.status);

      const instanceId = `code-execution-${clipText(prompt, 50)}`;

      return (
        <ActionStatus
          toolName="Code Execution"
          status={status}
          icon={<TerminalIcon style={getIconStyle()} />}
          messages={{
            pending: `Starting code execution${displayText}…`,
            inProgress: `Executing code${displayText}…`,
            complete: `Code execution complete${displayText}`,
          }}
          args={props.args}
          result={props.result}
          instanceId={instanceId}
        />
      );
    },
  };
}

/**
 * Creates V2-compatible ReactToolCallRenderer for url_context
 */
export function createUrlContextRenderer(deps: BuiltinToolDependencies) {
  const { clipText } = deps;
  
  return {
    name: 'url_context',
    args: urlContextSchema,
    render: (props: V2RenderProps<z.infer<typeof urlContextSchema>>) => {
      const urls = props.args?.urls;
      const urlCount = Array.isArray(urls) ? urls.length : 0;
      const urlDisplay = urlCount > 0 ? ` (${urlCount} URL${urlCount !== 1 ? 's' : ''})` : '';
      const firstUrl = getFirstElement<string>(urls);
      const firstUrlDisplay = firstUrl ? ` - ${clipText(firstUrl, MAX_URL_LENGTH)}` : '';
      const status = mapV2Status(props.status);

      const instanceId = `url-context-${firstUrl ? clipText(firstUrl, 50) : urlCount}`;

      return (
        <ActionStatus
          toolName="Load URL Context"
          status={status}
          icon={<LinkIcon style={getIconStyle()} />}
          messages={{
            pending: `Starting URL context load${urlDisplay}…`,
            inProgress: `Loading URL context${urlDisplay}${firstUrlDisplay}…`,
            complete: `URL context loaded${urlDisplay}`,
          }}
          args={props.args}
          result={props.result}
          instanceId={instanceId}
        />
      );
    },
  };
}

/**
 * Creates V2-compatible ReactToolCallRenderer for run_graph
 * 
 * NOTE: The detailed graph state is rendered by the GraphStateCard activity message renderer.
 * This tool renderer just shows a simple status indicator - no need to display the raw result
 * which can contain LLM thinking content that might be misinterpreted as errors.
 */
export function createRunGraphRenderer(deps: BuiltinToolDependencies) {
  const { clipText } = deps;
  
  return {
    name: 'run_graph',
    args: runGraphSchema,
    render: (props: V2RenderProps<z.infer<typeof runGraphSchema>>) => {
      const query = props.args?.query || '';
      const displayText = query ? ` "${clipText(query, MAX_PROMPT_LENGTH)}"` : '';
      const status = mapV2Status(props.status);

      // Don't show result/error for run_graph - the GraphStateCard handles detailed display
      // The raw result may contain LLM thinking content that isn't meaningful to users
      return (
        <ActionStatus
          toolName="Multi-Agent Graph"
          status={status}
          icon={<GraphIcon style={getIconStyle()} />}
          messages={{
            pending: `Starting multi-agent graph${displayText}…`,
            inProgress: `Processing query${displayText}…`,
            complete: `Multi-agent graph complete`,
          }}
          args={props.args}
          // Intentionally not passing result/error to avoid showing raw LLM output
        />
      );
    },
  };
}

/**
 * Creates V2-compatible ReactToolCallRenderer for generate_images
 * 
 * Displays an ImageGalleryCard with the generated images.
 * The backend returns an array of image URLs.
 */
export function createGenerateImagesRenderer(deps: BuiltinToolDependencies & { themeColor?: string }) {
  const { clipText, themeColor = '#3b82f6' } = deps;
  
  return {
    name: 'generate_images',
    args: generateImagesSchema,
    render: (props: V2RenderProps<z.infer<typeof generateImagesSchema>>) => {
      const prompt = props.args?.prompt || '';
      const status = mapV2Status(props.status);
      
      // Parse result - backend returns array of image URLs
      let imageUrls: string[] = [];
      if (props.result) {
        try {
          // Result might be a JSON string or already an array
          if (typeof props.result === 'string') {
            const parsed = JSON.parse(props.result);
            imageUrls = Array.isArray(parsed) ? parsed : [];
          } else if (Array.isArray(props.result)) {
            imageUrls = props.result as string[];
          }
        } catch {
          // If parsing fails, check if it's a single URL
          if (typeof props.result === 'string' && props.result.startsWith('http')) {
            imageUrls = [props.result];
          }
        }
      }
      
      // Create unique instance ID from prompt for state persistence
      const instanceId = `generate-images-${prompt.slice(0, 50)}`;

      return (
        <ImageGalleryCard 
          status={status} 
          imageUrls={imageUrls} 
          prompt={prompt} 
          themeColor={themeColor}
          instanceId={instanceId}
        />
      );
    },
  };
}

/**
 * Creates V2-compatible ReactToolCallRenderer for create_text_file
 * 
 * Optimized to handle large file content without freezing the UI.
 */
export function createFileCreationRenderer(deps: BuiltinToolDependencies) {
  const { clipText } = deps;
  
  // Schema for create_text_file tool
  const createTextFileSchema = z.object({
    file_name: z.string(),
    content: z.string(),
    folder: z.string().optional(),
    tags: z.array(z.string()).optional(),
    description: z.string().optional(),
  });
  
  return {
    name: 'create_text_file',
    args: createTextFileSchema,
    render: (props: V2RenderProps<z.infer<typeof createTextFileSchema>>) => {
      const fileName = props.args?.file_name || 'file.txt';
      const folder = props.args?.folder;
      const content = props.args?.content || '';
      const status = mapV2Status(props.status);
      
      // Check for error in result
      const hasError = isErrorResult(props.result);
      const error = hasError ? props.result as string : undefined;
      
      // Calculate content size
      const contentSize = new Blob([content]).size;
      
      // Create unique instance ID based on file name
      const instanceId = `create-file-${clipText(fileName, 50)}`;

      return (
        <FileManagementCard
          fileName={fileName}
          folder={folder}
          status={status}
          result={props.result}
          error={error}
          content={content}
          contentSize={contentSize}
          instanceId={instanceId}
          operation="create"
        />
      );
    },
  };
}

/**
 * Creates V2-compatible ReactToolCallRenderer for update_file_content
 * 
 * Optimized to handle large file content updates without freezing the UI.
 */
export function createFileUpdateRenderer(deps: BuiltinToolDependencies) {
  const { clipText } = deps;
  
  // Schema for update_file_content tool
  const updateFileContentSchema = z.object({
    file_id: z.string(),
    content: z.string(),
    append: z.boolean().optional(),
    file_name: z.string().optional(),
  });
  
  return {
    name: 'update_file_content',
    args: updateFileContentSchema,
    render: (props: V2RenderProps<z.infer<typeof updateFileContentSchema>>) => {
      const content = props.args?.content || '';
      const status = mapV2Status(props.status);
      
      // Check for error in result
      const hasError = isErrorResult(props.result);
      const error = hasError ? props.result as string : undefined;
      
      // Extract file info - prioritize args.file_name, then result, then default
      let fileName = props.args?.file_name || 'file.txt';
      let folder = undefined;
      let fileId = props.args?.file_id || '';
      let displaySize = 0;
      
      // If we have a result, extract additional metadata
      if (props.result && typeof props.result === 'string' && !hasError) {
        try {
          const parsed = JSON.parse(props.result);
          // Update fileName only if we didn't get it from args
          if (!props.args?.file_name && parsed.file_name) {
            fileName = parsed.file_name;
          }
          // Extract folder from file_path
          if (parsed.folder) {
            folder = parsed.folder;
          } else if (parsed.file_path && parsed.file_path.includes('/')) {
            folder = parsed.file_path.split('/').slice(0, -1).join('/');
          }
          // Extract size
          if (parsed.size_bytes) {
            displaySize = parsed.size_bytes;
          }
          fileId = parsed.file_id || fileId;
        } catch {
          // If parsing fails, try regex extraction
          const fileNameMatch = props.result.match(/file[_\s]name['"]?\s*:\s*['"]?([^'"}\s,]+)/i);
          if (fileNameMatch && !props.args?.file_name) {
            fileName = fileNameMatch[1];
          }
        }
      }
      
      // Calculate content size (use actual result size if available, otherwise estimate from content)
      const contentSize = displaySize || new Blob([content]).size;
      
      // Create unique instance ID based on file ID
      const instanceId = `update-file-${clipText(fileId || fileName, 50)}`;

      return (
        <FileManagementCard
          fileName={fileName}
          folder={folder}
          status={status}
          result={props.result}
          error={error}
          content={content}
          contentSize={contentSize}
          instanceId={instanceId}
          operation="update"
        />
      );
    },
  };
}

/**
 * Creates all V2 backend tool renderers
 * Use this to get the renderToolCalls array for CopilotKitProvider
 */
export function createBackendToolRenderers(deps: BuiltinToolDependencies & { themeColor?: string }) {
  return [
    createWebSearchRenderer(deps),
    createCodeExecutionRenderer(deps),
    createUrlContextRenderer(deps),
    createRunGraphRenderer(deps),
    createGenerateImagesRenderer(deps),
    createFileCreationRenderer(deps),
    createFileUpdateRenderer(deps),
  ];
}

// ============================================================================
// DEFAULT/WILDCARD TOOL RENDERER
// ============================================================================

/** Default tool icon for unhandled tools - gear/cog icon */
function DefaultToolIcon({ style }: { style: React.CSSProperties }): React.ReactElement {
  return (
    <svg {...svgProps} style={style}>
      <path
        stroke="currentColor"
        fill="none"
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" fill="none" />
    </svg>
  );
}

/** Schema for wildcard tool - accepts any args */
export const wildcardToolSchema = z.any();

/**
 * Format tool name for display
 */
function formatToolName(name: string): string {
  const cleaned = name
    .replace(/^(mcp_|builtin_)/, '')
    .split(/[_-]/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  return cleaned || name || 'Tool';
}

/**
 * Check if a result string indicates an actual error (not just contains the word "error")
 */
function isErrorResult(result: unknown): boolean {
  if (typeof result !== 'string') return false;
  
  // Check for explicit error patterns at the start of the result
  const errorPatterns = [
    /^error:/i,
    /^failed:/i,
    /^exception:/i,
    /^traceback/i,
    /^\{"error":/i,
    /^{"type":\s*"error"/i,
    /^multi-agent graph execution failed/i,
  ];
  
  return errorPatterns.some(pattern => pattern.test(result.trim()));
}

/**
 * Creates V2-compatible wildcard ReactToolCallRenderer for unhandled tools
 * This catches any tool that doesn't have a specific renderer
 */
export function createDefaultToolRenderer(deps: BuiltinToolDependencies) {
  const { clipText } = deps;
  
  return {
    name: '*',  // Wildcard - matches any tool without a specific renderer
    args: wildcardToolSchema,
    render: (props: V2RenderProps<unknown>) => {
      // Exclude plan-related tools from default rendering (they have custom renderers)
      // const excludedTools = ['create_plan', 'update_plan_step'];
      // if (excludedTools.includes(props.name)) {
      //   return null;
      // }
      
      const displayName = formatToolName(props.name);
      const status = mapV2Status(props.status);
      
      let argsSummary = '';
      try {
        if (props.args && typeof props.args === 'object' && Object.keys(props.args as object).length > 0) {
          argsSummary = clipText(JSON.stringify(props.args), 80);
        }
      } catch {
        argsSummary = '';
      }

      const baseMessage = argsSummary ? `${displayName} (${argsSummary})` : displayName;

      // Check for actual error patterns in result (not just the word "error")
      const hasError = isErrorResult(props.result);
      const error = hasError ? props.result as string : undefined;

      // Generate lightweight instanceId to avoid expensive JSON.stringify of large args
      // Use tool name + first key/value or timestamp
      let instanceIdSuffix = Date.now().toString();
      try {
        if (props.args && typeof props.args === 'object') {
          const firstKey = Object.keys(props.args as object)[0];
          if (firstKey) {
            const firstValue = (props.args as any)[firstKey];
            // Use first 50 chars of first value (or just the key if value is large/complex)
            const valueStr = typeof firstValue === 'string' 
              ? firstValue.slice(0, 50) 
              : firstKey;
            instanceIdSuffix = valueStr;
          }
        }
      } catch {
        // Fallback to timestamp if anything fails
      }
      const instanceId = `${props.name}-${instanceIdSuffix}`;

      return (
        <ActionStatus
          toolName={displayName}
          status={status}
          icon={<DefaultToolIcon style={getIconStyle()} />}
          messages={{
            pending: `Starting ${baseMessage}...`,
            inProgress: `${baseMessage} in progress...`,
            complete: hasError ? `${displayName} failed` : `${displayName} complete`,
          }}
          args={props.args as Record<string, unknown>}
          result={props.result}
          error={error}
          instanceId={instanceId}
        />
      );
    },
  };
}

/**
 * Creates all V2 tool renderers including the wildcard default
 * Use this to get the complete renderToolCalls array for CopilotKitProvider
 */
export function createAllToolRenderers(deps: BuiltinToolDependencies & { themeColor?: string }) {
  return [
    createWebSearchRenderer(deps),
    createCodeExecutionRenderer(deps),
    createUrlContextRenderer(deps),
    createRunGraphRenderer(deps),
    createGenerateImagesRenderer(deps),
    createFileCreationRenderer(deps),
    createFileUpdateRenderer(deps),
    createDefaultToolRenderer(deps),  // Wildcard must be last
  ];
}
