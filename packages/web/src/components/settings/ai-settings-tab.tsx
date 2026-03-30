/** AI provider settings tab — sortable configured providers + unconfigured list + usage */

import { useState } from 'react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { Sparkles } from 'lucide-react'
import {
  useAISettings,
  useUpdateAISetting,
  useDeleteAISetting,
  useAIUsage,
  useReorderAISettings,
} from '../../hooks/use-ai-settings'
import { AI_PROVIDERS } from '@agentwiki/shared'
import type { AIProviderId, AIProviderSetting } from '@agentwiki/shared'
import { SortableProviderRow } from './ai-sortable-provider-row'
import { cn } from '../../lib/utils'
import type { AIUsageRecord } from '@agentwiki/shared'

const providerIds = Object.keys(AI_PROVIDERS) as AIProviderId[]

export function AISettingsTab({ isDark }: { isDark: boolean }) {
  const { data } = useAISettings()
  const { data: usageData } = useAIUsage()
  const updateSetting = useUpdateAISetting()
  const deleteSetting = useDeleteAISetting()
  const reorderMutation = useReorderAISettings()

  const settings: AIProviderSetting[] = data?.settings ?? []
  const usage = usageData?.usage ?? []

  // Sort configured by priority, derive unconfigured list
  const configured = [...settings].sort((a, b) => a.priority - b.priority)
  const configuredIds = new Set(configured.map((s) => s.providerId))
  const unconfigured = providerIds.filter((id) => !configuredIds.has(id))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = configured.findIndex((s) => s.providerId === active.id)
    const newIndex = configured.findIndex((s) => s.providerId === over.id)
    const reordered = arrayMove(configured, oldIndex, newIndex)
    const order = reordered.map((s, i) => ({ providerId: s.providerId, priority: i }))
    reorderMutation.mutate(order)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className={cn('text-sm font-semibold', isDark ? 'text-neutral-200' : 'text-neutral-800')}>AI Providers</h2>
        <p className={cn('text-xs mt-1', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
          Configure providers and drag to set fallback priority. API keys are encrypted at rest.
        </p>
      </div>

      {/* Configured providers — sortable */}
      {configured.length > 0 && (
        <div className="space-y-2">
          <p className={cn('text-[11px] font-medium uppercase tracking-wide', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
            Configured ({configured.length})
          </p>
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={configured.map((s) => s.providerId)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {configured.map((setting) => {
                  const provider = AI_PROVIDERS[setting.providerId]
                  return (
                    <SortableProviderRow
                      key={setting.providerId}
                      setting={setting}
                      providerName={provider?.name ?? setting.providerId}
                      models={provider ? (provider.models as unknown as string[]) : [setting.defaultModel]}
                      isDark={isDark}
                      onSave={(apiKey, model, enabled) =>
                        updateSetting.mutate({ providerId: setting.providerId, apiKey, defaultModel: model, isEnabled: enabled })
                      }
                      onDelete={() => deleteSetting.mutate(setting.providerId)}
                      isSaving={updateSetting.isPending}
                    />
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Unconfigured providers */}
      {unconfigured.length > 0 && (
        <div className="space-y-2">
          <p className={cn('text-[11px] font-medium uppercase tracking-wide', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
            Available ({unconfigured.length})
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {unconfigured.map((id) => (
              <UnconfiguredProviderCard
                key={id}
                providerId={id}
                providerName={AI_PROVIDERS[id].name}
                models={AI_PROVIDERS[id].models as unknown as string[]}
                isDark={isDark}
                onSave={(apiKey, model, enabled) =>
                  updateSetting.mutate({ providerId: id, apiKey, defaultModel: model, isEnabled: enabled })
                }
                isSaving={updateSetting.isPending}
              />
            ))}
          </div>
        </div>
      )}

      {/* Usage statistics */}
      <UsageTable usage={usage} isDark={isDark} />
    </div>
  )
}

/** Card for a provider that hasn't been configured yet */
function UnconfiguredProviderCard({
  providerId: _pid,
  providerName,
  models,
  isDark,
  onSave,
  isSaving,
}: {
  providerId: string
  providerName: string
  models: string[]
  isDark: boolean
  onSave: (apiKey: string, model: string, enabled: boolean) => void
  isSaving: boolean
}) {
  const [open, setOpen] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(models[0])

  const inputCls = cn(
    'mt-1 w-full rounded border px-2.5 py-1.5 text-xs outline-none',
    isDark
      ? 'border-white/[0.06] bg-surface-2 text-neutral-200 placeholder-neutral-600'
      : 'border-neutral-200 bg-neutral-50 text-neutral-800 placeholder-neutral-400',
  )

  return (
    <div className={cn('rounded-lg border p-3 space-y-2', isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-white')}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className={cn('h-3.5 w-3.5', isDark ? 'text-neutral-600' : 'text-neutral-300')} />
          <span className={cn('text-xs font-medium', isDark ? 'text-neutral-300' : 'text-neutral-700')}>{providerName}</span>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="cursor-pointer rounded px-2 py-1 text-[11px] bg-brand-600 text-white hover:bg-brand-700"
        >
          {open ? 'Cancel' : 'Configure'}
        </button>
      </div>

      {open && (
        <div className="space-y-2 pt-1">
          <div>
            <label className={cn('text-[11px] font-medium', isDark ? 'text-neutral-400' : 'text-neutral-500')}>API Key</label>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Enter API key" className={inputCls} />
          </div>
          <div>
            <label className={cn('text-[11px] font-medium', isDark ? 'text-neutral-400' : 'text-neutral-500')}>Model</label>
            <select value={model} onChange={(e) => setModel(e.target.value)} className={cn(inputCls, 'mt-1')}>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <button
            onClick={() => { if (!apiKey) return; onSave(apiKey, model, true); setApiKey(''); setOpen(false) }}
            disabled={isSaving || !apiKey}
            className="w-full cursor-pointer rounded px-3 py-1.5 text-xs font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}

/** Usage statistics table */
function UsageTable({ usage, isDark }: { usage: AIUsageRecord[]; isDark: boolean }) {
  return (
    <div>
      <h2 className={cn('text-sm font-semibold mb-3', isDark ? 'text-neutral-200' : 'text-neutral-800')}>Usage Statistics</h2>
      {usage.length === 0 ? (
        <p className={cn('py-6 text-center text-sm', isDark ? 'text-neutral-500' : 'text-neutral-400')}>No AI usage recorded yet.</p>
      ) : (
        <div className={cn('rounded-lg border overflow-x-auto', isDark ? 'border-white/[0.06]' : 'border-neutral-200')}>
          <table className="w-full text-xs">
            <thead>
              <tr className={isDark ? 'bg-surface-2 text-neutral-400' : 'bg-neutral-50 text-neutral-500'}>
                <th className="px-3 py-2 text-left font-medium">Provider</th>
                <th className="px-3 py-2 text-left font-medium">Model</th>
                <th className="px-3 py-2 text-left font-medium">Action</th>
                <th className="px-3 py-2 text-right font-medium">Tokens</th>
                <th className="px-3 py-2 text-right font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {usage.slice(0, 50).map((u, i) => (
                <tr key={i} className={cn(isDark ? 'border-t border-white/[0.04]' : 'border-t border-neutral-100')}>
                  <td className={cn('px-3 py-2', isDark ? 'text-neutral-300' : 'text-neutral-700')}>{u.providerId}</td>
                  <td className={cn('px-3 py-2 font-mono', isDark ? 'text-neutral-400' : 'text-neutral-500')}>{u.model}</td>
                  <td className={cn('px-3 py-2', isDark ? 'text-neutral-300' : 'text-neutral-700')}>{u.action}</td>
                  <td className={cn('px-3 py-2 text-right', isDark ? 'text-neutral-400' : 'text-neutral-500')}>{u.inputTokens + u.outputTokens}</td>
                  <td className={cn('px-3 py-2 text-right', isDark ? 'text-neutral-500' : 'text-neutral-400')}>{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
