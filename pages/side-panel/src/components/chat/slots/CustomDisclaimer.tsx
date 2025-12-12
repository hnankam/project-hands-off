/**
 * Custom Disclaimer Component for CopilotKit V2
 * 
 * Displays a disclaimer text (e.g., "AI can make mistakes") below the input.
 */
import React from 'react';

export interface CustomDisclaimerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Custom disclaimer text. If not provided, uses default. */
  disclaimerText?: string;
}

/** Default disclaimer text */
const DEFAULT_DISCLAIMER_TEXT = "AI can make mistakes. Please verify important information";

/**
 * CustomDisclaimer - Disclaimer text below chat input
 * 
 * Styling defined in: chat-input-footer.v2.css (.chat-disclaimer)
 * - Centered text
 * - Extra small font (10px) with !important to override container rules
 * - Muted color
 * - Reduced padding for smaller container height
 */
export const CustomDisclaimer: React.FC<CustomDisclaimerProps> = ({ 
  className = '',
  disclaimerText = DEFAULT_DISCLAIMER_TEXT,
  children,
  ...props 
}) => {
  return (
    <div
      className={`chat-disclaimer ${className}`.trim()}
      {...props}
    >
      {children || disclaimerText}
    </div>
  );
};

export default CustomDisclaimer;
