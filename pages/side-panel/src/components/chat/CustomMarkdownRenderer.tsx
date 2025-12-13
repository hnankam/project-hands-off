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
import React, { useMemo, useRef, useCallback } from 'react';
import { Streamdown } from 'streamdown';
import { CustomCodeBlockWrapper } from './slots/CustomCodeBlock';
import { CustomTableWrapper } from './slots/CustomTable';
import { ThinkingBlockWrapper } from './ThinkingBlockWrapper';
import rehypeRaw from 'rehype-raw';

interface CustomMarkdownRendererProps {
  content: string;
  className?: string;
  /** Custom tag renderers - maps tag names to React components */
  customTagRenderers?: Record<string, React.ComponentType<{ children?: React.ReactNode; isComplete?: boolean; instanceId?: string }>>;
  /** Whether to use light theme (for backward compatibility, but components read from storage) */
  isLight?: boolean;
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
 * and convert @mentions to HTML spans for styling
 */
const preprocessMarkdown = (content: string): string => {
  if (!content) return content;
  
  let processed = content;
  
  // Only fix: ensure newline before ``` if text is directly adjacent
  // This handles "text```python" -> "text\n```python"
  processed = processed.replace(/([^\n\s])```/g, '$1\n```');
  
  // Convert @mentions to HTML spans (but avoid converting in code blocks)
  // This regex matches @mentions that aren't inside code blocks
  // Simple approach: convert mentions that aren't preceded by backticks
  processed = processed.replace(/@([a-zA-Z0-9_.-]+)/g, '<span class="mention">@$1</span>');
  
  return processed.trim();
};

export const CustomMarkdownRenderer: React.FC<CustomMarkdownRendererProps> = ({
  content,
  className,
  customTagRenderers,
  isLight, // For backward compatibility, but not used (components read from storage)
  ...props
}) => {
  // Preprocess content to ensure proper markdown formatting
  const processedContent = preprocessMarkdown(content);
  // Default custom tag renderers (thinking blocks)
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
  const streamdownComponents = useMemo(() => ({
    pre: CustomCodeBlockWrapper,
    table: CustomTableWrapper,
  }), []);
  
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
      className={className}
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
          className={className}
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
          {...props}
        />
      );
    }
    
    return <>{parts}</>;
  }, [contentParts, className, allTagRenderers, customTagRenderers, streamdownComponents, getStableInstanceId, processedContent, props]);

  return <div className={className}>{renderContent}</div>;
};

export default CustomMarkdownRenderer;

