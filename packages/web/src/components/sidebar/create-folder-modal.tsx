/** Modal dialog for creating a new folder */

import { useState, useEffect, useRef } from 'react'
import { FolderPlus, X } from 'lucide-react'
import { useAppStore } from '../../stores/app-store'
import { cn } from '../../lib/utils'

interface CreateFolderModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (name: string) => void
  parentName?: string
}

export function CreateFolderModal({ open, onClose, onSubmit, parentName }: CreateFolderModalProps) {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { theme } = useAppStore()
  const isDark = theme === 'dark'

  useEffect(() => {
    if (open) {
      setName('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit(name.trim())
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className={cn(
          'relative w-full max-w-sm overflow-hidden rounded-2xl border shadow-2xl',
          isDark ? 'border-white/[0.08] bg-surface-2' : 'border-neutral-200 bg-white',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={cn('flex items-center justify-between px-5 py-4 border-b', isDark ? 'border-white/[0.06]' : 'border-neutral-200')}>
          <div className="flex items-center gap-2">
            <FolderPlus className="h-4 w-4 text-brand-400" />
            <h2 className={cn('text-sm font-semibold', isDark ? 'text-neutral-100' : 'text-neutral-900')}>
              {parentName ? `New subfolder in "${parentName}"` : 'New folder'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className={cn('cursor-pointer rounded-md p-1', isDark ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-400 hover:text-neutral-600')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className={cn('block text-xs font-medium mb-1.5', isDark ? 'text-neutral-400' : 'text-neutral-500')}>
              Folder name
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Engineering, Product..."
              className={cn(
                'w-full rounded-lg border px-3 py-2 text-sm outline-none',
                isDark
                  ? 'border-white/[0.06] bg-surface-3 text-neutral-100 placeholder-neutral-500 focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/30'
                  : 'border-neutral-200 bg-neutral-50 text-neutral-900 placeholder-neutral-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30',
              )}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium',
                isDark ? 'text-neutral-400 hover:bg-surface-3' : 'text-neutral-500 hover:bg-neutral-100',
              )}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="cursor-pointer rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              Create folder
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
