/**
 * PageHeader
 *
 * A reusable header component for pages with consistent styling.
 */

import * as React from 'react';
import { cn } from '@extension/ui';

export interface PageHeaderProps {
  /** Page title */
  title: string;
  /** Light/dark theme */
  isLight: boolean;
  /** Left side content (before title) */
  leftContent?: React.ReactNode;
  /** Right side content (actions, menus) */
  rightContent?: React.ReactNode;
  /** Additional className */
  className?: string;
  /** Whether to show bottom border */
  showBorder?: boolean;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  isLight,
  leftContent,
  rightContent,
  className,
  showBorder = true,
}) => {
  const mainTextColor = isLight ? 'text-gray-700' : 'text-[#bcc1c7]';

  return (
    <div
      className={cn(
        // Fixed height (not em padding) so web vs extension match — py-[0.4em] scaled with inherited font-size.
        'flex h-[37px] min-h-[37px] flex-shrink-0 items-center justify-between px-2',
        isLight ? 'bg-gray-50' : 'bg-[#151C24]',
        showBorder && (isLight ? 'border-b border-gray-200' : 'border-b border-gray-700'),
        className,
      )}>
      <div className="flex min-w-0 flex-1 items-center">
        {leftContent}
        <h1 className={cn('truncate text-sm font-semibold', !leftContent && 'px-1', mainTextColor)}>{title}</h1>
      </div>

      {rightContent && <div className="flex flex-shrink-0 items-center gap-1">{rightContent}</div>}
    </div>
  );
};

export default PageHeader;
