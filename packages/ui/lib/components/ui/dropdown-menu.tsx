import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "../../utils"

interface DropdownMenuProps {
  children: React.ReactNode
  trigger: React.ReactNode
  className?: string
  align?: 'left' | 'right'
  direction?: 'up' | 'down' | 'auto'
  isLight?: boolean
}

const DropdownMenuContext = React.createContext<{ isLight: boolean; portalContainer: HTMLElement | null; closeMenu: () => void }>({ isLight: true, portalContainer: null, closeMenu: () => {} })

export const DropdownMenu = ({ children, trigger, className, align = 'left', direction = 'auto', isLight = true }: DropdownMenuProps) => {
  const [isOpen, setIsOpen] = React.useState(false)
  const [position, setPosition] = React.useState({ top: 0, bottom: 0, left: 0, right: 0 })
  const [openUpward, setOpenUpward] = React.useState(false)
  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLDivElement>(null)
  const [portalContainer, setPortalContainer] = React.useState<HTMLElement | null>(null)

  // Create or get portal container
  React.useEffect(() => {
    let container = document.getElementById('dropdown-portal-container')
    if (!container) {
      container = document.createElement('div')
      container.id = 'dropdown-portal-container'
      container.style.position = 'fixed'
      container.style.top = '0'
      container.style.left = '0'
      container.style.width = '100%'
      container.style.height = '100%'
      container.style.pointerEvents = 'none'
      container.style.zIndex = '10000'
      document.body.appendChild(container)
    }
    setPortalContainer(container)
  }, [])

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
    return undefined
  }, [isOpen])

  React.useEffect(() => {
    const updatePosition = () => {
      if (isOpen && triggerRef.current && dropdownRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        const dropdownHeight = dropdownRef.current.offsetHeight || 200 // fallback height
        const spaceBelow = window.innerHeight - rect.bottom
        const spaceAbove = rect.top
        
        // Determine if should open upward based on direction prop
        let shouldOpenUpward = false
        if (direction === 'up') {
          shouldOpenUpward = true
        } else if (direction === 'down') {
          shouldOpenUpward = false
        } else {
          // Auto mode: open upward if there's not enough space below but enough space above
          shouldOpenUpward = spaceBelow < dropdownHeight && spaceAbove > dropdownHeight
        }
        
        setOpenUpward(shouldOpenUpward)
        setPosition({
          top: rect.bottom + 4,
          bottom: window.innerHeight - rect.top + 4,
          left: rect.left,
          right: window.innerWidth - rect.right
        })
      }
    }

    if (isOpen) {
      // Small delay to allow dropdown to render and get accurate height
      setTimeout(updatePosition, 0)
      window.addEventListener('scroll', updatePosition, true)
      window.addEventListener('resize', updatePosition)
      return () => {
        window.removeEventListener('scroll', updatePosition, true)
        window.removeEventListener('resize', updatePosition)
      }
    }
    return undefined
  }, [isOpen, direction])

  const handleToggle = () => {
    setIsOpen(!isOpen)
  }

  return (
    <div className={cn("relative", className)} ref={triggerRef}>
      <div onClick={handleToggle}>
        {trigger}
      </div>
      {isOpen && portalContainer && createPortal(
        <div 
          ref={dropdownRef}
          className={cn(
            "dropdown-menu-content w-52 rounded-md border shadow-lg overflow-hidden",
            isLight
              ? "border-gray-200 bg-gray-50"
              : "border-gray-700 bg-[#151C24]"
          )}
          style={{
            position: 'absolute',
            ...(openUpward ? { bottom: `${position.bottom}px` } : { top: `${position.top}px` }),
            [align === 'right' ? 'right' : 'left']: align === 'right' ? `${position.right}px` : `${position.left}px`,
            pointerEvents: 'auto',
            animation: openUpward 
              ? 'dropdownSlideUp 150ms cubic-bezier(0.16, 1, 0.3, 1)' 
              : 'dropdownSlideDown 150ms cubic-bezier(0.16, 1, 0.3, 1)',
            transformOrigin: openUpward ? 'bottom' : 'top'
          }}
        >
          <DropdownMenuContext.Provider value={{ isLight, portalContainer, closeMenu: () => setIsOpen(false) }}>
            <div className="py-0" onClick={() => setIsOpen(false)}>
              {React.Children.map(children, child => {
                if (React.isValidElement(child)) {
                  return React.cloneElement(child, { isLight } as any)
                }
                return child
              })}
            </div>
          </DropdownMenuContext.Provider>
        </div>,
        portalContainer
      )}
    </div>
  )
}

interface DropdownMenuItemProps {
  children: React.ReactNode
  onClick?: (e: React.MouseEvent) => void
  onMouseDown?: (e: React.MouseEvent) => void
  className?: string
  shortcut?: string
  isLight?: boolean
  disabled?: boolean
}

export const DropdownMenuItem = ({ children, onClick, onMouseDown, className, shortcut, isLight = true, disabled = false }: DropdownMenuItemProps) => {
  return (
    <button
      className={cn(
        "flex w-full items-center justify-between px-4 py-1.5 text-xs font-medium transition-colors text-left",
        disabled
          ? isLight
            ? "cursor-not-allowed text-gray-400 opacity-50"
            : "cursor-not-allowed text-gray-500 opacity-50"
          : isLight
            ? "hover:bg-gray-100"
            : "hover:bg-gray-700/50",
        className
      )}
      style={!disabled ? { color: isLight ? '#374151' : '#bcc1c7' } : undefined}
      onClick={disabled ? undefined : onClick}
      onMouseDown={disabled ? undefined : onMouseDown}
      disabled={disabled}
    >
      <span>{children}</span>
      {shortcut && (
        <span className={cn(
          "text-[10px] font-medium opacity-75",
          isLight ? "text-gray-500" : "text-gray-400"
        )}>{shortcut}</span>
      )}
    </button>
  )
}

interface DropdownMenuSeparatorProps {
  className?: string
  isLight?: boolean
}

export const DropdownMenuSeparator = ({ className, isLight = true }: DropdownMenuSeparatorProps) => {
  return (
    <div className={cn(
      "border-t my-0",
      isLight ? "border-gray-200" : "border-gray-700",
      className
    )} />
  )
}

interface DropdownSubmenuProps {
  label: string
  children: React.ReactNode
  align?: 'left' | 'right'
  isLight?: boolean
}

export const DropdownSubmenu = ({ label, children, align = 'right', isLight = true }: DropdownSubmenuProps) => {
  const { isLight: ctxLight, portalContainer, closeMenu } = React.useContext(DropdownMenuContext)
  const effectiveLight = isLight ?? ctxLight
  const [open, setOpen] = React.useState(false)
  const [pos, setPos] = React.useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const itemRef = React.useRef<HTMLDivElement>(null)

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!open && itemRef.current) {
      const r = itemRef.current.getBoundingClientRect()
      // Always open to the LEFT of the parent menu item
      const top = Math.max(4, Math.min(r.top, window.innerHeight - 4))
      const right = window.innerWidth - r.left + 4
      setPos({ top, right })
    }
    setOpen(prev => !prev)
  }

  const handleItemClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    closeMenu()
  }

  return (
    <div ref={itemRef} className="relative">
      <button
        className={cn(
          "flex w-full items-center justify-between px-4 py-1.5 text-xs font-medium transition-colors text-left",
          effectiveLight ? "hover:bg-gray-100" : "hover:bg-gray-700/50"
        )}
        style={{ color: effectiveLight ? '#374151' : '#bcc1c7' }}
        onClick={toggle}
      >
        <span>{label}</span>
        <span className={cn("ml-2", effectiveLight ? "text-gray-500" : "text-gray-400")}>◀</span>
      </button>
      {open && portalContainer && createPortal(
        <div
          className={cn(
            "dropdown-submenu-content w-52 rounded-md border shadow-lg overflow-hidden",
            effectiveLight ? "border-gray-200 bg-gray-50" : "border-gray-700 bg-[#151C24]"
          )}
          style={{ position: 'absolute', top: `${pos.top}px`, right: `${pos.right}px`, pointerEvents: 'auto' }}
          onClick={handleItemClick}
        >
          <div className="py-1">
            {React.Children.map(children, child => {
              if (React.isValidElement(child)) {
                return React.cloneElement(child, { isLight: effectiveLight } as any)
              }
              return child
            })}
          </div>
        </div>,
        portalContainer
      )}
    </div>
  )
}

interface DropdownAccordionProps {
  label: string
  children: React.ReactNode
  isLight?: boolean
}

export const DropdownAccordion = ({ label, children, isLight = true }: DropdownAccordionProps) => {
  const { isLight: ctxLight } = React.useContext(DropdownMenuContext)
  const effectiveLight = isLight ?? ctxLight
  const [isExpanded, setIsExpanded] = React.useState(false)

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsExpanded(prev => !prev)
  }

  return (
    <div>
      <button
        className={cn(
          "flex w-full items-center gap-0.5 px-4 py-1.5 text-xs font-medium transition-colors text-left",
          effectiveLight ? "hover:bg-gray-100" : "hover:bg-gray-700/50"
        )}
        style={{ color: effectiveLight ? '#374151' : '#bcc1c7' }}
        onClick={toggle}
      >
        {/* Chevron on the left */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            "flex-shrink-0 transition-transform duration-200",
            effectiveLight ? "text-gray-500" : "text-gray-400"
          )}
          style={{
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span>{label}</span>
      </button>
      {isExpanded && (
        <div className="ml-0">
          {React.Children.map(children, child => {
            if (React.isValidElement(child)) {
              return React.cloneElement(child, { isLight: effectiveLight } as any)
            }
            return child
          })}
        </div>
      )}
    </div>
  )
}
