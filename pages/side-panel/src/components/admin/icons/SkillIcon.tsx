import * as React from 'react';

interface IconProps {
  className?: string;
  size?: number;
}

export const SkillIcon: React.FC<IconProps> = ({ className = '', size = 14 }) => (
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
    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    <path d="M8 7h8" />
    <path d="M8 11h6" />
  </svg>
);

export default SkillIcon;
