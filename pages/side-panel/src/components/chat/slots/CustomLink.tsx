/**
 * Custom Link Component for Streamdown
 * 
 * Renders links with chip-style appearance matching the editor
 */
import React from 'react';

interface CustomLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string;
  children?: React.ReactNode;
}

/**
 * CustomLinkWrapper - Renders links with chip-style appearance
 * Used by Streamdown to render markdown links and auto-detected URLs
 */
export const CustomLinkWrapper: React.FC<CustomLinkProps> = ({ href, children, ...props }) => {
  return (
    <a 
      href={href} 
      target="_blank" 
      rel="noopener noreferrer" 
      className="editor-link-style"
      {...props}
    >
      {children}
    </a>
  );
};

export default CustomLinkWrapper;

