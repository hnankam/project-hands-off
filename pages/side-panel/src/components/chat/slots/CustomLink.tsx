/**
 * Custom Link Component for Streamdown
 * 
 * Renders links with chip-style appearance matching the editor
 */
import React from 'react';
import { cn } from '@extension/ui';

interface CustomLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string;
  children?: React.ReactNode;
}

/**
 * CustomLinkWrapper - Renders links with chip-style appearance
 * Used by Streamdown to render markdown links and auto-detected URLs
 * 
 * Note: Email addresses (mailto: links) are rendered as inline code with blue text
 * to prevent unwanted autolinking while maintaining visual distinction.
 */
export const CustomLinkWrapper: React.FC<CustomLinkProps> = ({ href, children, ...props }) => {
  // If this is a mailto: link (auto-detected email), render as inline code with blue text
  if (href && href.startsWith('mailto:')) {
    return (
      <code
        className={cn('email-code-text')}
        style={{
          fontSize: 'inherit',
          fontFamily: 'inherit',
        }}
      >
        {children}
      </code>
    );
  }
  
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

