import type { FC } from 'react';
import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { getCurrentViewMode } from '@src/utils/windowManager';

/**
 * MermaidBlock Component
 * 
 * Renders Mermaid diagrams from markdown code blocks.
 * Used in markdown rendering to show flowcharts, sequence diagrams, etc.
 * 
 * Features:
 * - Theme-aware rendering (light/dark modes)
 * - Error handling for invalid syntax
 * - Lazy loading of mermaid library
 * - Automatic re-rendering on theme changes
 * - Smooth loading states
 * 
 * @param children - Mermaid diagram syntax string
 * 
 * @example
 * ```tsx
 * <MermaidBlock>
 *   graph TD
 *     A[Start] --> B[Process]
 *     B --> C[End]
 * </MermaidBlock>
 * ```
 * 
 * In markdown:
 * ```mermaid
 * graph TD
 *   A[Start] --> B[Process]
 *   B --> C[End]
 * ```
 */
type LayoutEngine = 'dagre-wrapper' | 'dagre-d3' | 'elk';
type Direction = 'TB' | 'BT' | 'LR' | 'RL';
type DiagramType = 'flowchart' | 'sequence' | 'class' | 'state' | 'er' | 'journey' | 'gantt' | 'pie' | 'git' | 'other';

/**
 * Sanitize mermaid content to escape special characters in node labels and edge labels.
 * Wraps labels containing special chars in quotes, being careful not to double-quote.
 * Also handles edge label syntax issues.
 * Converts literal \n to multiline format in node labels (markdown backticks + actual newlines).
 */
const sanitizeMermaidContent = (content: string): string => {
  let result = content;
  
  // Convert literal \n (backslash-n) to line breaks in node labels.
  // Mermaid's markdown format ["`Line1\nLine2`"] uses actual newlines; <br/> can fail in some node shapes.
  // Replace \n in quoted labels with actual newline and wrap in backticks for proper multiline rendering.
  result = result.replace(/\["((?:[^"\\]|\\.)*)"\]/g, (match, labelContent) => {
    if (labelContent.includes('\\n')) {
      const withNewlines = labelContent.replace(/\\n/g, '\n');
      return `["\`${withNewlines}\`"]`;
    }
    return match;
  });
  // Also handle [[...]] stadium shape and [(...)] cylinder shape
  result = result.replace(/\[\["((?:[^"\\]|\\.)*)"\]\]/g, (match, labelContent) => {
    if (labelContent.includes('\\n')) {
      const withNewlines = labelContent.replace(/\\n/g, '\n');
      return `[["\`${withNewlines}\`"]]`;
    }
    return match;
  });
  result = result.replace(/\[\(\"((?:[^"\\]|\\.)*)\"\)\]/g, (match, labelContent) => {
    if (labelContent.includes('\\n')) {
      const withNewlines = labelContent.replace(/\\n/g, '\n');
      return `[("\`${withNewlines}\`")]`;
    }
    return match;
  });
  // Fallback: global replace any remaining \n with <br/> for edge labels etc.
  result = result.replace(/\\n/g, '<br/>');
  
  // Characters that require the label to be quoted
  const needsQuote = /[()<>=]/;
  
  // Process each line separately to avoid cross-line matching issues
  result = result.split('\n').map(line => {
    // Skip empty lines or comments
    if (!line.trim() || line.trim().startsWith('%%')) {
      return line;
    }
    
    // Fix edge labels with special characters: -->|label| or ---|label|
    // Edge labels with parentheses/equals need to be quoted
    line = line.replace(/(-->|---)\|([^"|]+)\|/g, (match, arrow, label) => {
      if (needsQuote.test(label)) {
        // Escape quotes and wrap in quotes
        const escapedLabel = label.replace(/"/g, "'");
        return `${arrow}|"${escapedLabel}"|`;
      }
      return match;
    });
    
    // Handle & operator with edge labels - this is often invalid
    // Convert "A & B -->|label| C" to separate edges: "A --> C" and "B --> C"
    // But only if there's an edge label which causes issues
    const ampersandWithLabel = /(\w+)\s*&\s*(\w+)\s*(-->|---)\|([^|]+)\|\s*(\w+)/g;
    if (ampersandWithLabel.test(line)) {
      line = line.replace(ampersandWithLabel, (match, node1, node2, arrow, label, target) => {
        // Remove the edge label from combined sources - it's the source of parsing issues
        return `${node1} ${arrow} ${target}\n    ${node2} ${arrow} ${target}`;
      });
    }
    
    // Handle node definitions if present
    if (line.includes('[') || line.includes('{')) {
    // Match node definitions: ID[label] or ID{label}
    // But skip if already quoted: ID["label"] or ID{"label"}
    
    // Handle square brackets [] - match ID[label] where label doesn't start with "
    line = line.replace(/(\b\w+)\[([^"\]]+)\]/g, (match, nodeId, label) => {
      if (needsQuote.test(label)) {
        // Escape any existing quotes in the label
        const escapedLabel = label.replace(/"/g, "'");
        return `${nodeId}["${escapedLabel}"]`;
      }
      return match;
    });
    
    // Handle curly braces {} for diamonds
    line = line.replace(/(\b\w+)\{([^"\}]+)\}/g, (match, nodeId, label) => {
      if (needsQuote.test(label)) {
        const escapedLabel = label.replace(/"/g, "'");
        return `${nodeId}{"${escapedLabel}"}`;
      }
      return match;
    });
    }
    
    return line;
  }).join('\n');
  
  return result;
};

export const MermaidBlock: FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { isLight } = useStorage(themeStorage);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mermaidLoaded, setMermaidLoaded] = useState(false);
  const [svgContent, setSvgContent] = useState<string>('');
  const [showRaw, setShowRaw] = useState(false); // Toggle between raw and rendered
  const [showControls, setShowControls] = useState(false); // Toggle controls panel
  const [refreshCounter, setRefreshCounter] = useState(0); // Counter to force re-render
  const [copied, setCopied] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [svgSize, setSvgSize] = useState<{ width: number; height: number } | null>(null);
  const renderTimerRef = useRef<NodeJS.Timeout | null>(null);
  const diagramScrollRef = useRef<HTMLDivElement>(null);
  const mermaidBlockRef = useRef<HTMLDivElement>(null);
  
  // Flowchart/Graph configuration options
  const [layoutEngine, setLayoutEngine] = useState<LayoutEngine>('dagre-wrapper');
  const [direction, setDirection] = useState<Direction>('TB');
  const [nodeSpacing, setNodeSpacing] = useState(50);
  const [rankSpacing, setRankSpacing] = useState(50);
  
  // Sequence diagram configuration options
  const [mirrorActors, setMirrorActors] = useState(true);
  const [messageMargin, setMessageMargin] = useState(35);
  const [actorMargin, setActorMargin] = useState(50);
  
  // Class diagram configuration options
  const [classLayout, setClassLayout] = useState<'dagre' | 'elk'>('dagre');

  // Copy mermaid code to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[MermaidBlock] Failed to copy:', err);
    }
  };

  // Download SVG as file
  const handleDownload = () => {
    if (!svgContent) return;
    
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mermaid-diagram-${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Detect diagram type from content
  const diagramType = React.useMemo((): DiagramType => {
    let rawContent = '';
    if (typeof children === 'string') {
      rawContent = children;
    } else if (Array.isArray(children)) {
      rawContent = children.join('');
    } else if (children && typeof children === 'object') {
      rawContent = String(children);
    }
    
    const trimmed = rawContent.trim().toLowerCase();
    if (trimmed.startsWith('sequencediagram')) return 'sequence';
    if (trimmed.startsWith('classdiagram')) return 'class';
    if (trimmed.startsWith('statediagram')) return 'state';
    if (trimmed.startsWith('erdiagram')) return 'er';
    if (trimmed.startsWith('journey')) return 'journey';
    if (trimmed.startsWith('gantt')) return 'gantt';
    if (trimmed.startsWith('pie')) return 'pie';
    if (trimmed.startsWith('gitgraph')) return 'git';
    if (trimmed.startsWith('graph') || trimmed.startsWith('flowchart')) return 'flowchart';
    return 'other';
  }, [children]);
  
  // Check if diagram type supports configuration
  const supportsConfiguration = React.useMemo(() => {
    return ['flowchart', 'sequence', 'class'].includes(diagramType);
  }, [diagramType]);

  // Convert children to string content and inject direction
  const content = React.useMemo(() => {
    let rawContent = '';
    if (typeof children === 'string') {
      rawContent = children;
    } else if (Array.isArray(children)) {
      rawContent = children.join('');
    } else if (children && typeof children === 'object') {
      rawContent = String(children);
    }
    
    // Sanitize content to escape special characters in node labels
    rawContent = sanitizeMermaidContent(rawContent);
    
    // Replace direction in the graph definition for flowcharts
    if (diagramType === 'flowchart') {
      const directionRegex = /^(graph|flowchart)\s+(TB|BT|LR|RL)/m;
      if (directionRegex.test(rawContent)) {
        return rawContent.replace(directionRegex, `$1 ${direction}`);
      }
    }
    
    return rawContent;
  }, [children, direction, diagramType]);

  // Pinch-to-zoom: in side panel, attach to document so we capture before parent scroll containers
  const lastGestureScaleRef = useRef<number>(1);
  const viewMode = getCurrentViewMode();
  const isSidePanel = viewMode === 'sidepanel';
  useEffect(() => {
    const blockEl = mermaidBlockRef.current;
    const diagramEl = diagramScrollRef.current;
    if (!blockEl) return;
    const doc = blockEl.ownerDocument;
    const isDiagramVisible = () => {
      const el = diagramScrollRef.current;
      return el && el.style.display !== 'none';
    };
    const isOverDiagram = (target: EventTarget | null) => {
      if (!diagramEl) return blockEl.contains(target as Node);
      return diagramEl.contains(target as Node);
    };
    const wheelHandler = (e: Event) => {
      const we = e as WheelEvent;
      if (!(we.ctrlKey || we.metaKey)) return;
      if (!isOverDiagram(we.target as Node)) return;
      if (!isDiagramVisible()) return;
      e.preventDefault();
      e.stopPropagation();
      setZoomLevel((z) => {
        const delta = we.deltaY > 0 ? -0.1 : 0.1;
        return Math.max(0.5, Math.min(2, z + delta));
      });
    };
    const gestureStartHandler = (e: Event) => {
      if (!isOverDiagram(e.target as Node)) return;
      if (!isDiagramVisible()) return;
      e.preventDefault();
      lastGestureScaleRef.current = 1;
    };
    const gestureChangeHandler = (e: Event) => {
      if (!isOverDiagram(e.target as Node)) return;
      if (!isDiagramVisible()) return;
      e.preventDefault();
      const ge = e as unknown as { scale: number };
      if (ge.scale !== undefined) {
        const delta = ge.scale - lastGestureScaleRef.current;
        lastGestureScaleRef.current = ge.scale;
        setZoomLevel((z) => Math.max(0.5, Math.min(2, z + delta)));
      }
    };
    // Use document with capture: true so we get wheel events before scroll containers
    doc.addEventListener('wheel', wheelHandler, { passive: false, capture: true });
    doc.addEventListener('gesturestart', gestureStartHandler, { capture: true });
    doc.addEventListener('gesturechange', gestureChangeHandler, { capture: true });
    return () => {
      doc.removeEventListener('wheel', wheelHandler, { capture: true });
      doc.removeEventListener('gesturestart', gestureStartHandler, { capture: true });
      doc.removeEventListener('gesturechange', gestureChangeHandler, { capture: true });
    };
  }, [isSidePanel, svgContent, showRaw]);

  // Measure SVG dimensions when content is rendered (for zoom/scroll)
  useEffect(() => {
    if (!containerRef.current || !svgContent) {
      setSvgSize(null);
      return;
    }
    const svg = containerRef.current.querySelector('svg');
    if (!svg) {
      setSvgSize(null);
      return;
    }
    const updateSize = () => {
      let w = svg.width?.baseVal?.value ?? svg.clientWidth ?? 0;
      let h = svg.height?.baseVal?.value ?? svg.clientHeight ?? 0;
      if (w <= 0 || h <= 0) {
        const rect = svg.getBoundingClientRect();
        w = rect.width || w;
        h = rect.height || h;
      }
      if (w <= 0 || h <= 0) {
        const viewBox = svg.getAttribute('viewBox');
        if (viewBox) {
          const parts = viewBox.split(/\s+/);
          if (parts.length >= 4) {
            w = parseFloat(parts[2]) || w;
            h = parseFloat(parts[3]) || h;
          }
        }
      }
      if (w > 0 && h > 0) {
        setSvgSize({ width: w, height: h });
      }
    };
    updateSize();
    const t = setTimeout(updateSize, 100);
    const ro = new ResizeObserver(updateSize);
    ro.observe(svg);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, [svgContent]);

  // Lazy load mermaid library
  useEffect(() => {
    const loadMermaid = async () => {
      try {
        // console.log('[MermaidBlock] Starting to load mermaid library...');
        // Dynamically import mermaid to reduce initial bundle size
        const mermaidModule = await import('mermaid');
        const mermaid = mermaidModule.default;
        
        // console.log('[MermaidBlock] Mermaid loaded, initializing...');
        // Initialize mermaid with current theme and diagram-specific configs
        mermaid.initialize({
          startOnLoad: false,
          theme: isLight ? 'default' : 'dark',
          securityLevel: 'loose',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          logLevel: 'fatal',
          maxTextSize: 90000,
          flowchart: {
            htmlLabels: true,
            curve: 'basis',
            useMaxWidth: true,
            wrappingWidth: 400,
            nodeSpacing: nodeSpacing,
            rankSpacing: rankSpacing,
            padding: 15,
            diagramPadding: 20,
          },
          sequence: {
            mirrorActors: mirrorActors,
            messageMargin: messageMargin,
            actorMargin: actorMargin,
            useMaxWidth: true,
          },
          class: {
            useMaxWidth: true,
          },
          state: {
            useMaxWidth: true,
          },
        });
        
        // console.log('[MermaidBlock] Mermaid initialized successfully');
        setMermaidLoaded(true);
      } catch (err) {
        // console.error('[MermaidBlock] Failed to load mermaid library:', err);
        setError('Failed to load diagram renderer');
        setIsLoading(false);
      }
    };

    loadMermaid();
  }, [isLight, nodeSpacing, rankSpacing, mirrorActors, messageMargin, actorMargin, classLayout]);

  // Render mermaid diagram with debounce to avoid flickering during streaming
  useEffect(() => {
    if (!mermaidLoaded) {
      // console.log('[MermaidBlock] Waiting for mermaid to load...');
      return;
    }
    
    if (!content.trim()) {
      // console.log('[MermaidBlock] No content to render');
      setIsLoading(false);
      return;
    }

    // Clear any pending render timer
    if (renderTimerRef.current) {
      clearTimeout(renderTimerRef.current);
    }

    // Debounce: wait 300ms after content stops changing before rendering
    // This prevents flickering during AI streaming
    // console.log('[MermaidBlock] Content changed, debouncing render...');
    renderTimerRef.current = setTimeout(() => {
      // console.log('[MermaidBlock] Debounce complete, starting render');
      renderDiagram();
    }, 300);

    const renderDiagram = async () => {
      // console.log('[MermaidBlock] Starting diagram render...', {
      //   contentLength: content.length,
      //   contentPreview: content.substring(0, 50),
      //   layoutEngine,
      //   direction
      // });
      
      setIsLoading(true);
      setError(null);

      try {
        // Dynamically import mermaid again (it's cached)
        const mermaidModule = await import('mermaid');
        const mermaid = mermaidModule.default;
        
        if (!mermaid) {
          throw new Error('Mermaid library not loaded');
        }

        // console.log('[MermaidBlock] Re-initializing mermaid with theme:', isLight ? 'light' : 'dark');
        
        // Re-initialize with current theme and user-selected layout options
        const config: any = {
          startOnLoad: false,
          theme: isLight ? 'default' : 'dark',
          securityLevel: 'loose',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          logLevel: 'fatal',
          maxTextSize: 90000,
          flowchart: {
            htmlLabels: true,
            curve: 'basis',
            useMaxWidth: true,
            defaultRenderer: layoutEngine,
            wrappingWidth: 400,
            // User-configurable spacing
            nodeSpacing: nodeSpacing,
            rankSpacing: rankSpacing,
            padding: 15,
            diagramPadding: 20,
          },
          themeVariables: {
            // Simplified colors for more uniform appearance
            primaryColor: isLight ? '#dbeafe' : '#1e3a5f',
            primaryTextColor: isLight ? '#1e293b' : '#e2e8f0',
            primaryBorderColor: isLight ? '#93c5fd' : '#3b82f6',
            
            secondaryColor: isLight ? '#dcfce7' : '#1e3a2f',
            secondaryTextColor: isLight ? '#1e293b' : '#e2e8f0',
            secondaryBorderColor: isLight ? '#86efac' : '#22c55e',
            
            tertiaryColor: isLight ? '#f3e8ff' : '#2e1a47',
            tertiaryTextColor: isLight ? '#1e293b' : '#e2e8f0',
            tertiaryBorderColor: isLight ? '#c084fc' : '#a855f7',
            
            lineColor: isLight ? '#64748b' : '#64748b',
            edgeLabelBackground: isLight ? '#fef3c7' : '#422006',
            
            clusterBkg: isLight ? 'rgba(241, 245, 249, 0.5)' : 'rgba(30, 41, 59, 0.3)',
            clusterBorder: 'transparent',
            
            fontSize: '14px',
            fontFamily: 'inherit',
          }
        };
        
        // Add ELK layout if selected
        if (layoutEngine === 'elk') {
          config.layout = 'elk';
        }
        
        mermaid.initialize(config);

        // Generate unique ID for this diagram
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // console.log('[MermaidBlock] Rendering diagram with ID:', id);

        // Validate content before rendering
        if (!content || !content.trim()) {
          throw new Error('Empty diagram content');
        }

        // Render the diagram
        const renderResult = await mermaid.render(id, content.trim());
        
        if (!renderResult || !renderResult.svg) {
          throw new Error('Failed to generate SVG');
        }
        
        const { svg } = renderResult;

        // console.log('[MermaidBlock] Diagram rendered successfully, setting SVG content');
        
        // Use state to let React handle the SVG insertion
        setSvgContent(svg);
        setIsLoading(false);
        // console.log('[MermaidBlock] Render complete!');
      } catch (err: any) {
        // console.error('[MermaidBlock] Mermaid rendering error:', err);
        // console.error('[MermaidBlock] Error details:', {
        //   message: err?.message,
        //   stack: err?.stack,
        //   content: content
        // });
        
        // Provide helpful error message
        let errorMessage = 'Invalid diagram syntax';
        if (err?.message) {
          errorMessage = err.message;
        }
        
        setError(errorMessage);
        setIsLoading(false);
      }
    };

    // Cleanup: clear timer on unmount or before next effect
    return () => {
      if (renderTimerRef.current) {
        clearTimeout(renderTimerRef.current);
      }
    };
  }, [content, isLight, mermaidLoaded, layoutEngine, nodeSpacing, rankSpacing, refreshCounter]);

  // Card styling to match ConfirmationCard
  const cardBackground = isLight ? 'rgba(249, 250, 251, 0.5)' : 'rgba(21, 28, 36, 0.4)';
  const borderColor = isLight ? 'rgba(229, 231, 235, 0.5)' : 'rgba(55, 65, 81, 0.4)';

  // Always render the container with ref, show loading/error as overlays
  return (
    <div
      ref={mermaidBlockRef}
      className="mermaid-block"
      style={{
        position: 'relative',
        padding: '6px',
        borderRadius: '8px',
        backgroundColor: cardBackground,
        border: `1px solid ${borderColor}`,
        overflow: showControls ? 'visible' : 'auto',
        minHeight: '100px',
      }}
    >
      {/* Control buttons - show on hover */}
      {svgContent && !isLoading && !error && (
        <div 
          className="mermaid-controls" 
          style={{ 
            position: 'absolute', 
            top: '8px', 
            right: '8px', 
            display: 'flex', 
            flexDirection: 'row',
            gap: '6px', 
            zIndex: 20,
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          {/* Diagram / Code switch */}
          <div
            role="tablist"
            aria-label="View diagram or code"
            className="mermaid-view-switch"
            style={{
              display: 'flex',
              height: '28px',
              borderRadius: '6px',
              overflow: 'hidden',
              backgroundColor: isLight ? '#e5e7eb' : '#374151',
              boxShadow: isLight 
                ? '0 1px 2px rgba(0, 0, 0, 0.05)' 
                : '0 1px 2px rgba(0, 0, 0, 0.2)',
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={!showRaw}
              aria-label="Show Diagram"
              onClick={() => setShowRaw(false)}
              title="Show Diagram"
              style={{
                padding: '0 8px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: !showRaw ? (isLight ? '#ffffff' : '#1f2937') : 'transparent',
                color: !showRaw ? (isLight ? '#111827' : '#f3f4f6') : (isLight ? '#6b7280' : '#9ca3af'),
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                boxShadow: !showRaw ? (isLight ? '0 1px 2px rgba(0, 0, 0, 0.05)' : '0 1px 2px rgba(0, 0, 0, 0.15)') : 'none',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={showRaw}
              aria-label="Show Code"
              onClick={() => setShowRaw(true)}
              title="Show Code"
              style={{
                padding: '0 8px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: showRaw ? (isLight ? '#ffffff' : '#1f2937') : 'transparent',
                color: showRaw ? (isLight ? '#111827' : '#f3f4f6') : (isLight ? '#6b7280' : '#9ca3af'),
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                boxShadow: showRaw ? (isLight ? '0 1px 2px rgba(0, 0, 0, 0.05)' : '0 1px 2px rgba(0, 0, 0, 0.15)') : 'none',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </button>
          </div>

          {/* Download button */}
          <button
            onClick={handleDownload}
            className="mermaid-download-btn"
            title="Download SVG"
            style={{
              padding: '6px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: isLight ? '#f9fafb' : '#151C24',
              color: isLight ? '#6b7280' : '#9ca3af',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '28px',
              width: '28px',
              transition: 'all 0.2s ease',
              boxShadow: isLight 
                ? '0 1px 2px rgba(0, 0, 0, 0.05)' 
                : '0 1px 2px rgba(0, 0, 0, 0.2)',
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="mermaid-copy-btn"
            title={copied ? 'Copied!' : 'Copy Code'}
            style={{
              padding: '6px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: isLight ? '#f9fafb' : '#151C24',
              color: copied ? (isLight ? '#22c55e' : '#4ade80') : (isLight ? '#6b7280' : '#9ca3af'),
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '28px',
              width: '28px',
              transition: 'all 0.2s ease',
              boxShadow: isLight 
                ? '0 1px 2px rgba(0, 0, 0, 0.05)' 
                : '0 1px 2px rgba(0, 0, 0, 0.2)',
              whiteSpace: 'nowrap',
            }}
          >
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>

          {/* Refresh button */}
          <button
            onClick={() => {
              // Force re-render by clearing and regenerating the diagram
              setSvgContent('');
              setIsLoading(true);
              setError(null);
              // Trigger re-render by incrementing counter
              setRefreshCounter(prev => prev + 1);
            }}
            className="mermaid-refresh-btn"
            title="Refresh Diagram"
            style={{
              padding: '6px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: isLight ? '#f9fafb' : '#151C24',
              color: isLight ? '#6b7280' : '#9ca3af',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '28px',
              width: '28px',
              transition: 'all 0.2s ease',
              boxShadow: isLight 
                ? '0 1px 2px rgba(0, 0, 0, 0.05)' 
                : '0 1px 2px rgba(0, 0, 0, 0.2)',
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
          </button>
          
          {/* Settings button - only show for diagrams that support configuration */}
          {supportsConfiguration && (
            <button
              onClick={() => setShowControls(!showControls)}
              className="mermaid-settings-btn"
              title="Layout Settings"
              style={{
                padding: '6px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: showControls ? (isLight ? '#e5e7eb' : '#374151') : (isLight ? '#f9fafb' : '#151C24'),
                color: isLight ? '#6b7280' : '#9ca3af',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '28px',
                width: '28px',
                transition: 'all 0.2s ease',
                boxShadow: isLight 
                  ? '0 1px 2px rgba(0, 0, 0, 0.05)' 
                  : '0 1px 2px rgba(0, 0, 0, 0.2)',
                whiteSpace: 'nowrap',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Layout controls panel - diagram-specific */}
      {showControls && svgContent && !isLoading && !error && (
        <div
          className="mermaid-settings-panel"
          style={{
            position: 'absolute',
            top: '44px',
            right: '8px',
            padding: '0',
            borderRadius: '8px',
            backgroundColor: isLight ? '#f9fafb' : '#151C24',
            border: `1px solid ${isLight ? '#e5e7eb' : '#374151'}`,
            boxShadow: isLight 
              ? '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' 
              : '0 20px 25px -5px rgba(0, 0, 0, 0.7), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
            zIndex: 21,
            minWidth: '208px',
            width: '208px',
            overflow: 'visible',
          }}
        >
          <div style={{ padding: '8px 0' }}>
            {/* Flowchart-specific controls */}
            {diagramType === 'flowchart' && (
              <>

            {/* Layout Engine */}
            <div style={{ padding: '0 10px', marginBottom: '6px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '9px', 
                marginBottom: '4px', 
                color: isLight ? '#9ca3af' : '#6b7280', 
                fontWeight: 500,
                // textTransform: 'uppercase' as const,
                // letterSpacing: '0.025em',
              }}>
                Engine
              </label>
              <select
                value={layoutEngine}
                onChange={(e) => setLayoutEngine(e.target.value as LayoutEngine)}
                className="mermaid-select"
                style={{
                  width: '100%',
                  minHeight: 28,
                  lineHeight: 1.4,
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${isLight ? '#e5e7eb' : '#374151'}`,
                  backgroundColor: isLight ? '#ffffff' : '#1f2937',
                  color: isLight ? '#111827' : '#f3f4f6',
                  fontSize: '11px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'all 0.15s ease',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='8' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M19 9l-7 7-7-7' stroke='${isLight ? '%23111827' : '%23f3f4f6'}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 8px center',
                  backgroundSize: '8px 8px',
                  paddingRight: '24px',
                }}
              >
                <option value="dagre-wrapper">Dagre</option>
                <option value="elk">ELK</option>
              </select>
            </div>

            {/* Direction */}
            <div style={{ padding: '0 10px', marginBottom: '6px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '9px', 
                marginBottom: '4px', 
                color: isLight ? '#9ca3af' : '#6b7280', 
                fontWeight: 500,
                // textTransform: 'uppercase' as const,
                // letterSpacing: '0.025em',
              }}>
                Direction
              </label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as Direction)}
                className="mermaid-select"
                style={{
                  width: '100%',
                  minHeight: 28,
                  lineHeight: 1.4,
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${isLight ? '#e5e7eb' : '#374151'}`,
                  backgroundColor: isLight ? '#ffffff' : '#1f2937',
                  color: isLight ? '#111827' : '#f3f4f6',
                  fontSize: '11px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'all 0.15s ease',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='8' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M19 9l-7 7-7-7' stroke='${isLight ? '%23111827' : '%23f3f4f6'}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 8px center',
                  backgroundSize: '8px 8px',
                  paddingRight: '24px',
                }}
              >
                <option value="TB">Top to Bottom</option>
                <option value="BT">Bottom to Top</option>
                <option value="LR">Left to Right</option>
                <option value="RL">Right to Left</option>
              </select>
            </div>

            {/* Node Spacing */}
            <div style={{ padding: '0 10px', marginBottom: '6px' }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '6px',
              }}>
                <label style={{ 
                  fontSize: '9px', 
                  color: isLight ? '#9ca3af' : '#6b7280', 
                  fontWeight: 500,
                  // textTransform: 'uppercase' as const,
                  // letterSpacing: '0.025em',
                }}>
                  Node Spacing
                </label>
                <span style={{ 
                  fontSize: '8px', 
                  fontWeight: 300,
                  color: isLight ? '#3b82f6' : '#60a5fa',
                  minWidth: '32px',
                  textAlign: 'right',
                  lineHeight: '1',
                }}>
                  {nodeSpacing}px
                </span>
              </div>
              <div style={{ 
                padding: '0px 6px 6px',
                borderRadius: '6px',
                backgroundColor: isLight ? 'rgba(243, 244, 246, 1)' : 'rgba(31, 41, 55, 0.8)',
              }}>
                <input
                  type="range"
                  min="20"
                  max="150"
                  step="10"
                  value={nodeSpacing}
                  onChange={(e) => setNodeSpacing(Number(e.target.value))}
                  className="mermaid-modern-slider"
                  style={{
                    width: '100%',
                    height: '3px',
                    outline: 'none',
                    cursor: 'pointer',
                    WebkitAppearance: 'none',
                    appearance: 'none',
                    backgroundColor: 'transparent',
                  }}
                />
              </div>
            </div>

            {/* Rank Spacing */}
            <div style={{ padding: '0 10px 6px 10px' }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '6px',
              }}>
                <label style={{ 
                  fontSize: '9px', 
                  color: isLight ? '#9ca3af' : '#6b7280', 
                  fontWeight: 500,
                  // textTransform: 'uppercase' as const,
                  // letterSpacing: '0.025em',
                }}>
                  Rank Spacing
                </label>
                <span style={{ 
                  fontSize: '8px', 
                  fontWeight: 300,
                  color: isLight ? '#3b82f6' : '#60a5fa',
                  minWidth: '32px',
                  textAlign: 'right',
                  lineHeight: '1',
                }}>
                  {rankSpacing}px
                </span>
              </div>
              <div style={{ 
                padding: '0px 6px 6px',
                borderRadius: '6px',
                backgroundColor: isLight ? 'rgba(243, 244, 246, 1)' : 'rgba(31, 41, 55, 0.8)',
              }}>
                <input
                  type="range"
                  min="20"
                  max="150"
                  step="10"
                  value={rankSpacing}
                  onChange={(e) => setRankSpacing(Number(e.target.value))}
                  className="mermaid-modern-slider"
                  style={{
                    width: '100%',
                    height: '3px',
                    outline: 'none',
                    cursor: 'pointer',
                    WebkitAppearance: 'none',
                    appearance: 'none',
                    backgroundColor: 'transparent',
                  }}
                />
              </div>
            </div>
              </>
            )}

            {/* Sequence diagram-specific controls */}
            {diagramType === 'sequence' && (
              <>
                {/* Mirror Actors */}
                <div style={{ padding: '0 10px', marginBottom: '6px' }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <label style={{ 
                      fontSize: '9px', 
                      color: isLight ? '#9ca3af' : '#6b7280', 
                      fontWeight: 500,
                    }}>
                      Mirror Actors
                    </label>
                    <input
                      type="checkbox"
                      checked={mirrorActors}
                      onChange={(e) => setMirrorActors(e.target.checked)}
                      style={{
                        cursor: 'pointer',
                        width: '16px',
                        height: '16px',
                      }}
                    />
                  </div>
                </div>

                {/* Message Margin */}
                <div style={{ padding: '0 10px', marginBottom: '6px' }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                  }}>
                    <label style={{ 
                      fontSize: '9px', 
                      color: isLight ? '#9ca3af' : '#6b7280', 
                      fontWeight: 500,
                    }}>
                      Message Margin
                    </label>
                    <span style={{ 
                      fontSize: '8px', 
                      fontWeight: 300,
                      color: isLight ? '#3b82f6' : '#60a5fa',
                      minWidth: '32px',
                      textAlign: 'right',
                      lineHeight: '1',
                    }}>
                      {messageMargin}px
                    </span>
                  </div>
                  <div style={{ 
                    padding: '0px 6px 6px',
                    borderRadius: '6px',
                    backgroundColor: isLight ? 'rgba(243, 244, 246, 1)' : 'rgba(31, 41, 55, 0.8)',
                  }}>
                    <input
                      type="range"
                      min="20"
                      max="60"
                      step="5"
                      value={messageMargin}
                      onChange={(e) => setMessageMargin(Number(e.target.value))}
                      className="mermaid-modern-slider"
                      style={{
                        width: '100%',
                        height: '3px',
                        outline: 'none',
                        cursor: 'pointer',
                        WebkitAppearance: 'none',
                        appearance: 'none',
                        backgroundColor: 'transparent',
                      }}
                    />
                  </div>
                </div>

                {/* Actor Margin */}
                <div style={{ padding: '0 10px 6px 10px' }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                  }}>
                    <label style={{ 
                      fontSize: '9px', 
                      color: isLight ? '#9ca3af' : '#6b7280', 
                      fontWeight: 500,
                    }}>
                      Actor Margin
                    </label>
                    <span style={{ 
                      fontSize: '8px', 
                      fontWeight: 300,
                      color: isLight ? '#3b82f6' : '#60a5fa',
                      minWidth: '32px',
                      textAlign: 'right',
                      lineHeight: '1',
                    }}>
                      {actorMargin}px
                    </span>
                  </div>
                  <div style={{ 
                    padding: '0px 6px 6px',
                    borderRadius: '6px',
                    backgroundColor: isLight ? 'rgba(243, 244, 246, 1)' : 'rgba(31, 41, 55, 0.8)',
                  }}>
                    <input
                      type="range"
                      min="20"
                      max="100"
                      step="10"
                      value={actorMargin}
                      onChange={(e) => setActorMargin(Number(e.target.value))}
                      className="mermaid-modern-slider"
                      style={{
                        width: '100%',
                        height: '3px',
                        outline: 'none',
                        cursor: 'pointer',
                        WebkitAppearance: 'none',
                        appearance: 'none',
                        backgroundColor: 'transparent',
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Class diagram-specific controls */}
            {diagramType === 'class' && (
              <>
                <div style={{ padding: '0 10px', marginBottom: '6px' }}>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '9px', 
                    marginBottom: '4px', 
                    color: isLight ? '#9ca3af' : '#6b7280', 
                    fontWeight: 500,
                  }}>
                    Layout Engine
                  </label>
                  <select
                    value={classLayout}
                    onChange={(e) => setClassLayout(e.target.value as 'dagre' | 'elk')}
                    className="mermaid-select"
                    style={{
                      width: '100%',
                      minHeight: 28,
                      lineHeight: 1.4,
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: `1px solid ${isLight ? '#e5e7eb' : '#374151'}`,
                      backgroundColor: isLight ? '#ffffff' : '#1f2937',
                      color: isLight ? '#111827' : '#f3f4f6',
                      fontSize: '11px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      outline: 'none',
                      transition: 'all 0.15s ease',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='8' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M19 9l-7 7-7-7' stroke='${isLight ? '%23111827' : '%23f3f4f6'}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 8px center',
                      backgroundSize: '8px 8px',
                      paddingRight: '24px',
                    }}
                  >
                    <option value="dagre">Dagre</option>
                    <option value="elk">ELK</option>
                  </select>
                </div>
              </>
            )}

            {/* State diagram-specific controls */}
            {diagramType === 'state' && (
              <>
                <div style={{ padding: '0 10px', marginBottom: '6px' }}>
                  <div style={{
                    fontSize: '9px',
                    color: isLight ? '#9ca3af' : '#6b7280',
                    textAlign: 'center',
                    padding: '8px',
                  }}>
                    State diagrams use default layout
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Raw mermaid code view */}
      {showRaw && svgContent && !isLoading && !error && (
        <pre
          style={{
            margin: 0,
            padding: '12px',
            paddingTop: '40px', // Space for button
            backgroundColor: isLight ? '#f9fafb' : '#1f2937',
            color: isLight ? '#1f2937' : '#f3f4f6',
            borderRadius: '6px',
            fontSize: '13px',
            lineHeight: '1.6',
            overflow: 'auto',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
          }}
        >
          {content}
        </pre>
      )}

      {/* Container for mermaid SVG - use transform scale for cross-browser zoom */}
      <div
        style={{
          display: svgContent && !isLoading && !error && !showRaw ? 'block' : 'none',
          position: 'relative',
          width: '100%',
          maxHeight: '500px',
        }}
      >
        <div
          ref={diagramScrollRef}
          className="mermaid-diagram-scroll"
          style={{ 
            width: '100%',
            height: '100%',
            overflow: 'auto',
            maxHeight: '500px',
          }}
        >
          <div
            style={{
              width: svgSize ? svgSize.width * zoomLevel : '100%',
              height: svgSize ? svgSize.height * zoomLevel : undefined,
              minHeight: svgSize ? undefined : 100,
            }}
          >
            <div
              ref={containerRef}
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: 'top left',
                width: svgSize ? svgSize.width : '100%',
                height: svgSize ? svgSize.height : undefined,
              }}
              dangerouslySetInnerHTML={svgContent ? { __html: svgContent } : undefined}
            />
          </div>
        </div>

        {/* Zoom controls - fixed at bottom right of diagram viewport (stays fixed when scrolling) */}
        <div
          style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            left: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '4px',
            zIndex: 20,
            pointerEvents: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
            title="Zoom out"
            style={{
              padding: '6px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: isLight ? '#f9fafb' : '#151C24',
              color: isLight ? '#6b7280' : '#9ca3af',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '28px',
              width: '28px',
              transition: 'all 0.2s ease',
              boxShadow: isLight 
                ? '0 1px 2px rgba(0, 0, 0, 0.05)' 
                : '0 1px 2px rgba(0, 0, 0, 0.2)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setZoomLevel((z) => Math.min(2, z + 0.25))}
            title="Zoom in"
            style={{
              padding: '6px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: isLight ? '#f9fafb' : '#151C24',
              color: isLight ? '#6b7280' : '#9ca3af',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '28px',
              width: '28px',
              transition: 'all 0.2s ease',
              boxShadow: isLight 
                ? '0 1px 2px rgba(0, 0, 0, 0.05)' 
                : '0 1px 2px rgba(0, 0, 0, 0.2)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
        </div>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: cardBackground,
            borderRadius: '8px',
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: isLight ? '#586069' : '#8b949e' }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              style={{ animation: 'spin 1s linear infinite' }}
            >
              <circle
                cx="8"
                cy="8"
                r="7"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="32"
                strokeDashoffset="0"
                strokeLinecap="round"
              />
            </svg>
            <span>Loading diagram...</span>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && !isLoading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            padding: '12px',
            backgroundColor: isLight ? 'rgba(254, 242, 242, 0.95)' : 'rgba(45, 21, 21, 0.95)',
            color: isLight ? '#dc2626' : '#f87171',
            borderRadius: '8px',
            overflow: 'auto',
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, marginTop: '2px' }}>
              <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0zm9.78-2.22-5.5 5.5a.75.75 0 0 1-1.06-1.06l5.5-5.5a.75.75 0 0 1 1.06 1.06z"/>
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>Diagram Error</div>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>{error}</div>
            </div>
          </div>
          <details style={{ marginTop: '8px', fontSize: '11px', opacity: 0.7 }}>
            <summary style={{ cursor: 'pointer' }}>Show diagram code</summary>
            <pre style={{ marginTop: '8px', padding: '8px', backgroundColor: isLight ? '#f6f8fa' : '#0d1117', borderRadius: '4px', overflow: 'auto' }}>
              {content}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
};

// Add spinning animation for loading state
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }
  `;
  document.head.appendChild(style);
}

