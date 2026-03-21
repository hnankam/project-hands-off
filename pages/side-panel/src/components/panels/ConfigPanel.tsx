import * as React from 'react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@extension/ui';
import { debug } from '@extension/shared';
import { PlanStateCard } from '../cards/PlanStateCard';
import { GraphStateCard, convertToGraphAgentState, type UnifiedAgentState } from '../graph-state';
import { AgentIcon } from '../admin/icons';
import type { ChatPreviewDocument } from '../../context/ChatPreviewContext';
import { CustomMarkdownRenderer } from '../chat/CustomMarkdownRenderer';
import { CodeBlock } from '../chat/slots/CustomCodeBlock';

export type ConfigPanelTab = 'context' | 'plans' | 'graphs' | 'preview' | 'sub-agents';

interface ConfigPanelProps {
  isLight: boolean;
  isOpen: boolean;
  onClose: () => void;
  plans?: Record<string, any>;
  graphs?: Record<string, any>;
  sessionId?: string;
  onPlansUpdate?: (plans: Record<string, any>) => void;
  onGraphsUpdate?: (graphs: Record<string, any>) => void;
  onWidthChange?: (width: number) => void;
  initialWidth?: number;
  isSmallView?: boolean;
  chatFontSize?: 'small' | 'medium' | 'large';
  /** Controlled active tab (when provided with onTabChange) */
  activeTab?: ConfigPanelTab;
  /** Called when user switches tab (enables controlled mode) */
  onTabChange?: (tab: ConfigPanelTab) => void;
  /** File shown in the Preview tab when opened from chat */
  previewDocument?: ChatPreviewDocument | null;
}

const MIN_PANEL_WIDTH = 300;
const MAX_PANEL_WIDTH = 800;
const DEFAULT_PANEL_WIDTH = 384;
const PANEL_ANIMATION_DURATION_MS = 220;

// Context icon (layers/stack - 3 layers)
const ContextIcon = ({ isLight }: { isLight: boolean }) => (
  <svg
    className={cn('h-3.5 w-3.5', isLight ? 'text-gray-600' : 'text-gray-400')}
    viewBox="0 0 32 32"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round">
    <path d="M16 17L3 11l13-6 13 6-13 6z" />
    <path d="M3 15.5l13 6 13-6" />
    <path d="M3 20l13 6 13-6" />
  </svg>
);

// Plans icon (clipboard)
const PlansIcon = ({ isLight }: { isLight: boolean }) => (
  <svg
    className={cn('h-3.5 w-3.5', isLight ? 'text-gray-600' : 'text-gray-400')}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round">
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);

// Graphs icon (network)
const GraphsIcon = ({ isLight }: { isLight: boolean }) => (
  <svg
    className={cn('h-3.5 w-3.5', isLight ? 'text-gray-600' : 'text-gray-400')}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

// Preview icon (document with corner fold)
const PreviewIcon = ({ isLight }: { isLight: boolean }) => (
  <svg
    className={cn('h-3.5 w-3.5', isLight ? 'text-gray-600' : 'text-gray-400')}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
    <path d="M10 9H8" />
  </svg>
);

export const ConfigPanel: React.FC<ConfigPanelProps> = ({
  isLight,
  isOpen,
  onClose,
  plans,
  graphs,
  sessionId,
  onPlansUpdate,
  onGraphsUpdate,
  onWidthChange,
  initialWidth = DEFAULT_PANEL_WIDTH,
  isSmallView = false,
  chatFontSize = 'medium',
  activeTab: controlledActiveTab,
  onTabChange,
  previewDocument = null,
}) => {
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const [internalActiveTab, setInternalActiveTab] = useState<ConfigPanelTab>('context');
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const setActiveTab = useCallback(
    (tab: ConfigPanelTab) => {
      if (onTabChange) {
        onTabChange(tab);
      } else {
        setInternalActiveTab(tab);
      }
    },
    [onTabChange],
  );
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [tabsOverflow, setTabsOverflow] = useState(false);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(initialWidth);
  const [previewTopFeather, setPreviewTopFeather] = useState(false);

  const handlePreviewBodyScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setPreviewTopFeather(e.currentTarget.scrollTop > 2);
  }, []);

  useEffect(() => {
    setPreviewTopFeather(false);
  }, [previewDocument?.filePath, previewDocument?.content]);

  // Opening animation: slide in from right
  useEffect(() => {
    if (!isOpen) return;
    setIsClosing(false);
    const frame = requestAnimationFrame(() => {
      setIsAnimatingIn(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCloseClick = useCallback(() => {
    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, PANEL_ANIMATION_DURATION_MS);
  }, [onClose]);
  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  // Update width when initialWidth changes (e.g., when reopening panel)
  React.useEffect(() => {
    if (isOpen && initialWidth !== width) {
      setWidth(initialWidth);
      resizeStartWidth.current = initialWidth;
    }
  }, [isOpen, initialWidth, width]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = width;
    },
    [width],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;
      const deltaX = resizeStartX.current - e.clientX;
      const newWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, resizeStartWidth.current + deltaX));
      setWidth(newWidth);
      onWidthChange?.(newWidth);
    },
    [isResizing, onWidthChange],
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  React.useEffect(() => {
    if (!isResizing) return;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Center tabs when they fit (like admin page); scroll when they overflow
  React.useEffect(() => {
    const el = tabsContainerRef.current;
    const checkOverflow = () => {
      if (el) {
        setTabsOverflow(el.scrollWidth > el.clientWidth);
      }
    };
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    const ro = el ? new ResizeObserver(checkOverflow) : null;
    if (el && ro) ro.observe(el);
    return () => {
      window.removeEventListener('resize', checkOverflow);
      if (ro) ro.disconnect();
    };
  }, [activeTab, plans, graphs, width, isOpen]);

  React.useEffect(() => {
    const planIds = Object.keys(plans ?? {});
    const graphIds = Object.keys(graphs ?? {});
    debug.log('[ConfigPanel] plans/graphs updated:', {
      sessionId: sessionId?.slice(0, 8),
      planCount: planIds.length,
      graphCount: graphIds.length,
    });
  }, [plans, graphs, sessionId]);

  if (!isOpen) {
    return null;
  }

  const planEntries = plans ? Object.entries(plans) : [];
  const graphEntries = graphs ? Object.entries(graphs) : [];

  const tabs: { id: ConfigPanelTab; label: string; count: number; icon: React.ReactNode }[] = [
    { id: 'context', label: 'Context', count: 0, icon: <ContextIcon isLight={isLight} /> },
    { id: 'plans', label: 'Plans', count: planEntries.length, icon: <PlansIcon isLight={isLight} /> },
    { id: 'graphs', label: 'Graphs', count: graphEntries.length, icon: <GraphsIcon isLight={isLight} /> },
    { id: 'preview', label: 'Preview', count: 0, icon: <PreviewIcon isLight={isLight} /> },
    {
      id: 'sub-agents',
      label: 'Sub Agents',
      count: 0,
      icon: <AgentIcon className={cn(isLight ? 'text-gray-600' : 'text-gray-400')} size={14} />,
    },
  ];

  return (
    <>
      {isSmallView && (
        <div
          className={cn(
            'absolute inset-0 z-30 bg-black/50 transition-opacity duration-[220ms] ease-out',
            isClosing ? 'opacity-0' : isAnimatingIn ? 'opacity-100' : 'opacity-0',
          )}
          onClick={handleCloseClick}
          style={{ pointerEvents: 'auto' }}
        />
      )}

      <div
        className={cn(
          'font-size- absolute top-0 right-0 bottom-0 z-40 flex min-h-0 flex-col border-l' + chatFontSize,
          isLight ? 'border-gray-200/60 bg-white' : 'border-gray-700/60',
        )}
        style={{
          backgroundColor: isLight ? '#ffffff' : '#0D1117',
          width: isSmallView ? '85vw' : `${width}px`,
          maxWidth: isSmallView ? '400px' : undefined,
          transition: isResizing ? 'none' : 'width 0.2s ease-in-out, transform 220ms ease-out',
          transform: isClosing ? 'translateX(100%)' : isAnimatingIn ? 'translateX(0)' : 'translateX(100%)',
          pointerEvents: 'auto',
        }}>
        {!isSmallView && (
          <div
            className={cn(
              'absolute top-0 bottom-0 left-0 z-30 w-1 cursor-ew-resize transition-colors hover:bg-blue-500/50',
              isResizing && 'bg-blue-500',
            )}
            onMouseDown={handleMouseDown}
            aria-hidden
          />
        )}

        {/* Header - tab container full width, tabs horizontally scrollable (scrollbar hidden) */}
        <div
          className={cn(
            'flex h-[35px] min-h-[35px] min-w-0 items-center border-b px-0 py-0',
            isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
          )}>
          <div
            ref={tabsContainerRef}
            className={cn(
              'session-tabs-scroll flex w-full min-w-0 items-center gap-1 overflow-x-auto p-1',
              !tabsOverflow && 'justify-center',
              isLight ? 'bg-gray-50' : 'bg-[#151C24]',
            )}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex flex-shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors',
                  activeTab === tab.id
                    ? isLight
                      ? 'bg-gray-200 text-gray-700'
                      : 'bg-gray-700 text-gray-200'
                    : isLight
                      ? 'text-gray-600 hover:text-gray-900'
                      : 'text-gray-400 hover:text-gray-200',
                )}>
                {tab.icon}
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span
                    className={cn(
                      'config-panel-tab-count min-w-[14px] rounded px-0.5 text-center',
                      activeTab === tab.id
                        ? isLight
                          ? 'bg-gray-200 text-gray-700'
                          : 'bg-gray-600 text-gray-300'
                        : isLight
                          ? 'bg-gray-200 text-gray-600'
                          : 'bg-gray-600 text-gray-400',
                    )}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div
          className={cn(
            'min-h-0 flex-1',
            activeTab === 'preview' && previewDocument
              ? 'flex flex-col overflow-hidden p-0'
              : 'overflow-y-auto px-4 py-4',
          )}>
          {activeTab === 'context' && (
            <div className={cn('py-8 text-center text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>
              <svg
                className={cn('mx-auto mb-3 h-12 w-12', isLight ? 'text-gray-300' : 'text-gray-600')}
                viewBox="0 0 32 32"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round">
                <path d="M16 17L3 11l13-6 13 6-13 6z" />
                <path d="M3 15.5l13 6 13-6" />
                <path d="M3 20l13 6 13-6" />
              </svg>
              <p>Context</p>
              <p className="mt-1 text-xs opacity-75">Session context will appear here.</p>
            </div>
          )}

          {activeTab === 'plans' && (
            <>
              {planEntries.length === 0 ? (
                <div className={cn('py-8 text-center text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>
                  <svg
                    className={cn('mx-auto mb-3 h-12 w-12', isLight ? 'text-gray-300' : 'text-gray-600')}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                  <p>No plans in this session yet.</p>
                  <p className="mt-1 text-xs opacity-75">
                    Plans will appear here as they're created during your conversation.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {planEntries.map(([planId, plan]) => {
                    const planState: UnifiedAgentState = {
                      sessionId: sessionId || '',
                      plans: { [planId]: plan },
                      graphs: {},
                    };
                    const handleSetState = onPlansUpdate
                      ? (newState: UnifiedAgentState) => {
                          if (newState.plans) {
                            const merged = { ...plans, ...newState.plans };
                            debug.log('[ConfigPanel] Plans handleSetState:', {
                              planId,
                              incomingPlanIds: Object.keys(newState.plans),
                              mergedPlanIds: Object.keys(merged),
                            });
                            onPlansUpdate(merged);
                          }
                        }
                      : undefined;
                    return (
                      <PlanStateCard key={planId} state={planState} setState={handleSetState} isCollapsed={true} />
                    );
                  })}
                </div>
              )}
            </>
          )}

          {activeTab === 'sub-agents' && (
            <div className={cn('py-8 text-center text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>
              <AgentIcon className={cn('mx-auto mb-3', isLight ? 'text-gray-300' : 'text-gray-600')} size={48} />
              <p>Sub Agents</p>
              <p className="mt-1 text-xs opacity-75">Sub agent activity will appear here.</p>
            </div>
          )}

          {activeTab === 'preview' && (
            <>
              {previewDocument ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div
                    className={cn(
                      'mx-3 mt-2 mb-2 flex-shrink-0 rounded-md px-2 py-1.5 text-left',
                      isLight ? 'bg-gray-100/90' : 'bg-[#1a1f26]/90',
                    )}>
                    <div
                      className={cn('truncate text-[11px] font-medium', isLight ? 'text-gray-800' : 'text-gray-100')}
                      title={previewDocument.filePath}>
                      {previewDocument.fileName}
                    </div>
                    {previewDocument.filePath !== previewDocument.fileName && (
                      <div
                        className={cn('truncate font-mono text-[10px]', isLight ? 'text-gray-500' : 'text-gray-500')}
                        title={previewDocument.filePath}>
                        {previewDocument.filePath}
                      </div>
                    )}
                  </div>
                  <div
                    className={cn('relative flex min-h-0 flex-1 flex-col overflow-hidden', !isLight && 'dark')}
                    style={
                      {
                        '--archived-feather-bg': isLight ? '#ffffff' : '#0D1117',
                      } as React.CSSProperties
                    }>
                    <div
                      className={cn(
                        'recent-sessions-scroll min-h-0 flex-1 overflow-y-auto',
                        previewDocument.isMarkdown ? 'px-0 py-0' : 'px-1.5 pt-1.5 pb-0',
                      )}
                      onScroll={handlePreviewBodyScroll}>
                      {previewDocument.isMarkdown ? (
                        <div className={cn('files-card-markdown config-panel-preview-markdown', isLight ? '' : 'dark')}>
                          <CustomMarkdownRenderer
                            content={previewDocument.content}
                            isLight={isLight}
                            hideToolbars={true}
                            className="markdown-content text-sm"
                          />
                        </div>
                      ) : (
                        <div className="config-panel-preview-code">
                          <CodeBlock
                            language={previewDocument.language}
                            code={previewDocument.content}
                            isLight={isLight}
                            hideToolbar={true}
                          />
                        </div>
                      )}
                    </div>
                    <div
                      className={cn(
                        'sessions-panel-scroll-feather-top pointer-events-none absolute top-0 right-0 left-0 z-10 h-2 transition-opacity duration-150',
                        previewTopFeather ? 'opacity-100' : 'opacity-0',
                      )}
                      aria-hidden
                    />
                    <div
                      className="sessions-panel-archived-feather pointer-events-none absolute right-0 bottom-0 left-0 z-10 h-2"
                      aria-hidden
                    />
                  </div>
                </div>
              ) : (
                <div className={cn('py-8 text-center text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>
                  <svg
                    className={cn('mx-auto mb-3 h-12 w-12', isLight ? 'text-gray-300' : 'text-gray-600')}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <path d="M14 2v6h6" />
                    <path d="M16 13H8" />
                    <path d="M16 17H8" />
                    <path d="M10 9H8" />
                  </svg>
                  <p>Preview</p>
                  <p className="mt-1 text-xs opacity-75">
                    Open a completed file from chat with the preview button on the file card.
                  </p>
                </div>
              )}
            </>
          )}

          {activeTab === 'graphs' && (
            <>
              {graphEntries.length === 0 ? (
                <div className={cn('py-8 text-center text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>
                  <svg
                    className={cn('mx-auto mb-3 h-12 w-12', isLight ? 'text-gray-300' : 'text-gray-600')}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  <p>No graphs in this session yet.</p>
                  <p className="mt-1 text-xs opacity-75">
                    Graphs will appear here as they're created during your conversation.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {graphEntries.map(([graphId, graph]) => {
                    const graphState = convertToGraphAgentState({ graphs: { [graphId]: graph } });
                    if (!graphState) return null;
                    const handleSetState = onGraphsUpdate
                      ? (newState: UnifiedAgentState) => {
                          if (newState.graphs) {
                            onGraphsUpdate(newState.graphs);
                          }
                        }
                      : undefined;
                    return (
                      <GraphStateCard
                        key={graphId}
                        state={graphState}
                        setState={handleSetState as any}
                        isCollapsed={true}
                        sessionId={sessionId}
                        instanceId={graphId}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};
