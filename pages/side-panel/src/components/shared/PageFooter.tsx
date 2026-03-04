/**
 * PageFooter
 * 
 * A reusable footer component for pages with version display and actions.
 */

import * as React from 'react';
import { cn } from '@extension/ui';

export interface PageFooterProps {
  /** Current version string */
  version: string;
  /** Light/dark theme */
  isLight: boolean;
  /** Right side content (buttons, menus) */
  rightContent?: React.ReactNode;
  /** Additional className */
  className?: string;
}

export const PageFooter: React.FC<PageFooterProps> = ({
  version,
  isLight,
  rightContent,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex-shrink-0 border-t',
        isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
        className,
      )}
    >
      <div className="flex items-center justify-between px-4 py-1.5">
        <div className={cn('text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
          v {version}
        </div>
        {rightContent && (
          <div className="flex items-center gap-1">
            {rightContent}
          </div>
        )}
      </div>
    </div>
  );
};

export default PageFooter;

