import * as React from 'react';
import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@extension/ui';
import type { RequiredWorkspaceCredentialMeta } from '../../hooks/useAgentsConfigForModelSelector';

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-3.5 w-3.5 flex-shrink-0', className)}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function formatMissingCredential(m: RequiredWorkspaceCredentialMeta): string {
  const t = (m.credential_type ?? m.type ?? '').trim() || 'Unknown type';
  const d = typeof m.description === 'string' ? m.description.trim() : '';
  return d ? `${t} (${d})` : t;
}

export function RequiredWorkspaceCredentialsBanner({
  isLight,
  missing,
  className,
}: {
  isLight: boolean;
  /** Required credentials not yet satisfied by selected context (type-matched). */
  missing: RequiredWorkspaceCredentialMeta[];
  className?: string;
}) {
  const [tooltip, setTooltip] = useState<{ text: string; left: number; top: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const { summaryLine, tooltipText } = useMemo(() => {
    if (missing.length === 0) {
      return { summaryLine: '', tooltipText: '' };
    }
    const n = missing.length;
    const detailJoined = missing.map(formatMissingCredential).join('; ');
    const summaryLine = `This agent requires workspace credentials. Outstanding requirements: ${detailJoined}. Add ${
      n === 1 ? 'the missing credential' : 'the missing credentials'
    } using the chat context selector.`;
    const tooltipText = [
      'This agent requires workspace credentials that are not yet present in chat context.',
      '',
      n === 1 ? 'Outstanding requirement:' : `Outstanding requirements (${n}):`,
      ...missing.map(m => `• ${formatMissingCredential(m)}`),
      '',
      'Use the chat context selector to add the missing credential(s).',
    ].join('\n');
    return { summaryLine, tooltipText };
  }, [missing]);

  if (missing.length === 0) return null;

  return (
    <>
      <div
        ref={barRef}
        className={cn(
          'flex min-h-0 min-w-0 items-center gap-1.5 border-b px-3 py-1',
          isLight ? 'border-gray-200 bg-amber-50 text-amber-950' : 'border-gray-700/60 bg-[#0D1117] text-amber-200/85',
          className,
        )}
        role="status">
        <WarningIcon className={isLight ? 'text-amber-600' : 'text-amber-600/65'} />
        <div className="min-w-0 flex-1 overflow-hidden">
          <span
            className="block truncate text-[10px] leading-tight"
            onMouseEnter={e => {
              const el = e.currentTarget;
              try {
                const isTruncated = el.scrollWidth - el.clientWidth > 1;
                if (!isTruncated) {
                  setTooltip(null);
                  return;
                }
                const r = el.getBoundingClientRect();
                const barTop = barRef.current?.getBoundingClientRect().top ?? r.top;
                setTooltip({
                  text: tooltipText,
                  left: r.left + r.width / 2,
                  /** Top edge of warning bar; tooltip opens upward from here. */
                  top: barTop,
                });
              } catch {
                /* noop */
              }
            }}
            onMouseLeave={() => setTooltip(null)}>
            {summaryLine}
          </span>
        </div>
      </div>
      {tooltip &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              left: tooltip.left,
              top: tooltip.top - 6,
              transform: 'translate(-50%, -100%)',
              zIndex: 100000,
              pointerEvents: 'none',
            }}>
            <div
              className={cn(
                'flex max-w-[min(520px,90vw)] gap-2 rounded-md px-2.5 py-2 text-[11px] shadow-lg',
                isLight ? 'bg-amber-50 text-amber-950' : 'border border-gray-700/60 bg-[#0D1117] text-amber-200/90',
              )}
              role="tooltip">
              <WarningIcon
                className={cn('mt-0.5 h-4 w-4 flex-shrink-0', isLight ? 'text-amber-600' : 'text-amber-600/65')}
              />
              <div className="min-w-0 flex-1 leading-snug whitespace-pre-wrap">{tooltip.text}</div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
