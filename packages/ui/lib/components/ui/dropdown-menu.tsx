import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "../../utils"

interface DropdownMenuProps {
  children: React.ReactNode
  trigger: React.ReactNode
  className?: string
  align?: 'left' | 'right'
  isLight?: boolean
}

export const DropdownMenu = ({ children, trigger, className, align = 'left', isLight = true }: DropdownMenuProps) => {
  const [isOpen, setIsOpen] = React.useState(false)
  const [position, setPosition] = React.useState({ top: 0, left: 0, right: 0 })
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
      if (isOpen && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        setPosition({
          top: rect.bottom + 4,
          left: rect.left,
          right: window.innerWidth - rect.right
        })
      }
    }

    if (isOpen) {
      updatePosition()
      window.addEventListener('scroll', updatePosition, true)
      window.addEventListener('resize', updatePosition)
      return () => {
        window.removeEventListener('scroll', updatePosition, true)
        window.removeEventListener('resize', updatePosition)
      }
    }
    return undefined
  }, [isOpen])

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
            "dropdown-menu-content w-48 rounded-md border shadow-lg overflow-hidden",
            isLight
              ? "border-gray-200 bg-gray-50"
              : "border-gray-700 bg-[#151C24]"
          )}
          style={{
            position: 'absolute',
            top: `${position.top}px`,
            [align === 'right' ? 'right' : 'left']: align === 'right' ? `${position.right}px` : `${position.left}px`,
            pointerEvents: 'auto'
          }}
        >
          <div className="py-1">
            {React.Children.map(children, child => {
              if (React.isValidElement(child)) {
                return React.cloneElement(child, { isLight } as any)
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

interface DropdownMenuItemProps {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  shortcut?: string
  isLight?: boolean
}

export const DropdownMenuItem = ({ children, onClick, className, shortcut, isLight = true }: DropdownMenuItemProps) => {
  return (
    <button
      className={cn(
        "flex w-full items-center justify-between px-3 py-2 text-xs font-medium transition-colors text-left",
        isLight
          ? "text-gray-700 hover:bg-gray-100"
          : "text-gray-200 hover:bg-gray-700/50",
        className
      )}
      onClick={onClick}
    >
      <span>{children}</span>
      {shortcut && (
        <span className={cn(
          "text-[10px] ml-4 font-medium opacity-75",
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
      "border-t my-1",
      isLight ? "border-gray-200" : "border-gray-700",
      className
    )} />
  )
}
