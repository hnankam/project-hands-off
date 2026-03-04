import * as React from 'react';

interface IconProps {
  className?: string;
  size?: number;
}

export const ShieldIcon: React.FC<IconProps> = ({ className = '', size = 14 }) => (
  <svg
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

export default ShieldIcon;

