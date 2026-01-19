/**
 * Custom Table Component for CopilotKit V2
 * 
 * Provides:
 * - Table: Styled table matching graph card design
 * - CustomTableWrapper: Wrapper for Streamdown table elements
 */
import React, { useState, useCallback, useMemo, useRef, useEffect, memo, FC } from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';

// =============================================================================
// Table Auto-Scroll Container
// =============================================================================

interface TableAutoScrollContainerProps {
  children: React.ReactNode;
  colors: {
    cellBg: string;
  };
  tableRef: React.RefObject<HTMLTableElement>;
}

/**
 * Auto-scrolling container for table content.
 * Scrolls to bottom as new rows are added during streaming,
 * but respects user scrolling up.
 */
const TableAutoScrollContainer: FC<TableAutoScrollContainerProps> = memo(({ children, colors, tableRef }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUp = useRef(false);
  const lastRowCount = useRef(0);
  const isAutoScrolling = useRef(false);
  const prevScrollTopRef = useRef(0);
  const scrollRafRef = useRef<number | null>(null);
  const observationTimeoutRef = useRef<number | null>(null);

  const threshold = 50;

  // Check if user is near the bottom of the container
  const isNearBottom = useCallback((element: HTMLDivElement): boolean => {
    const { scrollTop, scrollHeight, clientHeight } = element;
    if (scrollHeight <= clientHeight) return true;
    return scrollHeight - scrollTop - clientHeight <= threshold;
  }, []);

  // Handle scroll events to detect user scrolling up
  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    
    // Skip if this is an auto-scroll we triggered
    if (isAutoScrolling.current) return;

    const currentScrollTop = element.scrollTop;
    const prevScrollTop = prevScrollTopRef.current;
    const nearBottom = isNearBottom(element);
    
    // Detect scroll direction (5px threshold to avoid noise)
    const scrolledUp = currentScrollTop < prevScrollTop - 5;
    
    // Update previous scroll position
    prevScrollTopRef.current = currentScrollTop;
    
    // If user scrolled up and not near bottom, disable auto-scroll
    if (scrolledUp && !nearBottom) {
      isUserScrolledUp.current = true;
    }
    // If user is near bottom (regardless of scroll direction), re-enable auto-scroll
    else if (nearBottom) {
      isUserScrolledUp.current = false;
    }
  }, [isNearBottom]);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    
    isAutoScrolling.current = true;
    // Use RAF to batch with render for smoother visual
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      if (element) {
        element.scrollTop = element.scrollHeight - element.clientHeight;
        isAutoScrolling.current = false;
        scrollRafRef.current = null;
      }
    });
  }, []);

  // Observe table changes to detect new rows
  useEffect(() => {
    const table = tableRef.current;
    const scrollContainer = scrollRef.current;
    if (!table || !scrollContainer) return;

    // Use MutationObserver to detect when rows are added
    const observer = new MutationObserver(() => {
      // Clear any pending timeout
      if (observationTimeoutRef.current) {
        clearTimeout(observationTimeoutRef.current);
      }

      // Debounce to batch rapid changes
      observationTimeoutRef.current = window.setTimeout(() => {
        const currentTable = tableRef.current;
        if (!currentTable) return;
        
        const currentRowCount = currentTable.querySelectorAll('tbody tr').length;
        const rowCountGrew = currentRowCount > lastRowCount.current;
        lastRowCount.current = currentRowCount;

        // Only auto-scroll if rows were added AND user hasn't scrolled up
        if (rowCountGrew && !isUserScrolledUp.current) {
          scrollToBottom();
        }
      }, 50);
    });

    // Observe changes to the table (child additions/modifications)
    observer.observe(table, {
      childList: true,
      subtree: true,
    });

    // Initial row count
    lastRowCount.current = table.querySelectorAll('tbody tr').length;

    return () => {
      observer.disconnect();
      if (observationTimeoutRef.current) {
        clearTimeout(observationTimeoutRef.current);
      }
    };
  }, [scrollToBottom]);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
      }
      if (observationTimeoutRef.current) {
        clearTimeout(observationTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      style={{
        overflowX: 'auto',
        overflowY: 'auto',
        maxHeight: '400px',
        WebkitOverflowScrolling: 'touch',
        backgroundColor: colors.cellBg,
      }}
    >
      {children}
    </div>
  );
});

TableAutoScrollContainer.displayName = 'TableAutoScrollContainer';

// =============================================================================
// Table - Styled table component matching graph card design
// =============================================================================

export interface TableProps {
  children: React.ReactNode;
  isLight: boolean;
  hideToolbar?: boolean;
}

/**
 * Table - Renders a styled table matching graph card design
 * 
 * Uses inline styles to ensure consistent rendering across contexts
 */
export const Table: React.FC<TableProps> = ({ children, isLight, hideToolbar = false }) => {
  const [copied, setCopied] = useState(false);
  const tableId = useMemo(() => `custom-table-${Math.random().toString(36).substr(2, 9)}`, []);
  const tableRef = useRef<HTMLTableElement>(null);

  // Extract table data from DOM for CSV export
  const extractTableData = useCallback(() => {
    const rows: string[][] = [];
    
    if (!tableRef.current) return rows;
    
    const tableRows = tableRef.current.querySelectorAll('tr');
    tableRows.forEach((tr) => {
      const cells: string[] = [];
      const cellElements = tr.querySelectorAll('th, td');
      cellElements.forEach((cell) => {
        cells.push(cell.textContent?.trim() || '');
      });
      if (cells.length > 0) {
        rows.push(cells);
      }
    });
    
    return rows;
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      const data = extractTableData();
      const csv = data.map(row => row.join('\t')).join('\n');
      await navigator.clipboard.writeText(csv);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy table:', error);
    }
  }, [extractTableData]);

  const handleDownload = useCallback(() => {
    const data = extractTableData();
    const csv = data.map(row => 
      row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `table-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [extractTableData]);

  // Color scheme matching code block design
  // #151C24 + 3% white overlay ≈ #1C232B (calculated solid equivalent)
  const colors = {
    wrapper: isLight ? '#f9fafb' : '#151C24',
    border: isLight ? '#e5e7eb' : '#374151',
    // Header uses solid color matching toolbar overlay effect (for sticky header)
    headerBg: isLight ? '#f5f5f6' : '#1C232B',
    headerText: isLight ? '#4b5563' : '#9ca3af',
    cellBg: isLight ? '#ffffff' : '#0d1117',
    cellText: isLight ? '#374151' : '#d1d5db',
    rowDivider: isLight ? '#f3f4f6' : '#374151',
    hoverBg: isLight ? '#f9fafb' : 'rgba(255, 255, 255, 0.05)',
    toolbarBg: isLight ? '#ffffff' : '#0d1117',
    toolbarText: isLight ? '#6b7280' : '#9ca3af',
  };

  return (
    <div
      id={tableId}
      style={{
        position: 'relative',
        borderRadius: '6px',
        overflow: 'hidden',
        margin: '0.8em 0',
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.wrapper,
      }}
    >
      {/* Toolbar */}
      {!hideToolbar && (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '28px',
          padding: '0 8px',
          background: colors.toolbarBg,
          borderBottom: `1px solid ${colors.border}`,
          fontSize: '11px',
          color: colors.toolbarText,
        }}
      >
        <span style={{ fontWeight: 500 }}> </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {/* Copy Button */}
          <button
            onClick={handleCopy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '20px',
              width: '20px',
              padding: 0,
              borderRadius: '4px',
              border: 'none',
              background: 'transparent',
              color: copied ? (isLight ? '#22c55e' : '#4ade80') : 'inherit',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!copied) {
                e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            title={copied ? 'Copied!' : 'Copy'}
          >
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            )}
          </button>
          {/* Download CSV Button */}
          <button
            onClick={handleDownload}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '20px',
              width: '20px',
              padding: 0,
              borderRadius: '4px',
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            title="Download CSV"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
        </div>
      </div>
      )}
      {/* Table Content with Auto-Scroll */}
      <TableAutoScrollContainer colors={colors} tableRef={tableRef}>
        <table
          ref={tableRef}
          style={{
            minWidth: '100%',
            width: 'max-content',
            borderCollapse: 'collapse',
            fontSize: '12px',
            lineHeight: '1.4',
            display: 'table',
            margin: 0,
            color: colors.cellText,
            backgroundColor: colors.cellBg,
          }}
        >
          {children}
        </table>
      </TableAutoScrollContainer>
      {/* Inject scoped styles for th, td, tr hover */}
      <style>{`
        #${tableId} {
          --border: ${colors.border} !important;
          --tw-border-opacity: 1 !important;
        }
        #${tableId} table {
          background-color: ${colors.cellBg} !important;
          --border: ${colors.border} !important;
        }
        #${tableId} th,
        #${tableId} thead th,
        #${tableId} thead tr th {
          display: table-cell !important;
          padding: 8px 12px !important;
          text-align: left !important;
          vertical-align: middle !important;
          font-weight: 600 !important;
          font-size: 12px !important;
          white-space: nowrap !important;
          position: sticky !important;
          top: 0 !important;
          z-index: 10 !important;
          background-color: ${colors.headerBg} !important;
          background: ${colors.headerBg} !important;
          color: ${colors.headerText} !important;
          border: none !important;
          border-top: none !important;
          border-left: none !important;
          border-right: none !important;
          border-bottom: none !important;
        }
        #${tableId} thead tr,
        #${tableId} thead tr[data-streamdown="table-row"],
        #${tableId} thead tr.border-border,
        #${tableId} thead tr[class*="border"] {
          background-color: ${colors.headerBg} !important;
          background: ${colors.headerBg} !important;
          border-bottom: 1px solid ${colors.border} !important;
          border-bottom-width: 1px !important;
          border-bottom-style: solid !important;
          border-bottom-color: ${colors.border} !important;
        }
        #${tableId} td {
          display: table-cell !important;
          padding: 8px 12px !important;
          text-align: left !important;
          vertical-align: middle !important;
          white-space: nowrap !important;
          background-color: ${colors.cellBg} !important;
          color: ${colors.cellText} !important;
          font-size: 12px !important;
          font-weight: 400 !important;
        }
        #${tableId} tbody {
          display: table-row-group !important;
          background-color: ${colors.cellBg} !important;
        }
        #${tableId} tbody tr {
          border-top: 1px solid ${colors.border} !important;
          border-top-color: ${colors.border} !important;
          border-color: ${colors.border} !important;
          transition: background-color 0.15s ease !important;
          background-color: ${colors.cellBg} !important;
        }
        #${tableId} tbody tr.border-border,
        #${tableId} tbody tr.border-b,
        #${tableId} tbody tr[class*="border"] {
          border-color: ${colors.border} !important;
          border-top-color: ${colors.border} !important;
          border-bottom-color: ${colors.border} !important;
        }
        #${tableId} tbody tr:hover {
          background-color: ${colors.hoverBg} !important;
        }
        #${tableId} tbody tr:hover td {
          background-color: ${colors.hoverBg} !important;
        }
        #${tableId} thead,
        #${tableId} thead.bg-muted\\/80,
        #${tableId} thead[class*="bg-muted"] {
          display: table-header-group !important;
          background-color: ${colors.headerBg} !important;
          background: ${colors.headerBg} !important;
        }
        #${tableId} thead tr,
        #${tableId} thead tr.bg-muted\\/80,
        #${tableId} thead tr[class*="bg-muted"] {
          background-color: ${colors.headerBg} !important;
          background: ${colors.headerBg} !important;
          border-bottom: 1px solid ${colors.border} !important;
          border-bottom-color: ${colors.border} !important;
          border-color: ${colors.border} !important;
        }
        #${tableId} thead tr.border-border,
        #${tableId} thead tr.border-b,
        #${tableId} thead tr[class*="border"] {
          border-color: ${colors.border} !important;
          border-bottom-color: ${colors.border} !important;
        }
        /* Override bg-muted classes on thead */
        #${tableId} thead.bg-muted\\/80,
        #${tableId} thead .bg-muted\\/80,
        #${tableId} [data-streamdown="table-header"].bg-muted\\/80,
        #${tableId} [data-streamdown="table-header"][class*="bg-muted"] {
          background-color: ${colors.headerBg} !important;
          background: ${colors.headerBg} !important;
        }
        #${tableId} tr {
          display: table-row !important;
        }
        /* Override Tailwind prose styles */
        #${tableId} .prose th,
        #${tableId} :where(.prose th):not(:where([class~=not-prose], [class~=not-prose] *)) {
          border: none !important;
          border-bottom: none !important;
        }
        #${tableId} .prose thead tr,
        #${tableId} :where(.prose thead tr):not(:where([class~=not-prose], [class~=not-prose] *)) {
          border-bottom: 1px solid ${colors.border} !important;
        }
        /* Override any Streamdown classes and Tailwind utility classes */
        /* tbody rows get cell background */
        #${tableId} tbody [data-streamdown="table-body"],
        #${tableId} tbody [data-streamdown="table-row"],
        #${tableId} tbody [data-streamdown="table-cell"],
        #${tableId} tbody[data-streamdown="table-body"],
        #${tableId} tbody tr[data-streamdown="table-row"],
        #${tableId} tbody td[data-streamdown="table-cell"] {
          background-color: ${colors.cellBg} !important;
          background: ${colors.cellBg} !important;
        }
        /* thead rows get header background */
        #${tableId} thead [data-streamdown="table-header"],
        #${tableId} thead [data-streamdown="table-row"],
        #${tableId} thead [data-streamdown="table-header-cell"],
        #${tableId} thead[data-streamdown="table-header"],
        #${tableId} thead tr[data-streamdown="table-row"],
        #${tableId} thead th[data-streamdown="table-header-cell"] {
          background-color: ${colors.headerBg} !important;
          background: ${colors.headerBg} !important;
        }
        /* Only target table cells, not code elements inside cells */
        #${tableId} tbody td[class*="bg-muted"],
        #${tableId} tbody th[class*="bg-muted"],
        #${tableId} tbody [data-streamdown="table-cell"][class*="bg-muted"],
        #${tableId} tbody [data-streamdown="table-data-cell"][class*="bg-muted"] {
          background-color: ${colors.cellBg} !important;
          background: ${colors.cellBg} !important;
        }
        /* Only target table header cells, not code elements inside headers */
        #${tableId} thead th.bg-muted\\/40,
        #${tableId} thead th.bg-muted\\/80,
        #${tableId} thead th[class*="bg-muted"],
        #${tableId} thead th[class*="bg-gray"],
        #${tableId} thead th[class*="bg-slate"],
        #${tableId} thead [data-streamdown="table-header-cell"].bg-muted\\/40,
        #${tableId} thead [data-streamdown="table-header-cell"].bg-muted\\/80,
        #${tableId} thead [data-streamdown="table-header-cell"][class*="bg-muted"],
        #${tableId} thead [data-streamdown="table-header-cell"][class*="bg-gray"],
        #${tableId} thead [data-streamdown="table-header-cell"][class*="bg-slate"] {
          background-color: ${colors.headerBg} !important;
          background: ${colors.headerBg} !important;
        }
        /* Override divide-y border colors */
        #${tableId} .divide-y > :not([hidden]) ~ :not([hidden]),
        #${tableId} tbody.divide-y > :not([hidden]) ~ :not([hidden]),
        #${tableId} [class*="divide-"] > :not([hidden]) ~ :not([hidden]) {
          border-color: ${colors.border} !important;
          --tw-divide-opacity: 1 !important;
        }
        /* Force all border colors within table */
        #${tableId} tr,
        #${tableId} th,
        #${tableId} td {
          border-color: ${colors.border} !important;
        }
      `}</style>
    </div>
  );
};

// =============================================================================
// CustomTableWrapper - Wrapper for Streamdown table elements
// =============================================================================

interface CustomTableWrapperProps {
  children?: React.ReactNode;
  className?: string;
  node?: any;
  hideToolbars?: boolean;
  [key: string]: any;
}

/**
 * CustomTableWrapper - Custom table element renderer
 * 
 * Wraps table content with styled Table component.
 * Used as the `table` component override in markdown renderers.
 */
export const CustomTableWrapper: React.FC<CustomTableWrapperProps> = ({
  children,
  className,
  hideToolbars = false,
  ...props
}) => {
  const themeState = useStorage(themeStorage);
  const isLight = themeState.isLight;

  return (
    <div className="custom-table-wrapper">
      <Table isLight={isLight} hideToolbar={hideToolbars}>
        {children}
      </Table>
    </div>
  );
};

export default CustomTableWrapper;

