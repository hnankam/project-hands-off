/**
 * ThinkingBlockWrapper - Wrapper for ThinkingBlock to detect completion state
 * 
 * This wrapper detects whether content is streaming or static:
 * - On initial mount: If content doesn't change within 200ms, it's considered complete (not streaming)
 * - During streaming: Monitors content changes and uses a debounce mechanism (300ms) to detect completion
 * 
 * This ensures "Thought" is shown for static content (e.g., after page reload) and
 * "Thinking..." transitions to "Thought" only when streaming actually completes.
 */
import React, { useState, useEffect, useRef } from 'react';
import { ThinkingBlock } from './ThinkingBlock';

interface ThinkingBlockWrapperProps {
  children?: React.ReactNode;
  instanceId?: string;
}

/**
 * Wrapper component that detects when content stops changing
 * and passes isComplete prop to ThinkingBlock
 */
export const ThinkingBlockWrapper: React.FC<ThinkingBlockWrapperProps> = ({
  children,
  instanceId,
}) => {
  const [isComplete, setIsComplete] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevChildrenRef = useRef<React.ReactNode>(children);
  const initialCheckDoneRef = useRef(false);

  // Convert children to string for comparison
  const childrenString = typeof children === 'string' 
    ? children 
    : JSON.stringify(children);

  // Initial check on mount - if content doesn't change within 200ms, consider it complete (not streaming)
  useEffect(() => {
    if (!initialCheckDoneRef.current) {
      const initialTimer = setTimeout(() => {
        // If we reach here and content hasn't triggered any changes, it's static/complete
        if (!isComplete) {
          setIsComplete(true);
        }
        initialCheckDoneRef.current = true;
      }, 200);

      return () => {
        clearTimeout(initialTimer);
      };
    }
  }, []); // Only run on mount

  // Detect when content stops changing (for streaming content)
  useEffect(() => {
    const prevString = typeof prevChildrenRef.current === 'string'
      ? prevChildrenRef.current
      : JSON.stringify(prevChildrenRef.current);

    // If content has changed, reset completion state and start debounce timer
    if (childrenString !== prevString) {
      prevChildrenRef.current = children;
      setIsComplete(false);
      initialCheckDoneRef.current = true; // Mark that we've detected streaming

      // Clear existing timer
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timer - if content doesn't change for 300ms, consider it complete
      timeoutRef.current = setTimeout(() => {
        setIsComplete(true);
        timeoutRef.current = null;
      }, 300);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [childrenString, children]);

  // Generate a unique instance ID if not provided
  const finalInstanceId = instanceId || `thinking-wrapper-${Date.now()}`;

  return (
    <ThinkingBlock isComplete={isComplete} instanceId={finalInstanceId}>
      {children}
    </ThinkingBlock>
  );
};

export default ThinkingBlockWrapper;

