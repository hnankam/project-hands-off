import type { FC } from 'react';
import React, { useState, useEffect, useRef } from 'react';
import { useStorage } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';

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

export const MermaidBlock: FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { isLight } = useStorage(exampleThemeStorage);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mermaidLoaded, setMermaidLoaded] = useState(false);
  const [svgContent, setSvgContent] = useState<string>('');
  const [showRaw, setShowRaw] = useState(false); // Toggle between raw and rendered
  const [showControls, setShowControls] = useState(false); // Toggle controls panel
  const [refreshCounter, setRefreshCounter] = useState(0); // Counter to force re-render
  const renderTimerRef = useRef<NodeJS.Timeout | null>(null);
  
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
    
    // Replace direction in the graph definition for flowcharts
    if (diagramType === 'flowchart') {
      const directionRegex = /^(graph|flowchart)\s+(TB|BT|LR|RL)/m;
      if (directionRegex.test(rawContent)) {
        return rawContent.replace(directionRegex, `$1 ${direction}`);
      }
    }
    
    return rawContent;
  }, [children, direction, diagramType]);

  // Lazy load mermaid library
  useEffect(() => {
    const loadMermaid = async () => {
      try {
        console.log('[MermaidBlock] Starting to load mermaid library...');
        // Dynamically import mermaid to reduce initial bundle size
        const mermaidModule = await import('mermaid');
        const mermaid = mermaidModule.default;
        
        console.log('[MermaidBlock] Mermaid loaded, initializing...');
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
        
        console.log('[MermaidBlock] Mermaid initialized successfully');
        setMermaidLoaded(true);
      } catch (err) {
        console.error('[MermaidBlock] Failed to load mermaid library:', err);
        setError('Failed to load diagram renderer');
        setIsLoading(false);
      }
    };

    loadMermaid();
  }, [isLight, nodeSpacing, rankSpacing, mirrorActors, messageMargin, actorMargin, classLayout]);

  // Render mermaid diagram with debounce to avoid flickering during streaming
  useEffect(() => {
    if (!mermaidLoaded) {
      console.log('[MermaidBlock] Waiting for mermaid to load...');
      return;
    }
    
    if (!content.trim()) {
      console.log('[MermaidBlock] No content to render');
      setIsLoading(false);
      return;
    }

    // Clear any pending render timer
    if (renderTimerRef.current) {
      clearTimeout(renderTimerRef.current);
    }

    // Debounce: wait 300ms after content stops changing before rendering
    // This prevents flickering during AI streaming
    console.log('[MermaidBlock] Content changed, debouncing render...');
    renderTimerRef.current = setTimeout(() => {
      console.log('[MermaidBlock] Debounce complete, starting render');
      renderDiagram();
    }, 300);

    const renderDiagram = async () => {
      console.log('[MermaidBlock] Starting diagram render...', {
        contentLength: content.length,
        contentPreview: content.substring(0, 50),
        layoutEngine,
        direction
      });
      
      setIsLoading(true);
      setError(null);

      try {
        // Dynamically import mermaid again (it's cached)
        const mermaidModule = await import('mermaid');
        const mermaid = mermaidModule.default;
        
        if (!mermaid) {
          throw new Error('Mermaid library not loaded');
        }

        console.log('[MermaidBlock] Re-initializing mermaid with theme:', isLight ? 'light' : 'dark');
        
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
        
        console.log('[MermaidBlock] Rendering diagram with ID:', id);

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

        console.log('[MermaidBlock] Diagram rendered successfully, setting SVG content');
        
        // Use state to let React handle the SVG insertion
        setSvgContent(svg);
        setIsLoading(false);
        console.log('[MermaidBlock] Render complete!');
      } catch (err: any) {
        console.error('[MermaidBlock] Mermaid rendering error:', err);
        console.error('[MermaidBlock] Error details:', {
          message: err?.message,
          stack: err?.stack,
          content: content
        });
        
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
      className="mermaid-block"
      style={{
        position: 'relative',
        padding: '12px',
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
          {/* Code toggle button */}
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="mermaid-toggle-btn"
            title={showRaw ? 'Show Diagram' : 'Show Code'}
            style={{
              padding: '5px 10px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: isLight ? '#f9fafb' : '#151C24',
              color: isLight ? '#6b7280' : '#9ca3af',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              height: '28px',
              transition: 'all 0.2s ease',
              boxShadow: isLight 
                ? '0 1px 2px rgba(0, 0, 0, 0.05)' 
                : '0 1px 2px rgba(0, 0, 0, 0.2)',
              whiteSpace: 'nowrap',
            }}
          >
            {showRaw ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Diagram
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
                Code
              </>
            )}
          </button>

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

      {/* Container for mermaid SVG - always rendered so ref is available */}
      <div
        ref={containerRef}
        style={{ 
          display: svgContent && !isLoading && !error && !showRaw ? 'block' : 'none',
          width: '100%',
          overflow: 'auto', // Allow scrolling if diagram is too large
          position: 'relative',
        }}
        dangerouslySetInnerHTML={svgContent ? { __html: svgContent } : undefined}
      />

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

