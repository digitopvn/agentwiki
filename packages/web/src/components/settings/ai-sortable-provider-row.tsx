/** Sortable drag-and-drop row for a configured AI provider */

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, ChevronDown, ChevronUp } from 'lucide-react'
import type { AIProviderSetting } from '@agentwiki/shared'
import { cn } from '../../lib/utils'

interface SortableProviderRowProps {
  setting: AIProviderSetting
  providerName: string
  models: string[]
  isDark: boolean
  onSave: (apiKey: string, model: string, enabled: boolean) => void
  onDelete: () => void
  isSaving: boolean
}

export function SortableProviderRow({
  setting,
  providerName,
  models,
  isDark,
  onSave,
  onDelete,
  isSaving,
}: SortableProviderRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(setting.defaultModel || models[0])
  const [enabled, setEnabled] = useState(setting.isEnabled)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: setting.providerId,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const inputCls = cn(
    'mt-1 w-full rounded border px-2.5 py-1.5 text-xs outline-none',
    isDark
      ? 'border-white/[0.06] bg-surface-2 text-neutral-200 placeholder-neutral-600'
      : 'border-neutral-200 bg-neutral-50 text-neutral-800 placeholder-neutral-400',
  )

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-lg border',
        isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-white',
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          {...attributes}
          {...listeners}
          className={cn('cursor-grab touch-none', isDark ? 'text-neutral-600' : 'text-neutral-300')}
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <span className={cn('flex-1 text-xs font-medium', isDark ? 'text-neutral-200' : 'text-neutral-800')}>
          {providerName}
        </span>

        <span className={cn(
          'rounded-full px-2 py-0.5 text-[10px]',
          setting.isEnabled ? 'bg-green-500/10 text-green-400' : 'bg-neutral-500/10 text-neutral-400',
        )}>
          {setting.isEnabled ? 'Active' : 'Disabled'}
        </span>

        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-mono', isDark ? 'bg-surface-2 text-neutral-400' : 'bg-neutral-100 text-neutral-500')}>
          {setting.defaultModel}
        </span>

        <button
          onClick={() => setExpanded((v) => !v)}
          className={cn('cursor-pointer rounded p-0.5', isDark ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-400 hover:text-neutral-600')}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Expanded edit form */}
      {expanded && (
        <div className={cn('border-t px-3 py-3 space-y-3', isDark ? 'border-white/[0.06]' : 'border-neutral-100')}>
          <div>
            <label className={cn('text-[11px] font-medium', isDark ? 'text-neutral-400' : 'text-neutral-500')}>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="•••••••• (saved)"
              className={inputCls}
            />
          </div>
          <div>
            <label className={cn('text-[11px] font-medium', isDark ? 'text-neutral-400' : 'text-neutral-500')}>Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className={cn(inputCls, 'mt-1')}
            >
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded accent-brand-500"
            />
            <span className={cn('text-xs', isDark ? 'text-neutral-400' : 'text-neutral-500')}>Enabled</span>
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => { onSave(apiKey || '__unchanged__', model, enabled); setApiKey(''); setExpanded(false) }}
              disabled={isSaving}
              className="flex-1 cursor-pointer rounded px-3 py-1.5 text-xs font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => { if (window.confirm(`Remove ${providerName}?`)) onDelete() }}
              className="cursor-pointer rounded px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
