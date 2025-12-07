import { useEffect, RefObject } from 'react';

/**
 * Hook to detect clicks outside of a referenced element
 * Commonly used for closing dropdowns, modals, etc.
 * 
 * @param ref - Reference to the element to detect clicks outside of
 * @param handler - Callback function to execute when clicking outside
 * @param isActive - Whether the hook should be active (default: true)
 * 
 * @example
 * ```tsx
 * const dropdownRef = useRef<HTMLDivElement>(null);
 * const [isOpen, setIsOpen] = useState(false);
 * 
 * useClickOutside(dropdownRef, () => setIsOpen(false), isOpen);
 * ```
 */
export function useClickOutside(
  ref: RefObject<HTMLElement>,
  handler: () => void,
  isActive: boolean = true
): void {
  useEffect(() => {
    if (!isActive) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        handler();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, handler, isActive]);
}

export default useClickOutside;

