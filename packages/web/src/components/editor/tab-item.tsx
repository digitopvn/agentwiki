/** Single tab with title, close button, and dirty indicator */

import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAppStore, type Tab } from '../../stores/app-store'

interface TabItemProps {
  tab: Tab
  isActive: boolean
}

export function TabItem({ tab, isActive }: TabItemProps) {
  const { setActiveTab, closeTab, openTabs, theme } = useAppStore()
  const navigate = useNavigate()
  const isDark = theme === 'dark'

  const handleClick = () => {
    setActiveTab(tab.id)
    // Navigate to this doc's URL (use documentId as fallback slug)
    navigate(`/doc/${tab.documentId}`)
  }

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation()
    const idx = openTabs.findIndex((t) => t.id === tab.id)
    const wasActive = isActive
    closeTab(tab.id)

    if (wasActive) {
      const remaining = openTabs.filter((t) => t.id !== tab.id)
      if (remaining.length === 0) {
        navigate('/')
      } else {
        const nextTab = idx > 0 ? remaining[idx - 1] : remaining[0]
        navigate(`/doc/${nextTab.documentId}`)
      }
    }
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        'group flex h-full max-w-[200px] min-w-[100px] cursor-pointer items-center gap-1.5 border-r px-3 text-xs select-none',
        isDark ? 'border-white/[0.04]' : 'border-neutral-200',
        isActive
          ? isDark
            ? 'bg-surface-0 text-neutral-100'
            : 'bg-white text-neutral-900'
          : isDark
            ? 'text-neutral-500 hover:bg-surface-2 hover:text-neutral-300'
            : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700',
      )}
    >
      {/* Dirty indicator */}
      {tab.isDirty && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" title="Unsaved changes" />
      )}

      {/* Title */}
      <span className="flex-1 truncate">{tab.title || 'Untitled'}</span>

      {/* Close button */}
      <button
        onClick={handleClose}
        className={cn(
          'shrink-0 cursor-pointer rounded-md p-0.5 opacity-0 group-hover:opacity-100',
          isActive && 'opacity-60 hover:opacity-100',
          isDark ? 'hover:bg-surface-3 hover:text-neutral-200' : 'hover:bg-neutral-200 hover:text-neutral-700',
        )}
        title="Close tab"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
