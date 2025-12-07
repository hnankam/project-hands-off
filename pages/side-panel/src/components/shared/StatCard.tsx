/**
 * StatCard
 * 
 * A reusable statistics card component for dashboards.
 */

import React from 'react';
import { cn } from '@extension/ui';

export type StatCardIcon = 'activity' | 'sparkles' | 'stack' | 'team' | 'chart' | 'clock';

export interface StatCardProps {
  /** Card label/title */
  label: string;
  /** Main value to display */
  value: string | number;
  /** Description text below the value */
  description?: string;
  /** Icon to display */
  icon?: StatCardIcon;
  /** Custom icon element (overrides icon prop) */
  customIcon?: React.ReactNode;
  /** Light/dark theme */
  isLight: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Additional className */
  className?: string;
}

const getIconColor = (icon: StatCardIcon, isLight: boolean): string => {
  switch (icon) {
    case 'sparkles':
      return isLight ? 'text-blue-500' : 'text-blue-300';
    case 'activity':
      return isLight ? 'text-emerald-500' : 'text-emerald-300';
    case 'stack':
      return isLight ? 'text-violet-500' : 'text-violet-300';
    case 'team':
      return isLight ? 'text-amber-500' : 'text-amber-300';
    case 'chart':
      return isLight ? 'text-pink-500' : 'text-pink-300';
    case 'clock':
      return isLight ? 'text-cyan-500' : 'text-cyan-300';
    default:
      return isLight ? 'text-gray-500' : 'text-gray-400';
  }
};

const IconComponent: React.FC<{ icon: StatCardIcon; isLight: boolean }> = ({ icon, isLight }) => {
  const baseClasses = cn('w-5 h-5 flex-shrink-0', getIconColor(icon, isLight));

  switch (icon) {
    case 'activity':
      return (
        <svg className={baseClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M3 12h4l3 8 4-16 3 8h4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'sparkles':
      return (
        <svg className={baseClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.364 6.364l-2.121-2.121M6.757 6.757 4.636 4.636m0 14.728 2.121-2.121m12.728-12.728-2.121 2.121" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'stack':
      return (
        <svg className={baseClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M12 3l9 4.5-9 4.5-9-4.5L12 3z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21 12l-9 4.5L3 12" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21 16.5l-9 4.5-9-4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'team':
      return (
        <svg className={baseClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    case 'chart':
      return (
        <svg className={baseClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M3 3v18h18M9 17V9m4 8V5m4 12v-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'clock':
      return (
        <svg className={baseClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
};

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  description,
  icon,
  customIcon,
  isLight,
  onClick,
  className,
}) => {
  const mainTextColor = isLight ? 'text-gray-700' : 'text-[#bcc1c7]';

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors',
        isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
        onClick && 'cursor-pointer hover:border-blue-500/50',
        className,
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-center justify-between mb-2">
        <div
          className={cn(
            'text-[11px] font-semibold uppercase tracking-wide',
            isLight ? 'text-gray-500' : 'text-gray-400',
          )}
        >
          {label}
        </div>
        {customIcon || (icon && <IconComponent icon={icon} isLight={isLight} />)}
      </div>
      <div className={cn('text-2xl font-semibold', mainTextColor)}>
        {value}
      </div>
      {description && (
        <div className={cn('mt-1 text-xs leading-snug', isLight ? 'text-gray-600' : 'text-gray-400')}>
          {description}
        </div>
      )}
    </div>
  );
};

export default StatCard;

