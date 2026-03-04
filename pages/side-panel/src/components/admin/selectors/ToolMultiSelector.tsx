import * as React from 'react';
import { useEffect, useRef, useState, useMemo } from 'react';
import { cn } from '@extension/ui';
import { useClickOutside, useDropdownPosition } from '../hooks';
import { ToolIcon, ChevronDownIcon, CloseIcon } from '../icons';
import { CheckmarkIcon } from '../icons/CheckIcon';
import { SelectorSkeleton } from '../skeletons';
import type { ToolOption, ToolType } from '../types';
import { getToolTypeLabel } from '../types';

export interface ToolMultiSelectorProps {
  isLight: boolean;
  tools: ToolOption[];
  selectedToolIds: string[];
  onChange: (toolIds: string[]) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  loading?: boolean;
}

export const ToolMultiSelector: React.FC<ToolMultiSelectorProps> = ({
  isLight,
  tools,
  selectedToolIds,
  onChange,
  placeholder = 'All tools',
  allowEmpty = true,
  disabled = false,
  loading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<ToolType>>(new Set());
  const [expandedMcpServers, setExpandedMcpServers] = useState<Set<string>>(new Set());
  const [expandedSelectedCategories, setExpandedSelectedCategories] = useState<Set<ToolType>>(new Set());
  const [expandedSelectedMcpServers, setExpandedSelectedMcpServers] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownPosition = useDropdownPosition(buttonRef, isOpen, 400);

  useClickOutside(dropdownRef, () => {
    setIsOpen(false);
    setSearchQuery('');
  }, isOpen);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Group and filter tools by category and MCP server
  const { groupedTools, mcpServerGroups, filteredToolIds, categoryStats } = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const filtered = new Set<string>();
    const grouped: Record<ToolType, ToolOption[]> = {
      frontend: [],
      backend: [],
      builtin: [],
      mcp: [],
    };
    const mcpServers: Record<string, { server: NonNullable<ToolOption['mcpServer']>; tools: ToolOption[] }> = {};
    const stats: Record<ToolType, { total: number; selected: number }> = {
      frontend: { total: 0, selected: 0 },
      backend: { total: 0, selected: 0 },
      builtin: { total: 0, selected: 0 },
      mcp: { total: 0, selected: 0 },
    };

    tools.forEach(tool => {
      const type = tool.type as ToolType;
      const matchesSearch = !query || 
        tool.name.toLowerCase().includes(query) || 
        tool.toolKey?.toLowerCase().includes(query) ||
        tool.mcpServer?.displayName?.toLowerCase().includes(query);

      if (matchesSearch) {
        filtered.add(tool.id);
        grouped[type]?.push(tool);
        
        // Group MCP tools by server
        if (type === 'mcp' && tool.mcpServer) {
          const serverId = tool.mcpServer.id;
          if (!mcpServers[serverId]) {
            mcpServers[serverId] = {
              server: tool.mcpServer,
              tools: [],
            };
          }
          mcpServers[serverId].tools.push(tool);
        }
      }

      // Always count stats
      if (grouped[type]) {
        stats[type].total++;
        if (selectedToolIds.includes(tool.id)) {
          stats[type].selected++;
        }
      }
    });

    return { 
      groupedTools: grouped, 
      mcpServerGroups: mcpServers,
      filteredToolIds: filtered, 
      categoryStats: stats 
    };
  }, [tools, searchQuery, selectedToolIds]);

  if (loading) {
    return <SelectorSkeleton isLight={isLight} />;
  }

  if (disabled) {
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md min-h-[32px] border opacity-60',
          isLight ? 'bg-white border-gray-300 text-gray-500' : 'bg-[#151C24] border-gray-600 text-gray-400',
        )}
      >
        <span className="flex-shrink-0 mt-0.5">
          <ToolIcon />
        </span>
        <span className="truncate flex-1 text-left">{placeholder}</span>
      </div>
    );
  }

  const toggleTool = (toolId: string) => {
    const newSelection = selectedToolIds.includes(toolId)
      ? selectedToolIds.filter(id => id !== toolId)
      : [...selectedToolIds, toolId];
    onChange(newSelection);
  };

  const toggleCategory = (type: ToolType) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const selectAllInCategory = (type: ToolType) => {
    const categoryTools = groupedTools[type] || [];
    const categoryToolIds = categoryTools
      .filter(tool => filteredToolIds.has(tool.id))
      .map(tool => tool.id);
    const allSelected = categoryToolIds.every(id => selectedToolIds.includes(id));

    if (allSelected) {
      onChange(selectedToolIds.filter(id => !categoryToolIds.includes(id)));
    } else {
      const newSelection = Array.from(new Set([...selectedToolIds, ...categoryToolIds]));
      onChange(newSelection);
    }
  };

  const selectAll = () => {
    const allFilteredIds = Array.from(filteredToolIds);
    const allSelected = allFilteredIds.every(id => selectedToolIds.includes(id));

    if (allSelected) {
      onChange(selectedToolIds.filter(id => !filteredToolIds.has(id)));
    } else {
      const newSelection = Array.from(new Set([...selectedToolIds, ...allFilteredIds]));
      onChange(newSelection);
    }
  };

  const removeTool = (toolId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const newSelection = selectedToolIds.filter(id => id !== toolId);
    onChange(newSelection);
  };

  const selectedTools = tools.filter(tool => selectedToolIds.includes(tool.id));
  const allFilteredSelected = Array.from(filteredToolIds).every(id => selectedToolIds.includes(id));
  const hasFilteredTools = filteredToolIds.size > 0;

  // Group selected tools by category and MCP server for accordion display
  const selectedToolsGrouped = useMemo(() => {
    const grouped: Record<ToolType, ToolOption[]> = {
      frontend: [],
      backend: [],
      builtin: [],
      mcp: [],
    };
    const mcpServers: Record<string, { server: NonNullable<ToolOption['mcpServer']>; tools: ToolOption[] }> = {};

    selectedTools.forEach(tool => {
      const type = tool.type as ToolType;
      if (grouped[type]) {
        grouped[type].push(tool);
        
        if (type === 'mcp' && tool.mcpServer) {
          const serverId = tool.mcpServer.id;
          if (!mcpServers[serverId]) {
            mcpServers[serverId] = {
              server: tool.mcpServer,
              tools: [],
            };
          }
          mcpServers[serverId].tools.push(tool);
        }
      }
    });

    return { grouped, mcpServers };
  }, [selectedTools]);

  const toggleSelectedCategory = (type: ToolType) => {
    setExpandedSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const toggleSelectedMcpServer = (serverId: string) => {
    setExpandedSelectedMcpServers(prev => {
      const next = new Set(prev);
      if (next.has(serverId)) {
        next.delete(serverId);
      } else {
        next.add(serverId);
      }
      return next;
    });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-start gap-1.5 px-2 py-1.5 text-xs rounded-md min-h-[32px] min-w-0 w-full border',
          isLight
            ? 'text-gray-700 hover:bg-gray-50 border-gray-300 bg-white'
            : 'text-gray-200 hover:bg-gray-800/50 border-gray-600 bg-[#151C24]',
        )}
        style={{ height: 'auto' }}
      >
        <span className="flex-shrink-0 mt-0.5">
          <ToolIcon />
        </span>

        {selectedTools.length > 0 ? (
          <div className="flex-1 min-w-0 text-left">
            {(['frontend', 'builtin', 'backend', 'mcp'] as ToolType[]).map(type => {
              const categoryTools = selectedToolsGrouped.grouped[type] || [];
              if (categoryTools.length === 0) return null;

              const isExpanded = expandedSelectedCategories.has(type);
              const isMcp = type === 'mcp';

              return (
                <div key={type} className="mb-1 last:mb-0">
                  {!isMcp ? (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectedCategory(type);
                        }}
                        className={cn(
                          'flex items-center gap-1 text-xs font-medium transition-colors',
                          isLight ? 'text-gray-600 hover:text-gray-800' : 'text-gray-400 hover:text-gray-300'
                        )}
                      >
                        <svg
                          className={cn('w-2.5 h-2.5 transition-transform', isExpanded && 'rotate-90')}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        <span>{getToolTypeLabel(type)} ({categoryTools.length})</span>
                      </button>
                      {isExpanded && (
                        <div className="ml-3 mt-0.5 flex flex-wrap gap-1">
                          {categoryTools.map(tool => (
                            <span
                              key={tool.id}
                              className={cn(
                                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
                                isLight
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-blue-900/30 text-blue-400'
                              )}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {tool.name}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeTool(tool.id, e);
                                }}
                                className={cn(
                                  'hover:bg-black/10 rounded-full p-0.5 transition-colors',
                                  isLight ? 'text-blue-600' : 'text-blue-300'
                                )}
                              >
                                <CloseIcon size={8} strokeWidth={3} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectedCategory(type);
                        }}
                        className={cn(
                          'flex items-center gap-1 text-xs font-medium transition-colors',
                          isLight ? 'text-gray-600 hover:text-gray-800' : 'text-gray-400 hover:text-gray-300'
                        )}
                      >
                        <svg
                          className={cn('w-2.5 h-2.5 transition-transform', isExpanded && 'rotate-90')}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        <span>MCP ({categoryTools.length})</span>
                      </button>
                      {isExpanded && (
                        <div className="ml-3 mt-0.5 space-y-1">
                          {Object.values(selectedToolsGrouped.mcpServers).map(({ server, tools: serverTools }) => {
                            if (serverTools.length === 0) return null;
                            const isServerExpanded = expandedSelectedMcpServers.has(server.id);

                            return (
                              <div key={server.id}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSelectedMcpServer(server.id);
                                  }}
                                  className={cn(
                                    'flex items-center gap-1 text-xs font-medium transition-colors',
                                    isLight ? 'text-gray-500 hover:text-gray-700' : 'text-gray-500 hover:text-gray-400'
                                  )}
                                >
                                  <svg
                                    className={cn('w-2.5 h-2.5 transition-transform', isServerExpanded && 'rotate-90')}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2.5}
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                  </svg>
                                  <span>{server.displayName} ({serverTools.length})</span>
                                </button>
                                {isServerExpanded && (
                                  <div className="ml-4 mt-0.5 flex flex-wrap gap-1">
                                    {serverTools.map(tool => (
              <span
                key={tool.id}
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
                  isLight
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-blue-900/30 text-blue-400'
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {tool.name}
                <button
                  type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            removeTool(tool.id, e);
                                          }}
                  className={cn(
                    'hover:bg-black/10 rounded-full p-0.5 transition-colors',
                    isLight ? 'text-blue-600' : 'text-blue-300'
                  )}
                >
                                          <CloseIcon size={8} strokeWidth={3} />
                </button>
              </span>
            ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <span className={cn('flex-1 min-w-0 text-left', isLight ? 'text-gray-500' : 'text-gray-400')}>
            {placeholder}
          </span>
        )}

        <ChevronDownIcon isOpen={isOpen} className="flex-shrink-0 mt-0.5" />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute right-0 w-full min-w-[280px] rounded-md border shadow-lg z-[9999]',
            dropdownPosition === 'up' ? 'bottom-full mb-1' : 'top-full mt-1',
            isLight
              ? 'bg-white border-gray-200'
              : 'bg-[#151C24] border-gray-700'
          )}
        >
          {/* Search Bar and Select All */}
          <div className={cn('p-2 border-b flex items-center gap-2 rounded-t-md', isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-[#151C24]')}>
            {/* Search */}
            <div className="relative flex-1">
              <svg
                className={cn(
                  'absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5',
                  isLight ? 'text-gray-400' : 'text-gray-500'
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tools..."
                className={cn(
                  'w-full pl-7 pr-2 py-1.5 text-xs rounded-md outline-none transition-colors',
                  isLight
                    ? 'bg-gray-100 text-gray-700 placeholder-gray-400 focus:bg-gray-50 focus:ring-1 focus:ring-gray-300'
                    : 'bg-gray-800/60 text-[#bcc1c7] placeholder-gray-500 focus:bg-gray-800 focus:ring-1 focus:ring-gray-600'
                )}
              />
            </div>

            {/* Select All */}
            {hasFilteredTools && (
              <button
                type="button"
                onClick={selectAll}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium transition-colors rounded whitespace-nowrap',
                  isLight
                    ? 'text-gray-700 hover:bg-gray-200'
                    : 'text-gray-200 hover:bg-gray-700'
                )}
              >
                <div className={cn(
                  'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0',
                  allFilteredSelected
                    ? 'bg-blue-600 border-blue-600'
                    : isLight
                      ? 'border-gray-400'
                      : 'border-gray-500'
                )}>
                  {allFilteredSelected && (
                    <CheckmarkIcon size={8} strokeWidth={3} className="text-white" />
                  )}
                </div>
                <span>All ({filteredToolIds.size})</span>
              </button>
            )}
          </div>

          {/* Tool Categories */}
          <div className="max-h-[320px] overflow-y-auto rounded-b-md">
            {tools.length === 0 ? (
              <div className={cn('px-3 py-2 text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                No tools available
              </div>
            ) : filteredToolIds.size === 0 ? (
              <div className={cn('px-3 py-2 text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                No tools match your search
              </div>
            ) : (
              <>
                {(['frontend', 'builtin', 'backend', 'mcp'] as ToolType[]).map(type => {
                  const categoryTools = groupedTools[type] || [];
                  const visibleTools = categoryTools.filter(tool => filteredToolIds.has(tool.id));
                  if (visibleTools.length === 0) return null;

                  const isExpanded = expandedCategories.has(type);
                  const stats = categoryStats[type];
                  const allCategorySelected = visibleTools.every(tool => selectedToolIds.includes(tool.id));

                  return (
                    <div key={type} className={cn('border-b last:border-b-0', isLight ? 'border-gray-200' : 'border-gray-700')}>
                      {/* Category Header */}
                      <div className={cn('flex items-center gap-2 px-2 py-1.5', isLight ? 'bg-white' : 'bg-[#151C24]')}>
                        <button
                          type="button"
                          onClick={() => toggleCategory(type)}
                          className={cn(
                            'flex items-center gap-1.5 flex-1 text-xs font-medium transition-colors text-left',
                            isLight ? 'text-gray-700 hover:text-gray-700' : 'text-gray-300 hover:text-[#bcc1c7]'
                          )}
                        >
                          <svg
                            className={cn('w-3 h-3 transition-transform', isExpanded && 'rotate-90')}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                          <span>{getToolTypeLabel(type)}</span>
                          <span className={cn('text-[10px]', isLight ? 'text-gray-500' : 'text-gray-400')}>
                            ({stats.selected}/{stats.total})
                          </span>
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => selectAllInCategory(type)}
                          className={cn(
                            'flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors',
                            isLight
                              ? 'text-gray-600 hover:bg-gray-200'
                              : 'text-gray-400 hover:bg-gray-700'
                          )}
                        >
                          <div className={cn(
                            'w-3 h-3 rounded border flex items-center justify-center flex-shrink-0',
                            allCategorySelected
                              ? 'bg-blue-600 border-blue-600'
                              : isLight
                                ? 'border-gray-400'
                                : 'border-gray-500'
                          )}>
                            {allCategorySelected && (
                              <CheckmarkIcon size={6} strokeWidth={4} className="text-white" />
                            )}
                          </div>
                          <span>All</span>
                        </button>
                      </div>

                      {/* Category Tools */}
                      {isExpanded && type !== 'mcp' && (
                        <div>
                          {visibleTools.map(tool => {
                            const isSelected = selectedToolIds.includes(tool.id);
                            return (
                              <button
                                type="button"
                                key={tool.id}
                                onClick={() => toggleTool(tool.id)}
                                className={cn(
                                  'flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors text-left',
                                  isLight
                                    ? 'text-gray-700 hover:bg-gray-100'
                                    : 'text-gray-200 hover:bg-gray-700'
                                )}
                              >
                                <div className={cn(
                                  'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0',
                                  isSelected
                                    ? 'bg-blue-600 border-blue-600'
                                    : isLight
                                      ? 'border-gray-400'
                                      : 'border-gray-500'
                                )}>
                                  {isSelected && (
                                    <CheckmarkIcon size={8} strokeWidth={3} className="text-white" />
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                  <span className="font-medium truncate">{tool.name}</span>
                                  {tool.toolKey && (
                                    <>
                                      <span className={cn('flex-shrink-0', isLight ? 'text-gray-400' : 'text-gray-500')}>|</span>
                                      <span className={cn('text-[10px] truncate', isLight ? 'text-gray-500' : 'text-gray-400')}>
                                        {tool.toolKey}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* MCP Server Groups */}
                      {isExpanded && type === 'mcp' && (
                        <div>
                          {Object.values(mcpServerGroups).map(({ server, tools: serverTools }) => {
                            const visibleServerTools = serverTools.filter(tool => filteredToolIds.has(tool.id));
                            if (visibleServerTools.length === 0) return null;

                            const allServerSelected = visibleServerTools.every(tool => selectedToolIds.includes(tool.id));
                            const serverSelectedCount = visibleServerTools.filter(tool => selectedToolIds.includes(tool.id)).length;
                            const isServerExpanded = expandedMcpServers.has(server.id);

                            return (
                              <div key={server.id} className={cn('border-t', isLight ? 'border-gray-200' : 'border-gray-700')}>
                                {/* MCP Server Header */}
                                <div className={cn('flex items-center gap-2 pl-6 pr-4 py-1.5', isLight ? 'bg-white' : 'bg-[#151C24]')}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExpandedMcpServers(prev => {
                                        const next = new Set(prev);
                                        if (next.has(server.id)) {
                                          next.delete(server.id);
                                        } else {
                                          next.add(server.id);
                                        }
                                        return next;
                                      });
                                    }}
                                    className={cn('flex-shrink-0', isLight ? 'text-gray-500' : 'text-gray-400')}
                                  >
                                    <svg
                                      className={cn('w-3 h-3 transition-transform', isServerExpanded && 'rotate-90')}
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                      strokeWidth={2.5}
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                    </svg>
                                  </button>
                                  <span className={cn('flex-1 text-[11px] font-medium truncate', isLight ? 'text-gray-600' : 'text-gray-400')}>
                                    {server.displayName}
                                  </span>
                                  <span className={cn('text-[10px]', isLight ? 'text-gray-500' : 'text-gray-500')}>
                                    ({serverSelectedCount}/{visibleServerTools.length})
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const serverToolIds = visibleServerTools.map(t => t.id);
                                      if (allServerSelected) {
                                        onChange(selectedToolIds.filter(id => !serverToolIds.includes(id)));
                                      } else {
                                        onChange(Array.from(new Set([...selectedToolIds, ...serverToolIds])));
                                      }
                                    }}
                                    className={cn(
                                      'flex items-center gap-1 px-1 py-0.5 text-[10px] rounded transition-colors',
                                      isLight ? 'text-gray-600 hover:bg-gray-200' : 'text-gray-400 hover:bg-gray-700'
                                    )}
                                  >
                                    <div className={cn(
                                      'w-3 h-3 rounded border flex items-center justify-center flex-shrink-0',
                                      allServerSelected
                                        ? 'bg-blue-600 border-blue-600'
                                        : isLight
                                          ? 'border-gray-400'
                                          : 'border-gray-500'
                                    )}>
                                      {allServerSelected && (
                                        <CheckmarkIcon size={6} strokeWidth={4} className="text-white" />
                                      )}
                                    </div>
                                  </button>
                                </div>

                                {/* MCP Server Tools */}
                                {isServerExpanded && visibleServerTools.map(tool => {
                                  const isSelected = selectedToolIds.includes(tool.id);
                                  return (
                                    <button
                                      type="button"
                                      key={tool.id}
                                      onClick={() => toggleTool(tool.id)}
                                      className={cn(
                                        'flex items-center gap-2 w-full pl-12 pr-3 py-1.5 text-xs transition-colors text-left',
                                        isLight
                                          ? 'text-gray-700 hover:bg-gray-100'
                                          : 'text-gray-200 hover:bg-gray-700'
                                      )}
                                    >
                                      <div className={cn(
                                        'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0',
                                        isSelected
                                          ? 'bg-blue-600 border-blue-600'
                                          : isLight
                                            ? 'border-gray-400'
                                            : 'border-gray-500'
                                      )}>
                                        {isSelected && (
                                          <CheckmarkIcon size={8} strokeWidth={3} className="text-white" />
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                        <span className="font-medium truncate">{tool.name}</span>
                                        {tool.toolKey && (
                                          <>
                                            <span className={cn('flex-shrink-0', isLight ? 'text-gray-400' : 'text-gray-500')}>|</span>
                                            <span className={cn('text-[10px] truncate', isLight ? 'text-gray-500' : 'text-gray-400')}>
                                              {tool.toolKey}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolMultiSelector;

