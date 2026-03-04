/**
 * Custom Markdown Renderer for CopilotKit V2
 * 
 * Wraps Streamdown with custom code block, mermaid diagram, table, and thinking block rendering.
 * 
 * Handles streaming by progressively rendering content as it arrives, similar to V1 approach.
 * 
 * Performance optimizations:
 * - Early exit if no custom tags detected (fast path)
 * - Stable instance IDs to prevent unnecessary remounts
 * - Memoized Streamdown component config
 * - Optimized regex execution (only when custom tags likely present)
 */
import * as React from 'react';
import { useMemo, useRef, useCallback } from 'react';
import { Streamdown } from 'streamdown';
import { CustomCodeBlockWrapper } from './slots/CustomCodeBlock';
import { CustomTableWrapper } from './slots/CustomTable';
import { CustomLinkWrapper } from './slots/CustomLink';
import { ThinkingBlockWrapper } from './ThinkingBlockWrapper';
import rehypeRaw from 'rehype-raw';

interface CustomMarkdownRendererProps {
  content: string;
  className?: string;
  /** Custom tag renderers - maps tag names to React components */
  customTagRenderers?: Record<string, React.ComponentType<{ children?: React.ReactNode; isComplete?: boolean; instanceId?: string }>>;
  /** Whether to use light theme (for backward compatibility, but components read from storage) */
  isLight?: boolean;
  /** Whether to hide toolbars on code blocks and tables (for document viewing) */
  hideToolbars?: boolean;
}

/**
 * CustomMarkdownRenderer - Replacement for CopilotChatAssistantMessage.MarkdownRenderer
 * 
 * Uses Streamdown with custom components:
 * - `pre` for code blocks with react-syntax-highlighter and mermaid diagram rendering
 * - `table` for styled tables matching graph card design
 * - Any configured custom tags via `customTagRenderers` prop (defaults to thinking blocks)
 * 
 * Progressive rendering approach (like V1):
 * - Finds FIRST configured custom tag (handles streaming/incomplete tags)
 * - Renders content before tag through Streamdown
 * - Renders custom tag block directly (bypasses Streamdown)
 * - Recursively processes remaining content after tag
 * 
 * All other content (including standard HTML tags) is rendered via Streamdown.
 */
/**
 * Preprocess markdown content to ensure proper spacing around code blocks
 * Also converts mention patterns wrapped in backticks (`@[Type]label`) to HTML spans for styling
 * 
 * Mentions are wrapped in backticks like code blocks, but start with @ to distinguish them.
 * This allows mentions with spaces to be easily extracted and styled differently from code.
 * Example: `@[Credential]My API Key` -> styled mention chip
 *          `code example` -> regular code block
 */
const preprocessMarkdown = (content: string): string => {
  if (!content) return content;
  
  // Convert mention patterns wrapped in backticks to HTML spans for styling
  // Pattern: `@[Type]label with spaces` or `@label`
  // Example: `@[Credential]Wiki` -> <span class="mention-chip"...>@[Credential]Wiki</span>
  // This handles mentions with spaces and is easy to extract
  const mentionPattern = /`(@(\[(\w+)\])?([^`]+))`/g;
  const matches: Array<{ match: string; index: number; groups: RegExpMatchArray }> = [];
  let match;
  
  // Collect all matches with their indices
  while ((match = mentionPattern.exec(content)) !== null) {
    matches.push({
      match: match[0],
      index: match.index,
      groups: match
    });
  }
  
  // Process matches in reverse order to preserve indices
  let processed = content;
  for (let i = matches.length - 1; i >= 0; i--) {
    const { match: matchStr, index: matchIndex, groups } = matches[i];
    const fullMention = groups[1];
    const type = groups[3];
    const label = groups[4];
    
    // Skip if inside a code block (check for unclosed ``` before this position)
    const beforeMatch = content.substring(0, matchIndex);
    const codeBlockCount = (beforeMatch.match(/```/g) || []).length;
    if (codeBlockCount % 2 !== 0) {
      continue; // Inside code block, don't convert
    }
    
    // Skip if already inside an HTML tag
    const beforeContext = content.substring(Math.max(0, matchIndex - 50), matchIndex);
    const lastOpenTag = beforeContext.lastIndexOf('<');
    const lastCloseTag = beforeContext.lastIndexOf('>');
    if (lastOpenTag > lastCloseTag) {
      continue; // Inside HTML tag, skip
    }
    
    // Extract the label (everything after @[Type] or @)
    const mentionLabel = label ? label.trim() : fullMention.replace('@', '').trim();
    const mentionType = type ? type.toLowerCase() : '';
    
    // Build the full mention text (with type prefix)
    const mentionText = type ? `@[${type}]${label.trim()}` : `@${label.trim()}`;
    
    // Replace the match with HTML span for styling (CSS will hide type prefix visually)
    const replacement = `<span class="mention-chip" data-mention="${mentionLabel}" data-type="${mentionType}">${mentionText}</span>`;
    processed = processed.substring(0, matchIndex) + replacement + processed.substring(matchIndex + matchStr.length);
  }
  
  // Ensure newline before ``` if text is directly adjacent
  // This handles "text```python" -> "text\n```python"
  processed = processed.replace(/([^\n\s])```/g, '$1\n```');
  
  return processed.trim();
};


export const CustomMarkdownRenderer: React.FC<CustomMarkdownRendererProps> = ({
  content,
  className,
  customTagRenderers,
  isLight, // For backward compatibility, but not used (components read from storage)
  hideToolbars = false,
  ...props
}) => {
  // Preprocess content to ensure proper markdown formatting
  const processedContent = preprocessMarkdown(content);
  // Default custom tag renderers (thinking blocks only)
  // Note: mentions are handled as inline HTML by Streamdown's rehype-raw plugin
  const defaultTagRenderers: Record<string, React.ComponentType<{ children?: React.ReactNode; isComplete?: boolean; instanceId?: string }>> = {
    think: ThinkingBlockWrapper,
    thinking: ThinkingBlockWrapper,
    redacted_reasoning: ThinkingBlockWrapper,
  };
  
  // Merge default and custom tag renderers
  const allTagRenderers = useMemo(() => {
    return { ...defaultTagRenderers, ...customTagRenderers };
  }, [customTagRenderers]);
  
  // Memoize Streamdown component config to prevent recreation
  // Pass hideToolbars prop to code block and table wrappers
  const streamdownComponents = useMemo(() => ({
    pre: (props: any) => <CustomCodeBlockWrapper {...props} hideToolbars={hideToolbars} />,
    table: (props: any) => <CustomTableWrapper {...props} hideToolbars={hideToolbars} />,
    a: CustomLinkWrapper,  // Custom link component with chip styling
  }), [hideToolbars]);
  
  // Track instance IDs for stable keys (prevents remounting during streaming)
  const instanceIdRef = useRef<Map<string, string>>(new Map());
  
  // Parse content to find ANY configured custom tag - handles streaming (incomplete tags)
  // Similar to V1's contentParts logic, but generic for any configured tag
  const contentParts = useMemo(() => {
    if (!processedContent) return { before: '', incompleteTag: null, after: '', hasIncomplete: false };
    
    // Get list of configured custom tag names
    const customTagNames = new Set(Object.keys(allTagRenderers));
    if (customTagNames.size === 0) {
      // No custom tags configured - return content as-is
      return {
        before: content,
        incompleteTag: null,
        after: '',
        hasIncomplete: false,
      };
    }
    
    // PERFORMANCE: Early exit - quick check if any custom tag pattern exists
    // This avoids expensive regex for most content that doesn't have custom tags
    const hasPotentialCustomTag = Array.from(customTagNames).some(tagName => {
      // Check for opening tag pattern (case-insensitive)
      return processedContent.toLowerCase().includes(`<${tagName}`);
    });
    
    if (!hasPotentialCustomTag) {
      // Fast path: No custom tags detected - return content as-is
      return {
        before: processedContent,
        incompleteTag: null,
        after: '',
        hasIncomplete: false,
      };
    }
    
    // Generic regex to match XML-style tags
    const openTagRegex = /<([a-zA-Z_][a-zA-Z0-9_-]*)\s*(?:[^>]*)?>/gi;
    const closeTagRegex = /<\/([a-zA-Z_][a-zA-Z0-9_-]*)\s*>/gi;
    
    const openTags: Array<{ index: number; tag: string; name: string; fullMatch: string }> = [];
    const closeTags: Array<{ index: number; tag: string; name: string }> = [];
    
    // Reset regex lastIndex
    openTagRegex.lastIndex = 0;
    closeTagRegex.lastIndex = 0;
    
    // Find all opening tags
    let match;
    while ((match = openTagRegex.exec(processedContent)) !== null) {
      const tagName = match[1].toLowerCase();
      // Only track configured custom tags
      if (customTagNames.has(tagName)) {
        openTags.push({
          index: match.index,
          tag: match[0],
          name: tagName,
          fullMatch: match[0],
        });
      }
    }
    
    // Find all closing tags
    while ((match = closeTagRegex.exec(processedContent)) !== null) {
      const tagName = match[1].toLowerCase();
      // Only track configured custom tags
      if (customTagNames.has(tagName)) {
        closeTags.push({
          index: match.index,
          tag: match[0],
          name: tagName,
        });
      }
    }
    
    // Find the FIRST configured custom tag (like V1 does)
    // This handles streaming where tags may be incomplete
    if (openTags.length > 0) {
      const firstTag = openTags[0];
      
      // Find matching closing tag (same tag name)
      const matchingClose = closeTags.find(
        close => close.name === firstTag.name && close.index > firstTag.index
      );
      
      const openIndex = firstTag.index;
      const openTagLength = firstTag.fullMatch.length;
      const contentStart = openIndex + openTagLength;
      
      if (matchingClose) {
        // Complete tag - extract content between tags
        const closeIndex = matchingClose.index;
        const tagContent = processedContent.slice(contentStart, closeIndex);
        const afterContent = processedContent.slice(closeIndex + matchingClose.tag.length);
        
        return {
          before: processedContent.slice(0, openIndex),
          incompleteTag: {
            name: firstTag.name,
            content: tagContent,
            isComplete: true,
          },
          after: afterContent,
          hasIncomplete: true,
        };
      } else {
        // Incomplete tag (streaming) - extract all content after opening tag
        const incompleteContent = processedContent.slice(contentStart);
        
        return {
          before: processedContent.slice(0, openIndex),
          incompleteTag: {
            name: firstTag.name,
            content: incompleteContent,
            isComplete: false,
          },
          after: '',
          hasIncomplete: true,
        };
      }
    }
    
    // No configured custom tags found - return content as-is
    return {
      before: processedContent,
      incompleteTag: null,
      after: '',
      hasIncomplete: false,
    };
  }, [processedContent, allTagRenderers]);

  // Generate stable instance ID for custom tag (prevents remounting during streaming)
  // Uses tag name + content start position as key for stability
  const getStableInstanceId = useCallback((tagName: string, contentStartIndex: number) => {
    const key = `${tagName}-${contentStartIndex}`;
    if (!instanceIdRef.current.has(key)) {
      instanceIdRef.current.set(key, `${tagName}-${contentStartIndex}-${Math.random().toString(36).slice(2, 9)}`);
    }
    return instanceIdRef.current.get(key)!;
  }, []);

  // Render content progressively (like V1)
  const renderContent = useMemo(() => {
    if (!contentParts.hasIncomplete) {
      // No custom tags - render normally through Streamdown (fast path)
  return (
    <Streamdown
      className={className ? `${className} markdown-content` : 'markdown-content'}
          rehypePlugins={[rehypeRaw]}
          components={streamdownComponents}
          {...props}
        >
          {contentParts.before}
        </Streamdown>
      );
    }

    // Has custom tag - render progressively
    const parts: React.ReactNode[] = [];
    
    // 1. Render content before custom tag through Streamdown
    if (contentParts.before.trim()) {
      parts.push(
        <Streamdown
          key="before"
          className={className ? `${className} markdown-content` : 'markdown-content'}
          rehypePlugins={[rehypeRaw]}
          components={streamdownComponents}
      {...props}
    >
          {contentParts.before}
    </Streamdown>
  );
    }
    
    // 2. Render custom tag block directly (bypasses Streamdown)
    if (contentParts.incompleteTag) {
      const tagName = contentParts.incompleteTag.name;
      const Renderer = allTagRenderers[tagName];
      
      if (Renderer) {
        // Use stable instance ID based on tag position to prevent remounting during streaming
        // Calculate position from contentParts (where tag starts in processed content)
        const tagStartIndex = contentParts.before.length;
        const instanceId = getStableInstanceId(tagName, tagStartIndex);
        
        parts.push(
          <Renderer
            key={instanceId}
            instanceId={instanceId}
            isComplete={contentParts.incompleteTag.isComplete}
          >
            {contentParts.incompleteTag.content}
          </Renderer>
        );
      } else {
        // Fallback: Unknown tag - render as plain text (shouldn't happen, but safety check)
        parts.push(
          <div key={`fallback-${tagName}`} style={{ padding: '8px', fontSize: '12px' }}>
            <code>&lt;{tagName}&gt;</code>
            <pre style={{ whiteSpace: 'pre-wrap', marginTop: '4px' }}>
              {contentParts.incompleteTag.content}
            </pre>
          </div>
        );
      }
    }
    
    // 3. Recursively process remaining content after custom tag
    // This handles multiple custom blocks in sequence
    if (contentParts.after.trim()) {
      parts.push(
        <CustomMarkdownRenderer
          key="after"
          content={contentParts.after}
          className={className}
          customTagRenderers={customTagRenderers}
          hideToolbars={hideToolbars}
          {...props}
        />
      );
    }
    
    return <>{parts}</>;
  }, [contentParts, className, allTagRenderers, customTagRenderers, streamdownComponents, getStableInstanceId, processedContent, hideToolbars, props]);

  return <div className={className}>{renderContent}</div>;
};

export default CustomMarkdownRenderer;

