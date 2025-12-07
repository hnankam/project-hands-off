import { useState, useEffect, RefObject } from 'react';

export type DropdownPosition = 'up' | 'down';

/**
 * Hook to calculate optimal dropdown position based on available viewport space
 * Prevents dropdowns from being cut off at the bottom of the screen
 * 
 * @param buttonRef - Reference to the button/trigger element
 * @param isOpen - Whether the dropdown is currently open
 * @param dropdownHeight - Approximate height of the dropdown (default: 240px)
 * @returns Position to open the dropdown ('up' or 'down')
 * 
 * @example
 * ```tsx
 * const buttonRef = useRef<HTMLButtonElement>(null);
 * const [isOpen, setIsOpen] = useState(false);
 * const position = useDropdownPosition(buttonRef, isOpen);
 * 
 * // Use in className:
 * // position === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
 * ```
 */
export function useDropdownPosition(
  buttonRef: RefObject<HTMLElement>,
  isOpen: boolean,
  dropdownHeight: number = 240
): DropdownPosition {
  const [position, setPosition] = useState<DropdownPosition>('down');

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - buttonRect.bottom;
      const spaceAbove = buttonRect.top;

      // Open upward if there's not enough space below and more space above
      setPosition(spaceBelow < dropdownHeight && spaceAbove > spaceBelow ? 'up' : 'down');
    }
  }, [isOpen, dropdownHeight]);

  return position;
}

export default useDropdownPosition;

