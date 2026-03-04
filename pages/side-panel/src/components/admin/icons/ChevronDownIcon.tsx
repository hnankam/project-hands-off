import * as React from 'react';
import { cn } from '@extension/ui';

interface ChevronDownIconProps {
  className?: string;
  size?: number;
  isOpen?: boolean;
}

export const ChevronDownIcon: React.FC<ChevronDownIconProps> = ({
  className = '',
  size = 12,
  isOpen = false,
}) => (
  <svg
    className={cn('transition-transform', isOpen && 'rotate-180', className)}
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M19 9l-7 7-7-7" />
  </svg>
);

export default ChevronDownIcon;

