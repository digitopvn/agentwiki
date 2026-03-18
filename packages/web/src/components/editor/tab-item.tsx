/** Single tab with title, close button, and dirty indicator */

import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAppStore, type Tab } from '../../stores/app-store'

interface TabItemProps {
  tab: Tab
  isActive: boolean
}

export function TabItem({ tab, isActive }: TabItemProps) {
  const { setActiveTab, closeTab } = useAppStore()

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation()
    closeTab(tab.id)
  }

  return (
    <div
      onClick={() => setActiveTab(tab.id)}
      className={cn(
        'group flex h-full max-w-[200px] min-w-[100px] cursor-pointer items-center gap-1.5 border-r border-neutral-800 px-3 text-xs select-none',
        isActive
          ? 'bg-neutral-950 text-neutral-100'
          : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-850 hover:text-neutral-200',
      )}
    >
      {/* Dirty indicator */}
      {tab.isDirty && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" title="Unsaved changes" />
      )}

      {/* Title */}
      <span className="flex-1 truncate">{tab.title || 'Untitled'}</span>

      {/* Close button */}
      <button
        onClick={handleClose}
        className={cn(
          'shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100',
          isActive && 'opacity-60 hover:opacity-100',
          'hover:bg-neutral-700 hover:text-neutral-100',
        )}
        title="Close tab"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
