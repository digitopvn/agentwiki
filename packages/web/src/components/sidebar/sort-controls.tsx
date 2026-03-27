/** Sort mode controls for sidebar folder tree */

import { GripVertical, ArrowUpAZ, Clock, ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../stores/app-store'

type SortMode = 'manual' | 'name' | 'date'
type SortDirection = 'asc' | 'desc'

interface SortControlsProps {
  mode: SortMode
  direction: SortDirection
  onChange: (mode: SortMode, direction: SortDirection) => void
}

const MODES: { key: SortMode; icon: typeof GripVertical; label: string }[] = [
  { key: 'manual', icon: GripVertical, label: 'Manual' },
  { key: 'name', icon: ArrowUpAZ, label: 'Name' },
  { key: 'date', icon: Clock, label: 'Date' },
]

export function SortControls({ mode, direction, onChange }: SortControlsProps) {
  const isDark = useAppStore((s) => s.theme === 'dark')

  const handleModeClick = (key: SortMode) => {
    if (key === mode) return
    // Default directions: name=asc, date=desc, manual=asc
    const defaultDir = key === 'date' ? 'desc' : 'asc'
    onChange(key, defaultDir)
  }

  const toggleDirection = () => {
    onChange(mode, direction === 'asc' ? 'desc' : 'asc')
  }

  return (
    <div className={cn('flex items-center gap-0.5 px-2 py-1', isDark ? 'border-white/[0.06]' : 'border-neutral-200')}>
      {MODES.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          onClick={() => handleModeClick(key)}
          title={label}
          className={cn(
            'flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] transition-colors',
            mode === key
              ? 'bg-brand-600 text-white'
              : isDark
                ? 'text-neutral-500 hover:bg-surface-3 hover:text-neutral-300'
                : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700',
          )}
        >
          <Icon className="h-3 w-3" />
          <span className="hidden md:inline">{label}</span>
        </button>
      ))}

      {/* ASC/DESC toggle — only for name and date modes */}
      {mode !== 'manual' && (
        <button
          onClick={toggleDirection}
          title={direction === 'asc' ? 'Ascending' : 'Descending'}
          className={cn(
            'ml-auto rounded-md p-1 transition-colors',
            isDark
              ? 'text-neutral-500 hover:bg-surface-3 hover:text-neutral-300'
              : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700',
          )}
        >
          {direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        </button>
      )}
    </div>
  )
}
