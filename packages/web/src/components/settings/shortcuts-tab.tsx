/** Shortcuts tab — display and rebind keyboard shortcuts */

import { useState, useEffect, useCallback } from 'react'
import { RotateCcw, Pencil } from 'lucide-react'
import {
  getActiveShortcuts,
  setCustomShortcut,
  resetCustomShortcut,
  resetAllShortcuts,
  formatKeyCombo,
} from '../../lib/shortcut-defaults'
import { cn } from '../../lib/utils'

type ActiveShortcut = ReturnType<typeof getActiveShortcuts>[number]

/** Captures a key combo while active — calls onCapture with result or '' to cancel */
function useKeyCapture(onCapture: (combo: string) => void, active: boolean) {
  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const parts: string[] = []
      if (e.ctrlKey || e.metaKey) parts.push('ctrl')
      if (e.shiftKey) parts.push('shift')
      if (e.altKey) parts.push('alt')

      const key = e.key.toLowerCase()
      if (['control', 'shift', 'alt', 'meta'].includes(key)) return

      // Bare Escape = cancel
      if (key === 'escape' && parts.length === 0) {
        onCapture('')
        return
      }

      parts.push(key)
      onCapture(parts.join('+'))
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [active, onCapture])
}

export function ShortcutsTab({ isDark }: { isDark: boolean }) {
  const [shortcuts, setShortcuts] = useState<ActiveShortcut[]>(() => getActiveShortcuts())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingCombo, setPendingCombo] = useState<string>('')

  const handleCapture = useCallback((combo: string) => {
    if (!combo) {
      setEditingId(null)
      setPendingCombo('')
      return
    }
    setPendingCombo(combo)
  }, [])

  useKeyCapture(handleCapture, editingId !== null)

  function saveBinding(id: string) {
    if (!pendingCombo) return
    setCustomShortcut(id, pendingCombo)
    setShortcuts(getActiveShortcuts())
    setEditingId(null)
    setPendingCombo('')
  }

  function cancelEdit() {
    setEditingId(null)
    setPendingCombo('')
  }

  function handleReset(id: string) {
    resetCustomShortcut(id)
    setShortcuts(getActiveShortcuts())
  }

  function handleResetAll() {
    resetAllShortcuts()
    setShortcuts(getActiveShortcuts())
  }

  const hasAnyCustom = shortcuts.some((s) => s.isCustom)

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className={cn('text-sm font-semibold', isDark ? 'text-neutral-200' : 'text-neutral-800')}>Keyboard Shortcuts</h2>
          <p className={cn('text-xs mt-1', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
            Click the pencil to rebind. Press the new key combo, then Save.
          </p>
        </div>
        {hasAnyCustom && (
          <button
            onClick={handleResetAll}
            className={cn('cursor-pointer flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs', isDark ? 'text-neutral-400 hover:bg-surface-2' : 'text-neutral-500 hover:bg-neutral-100')}
          >
            <RotateCcw className="h-3 w-3" />
            Reset all
          </button>
        )}
      </div>

      <div className={cn('rounded-lg border overflow-hidden', isDark ? 'border-white/[0.06]' : 'border-neutral-200')}>
        {shortcuts.map((s, idx) => {
          const isEditing = editingId === s.id
          return (
            <div
              key={s.id}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 text-xs',
                idx > 0 ? (isDark ? 'border-t border-white/[0.04]' : 'border-t border-neutral-100') : '',
                isDark ? 'bg-surface-1' : 'bg-white',
              )}
            >
              {/* Action label */}
              <span className={cn('flex-1', isDark ? 'text-neutral-300' : 'text-neutral-700')}>
                {s.label}
                {s.isCustom && !isEditing && (
                  <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-brand-500 align-middle" title="Custom binding" />
                )}
              </span>

              {/* Editing state: capture + save/cancel */}
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'rounded border px-2 py-1 font-mono text-[11px] min-w-[7rem] text-center',
                    isDark ? 'border-brand-500/50 bg-surface-2 text-neutral-200' : 'border-brand-400/50 bg-neutral-50 text-neutral-700',
                  )}>
                    {pendingCombo ? formatKeyCombo(pendingCombo) : 'Press keys…'}
                  </span>
                  <button
                    onClick={() => saveBinding(s.id)}
                    disabled={!pendingCombo}
                    className="cursor-pointer rounded px-2 py-1 text-[11px] font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className={cn('cursor-pointer rounded px-2 py-1 text-[11px]', isDark ? 'text-neutral-400 hover:bg-surface-2' : 'text-neutral-500 hover:bg-neutral-100')}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                // Display state: key badge + edit + optional reset
                <div className="flex items-center gap-2">
                  <kbd className={cn(
                    'rounded border px-2 py-1 font-mono text-[11px]',
                    isDark ? 'border-white/[0.08] bg-surface-2 text-neutral-300' : 'border-neutral-200 bg-neutral-50 text-neutral-600',
                  )}>
                    {formatKeyCombo(s.activeKeys)}
                  </kbd>
                  <button
                    onClick={() => { setEditingId(s.id); setPendingCombo('') }}
                    className={cn('cursor-pointer rounded p-1', isDark ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-400 hover:text-neutral-600')}
                    aria-label={`Edit shortcut for ${s.label}`}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  {s.isCustom && (
                    <button
                      onClick={() => handleReset(s.id)}
                      className={cn('cursor-pointer rounded p-1', isDark ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-400 hover:text-neutral-600')}
                      aria-label={`Reset ${s.label} to default`}
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
