/** AI provider settings tab — configure providers, view usage */

import { useState } from 'react'
import { useAISettings, useUpdateAISetting, useDeleteAISetting, useAIUsage } from '../../hooks/use-ai-settings'
import { AI_PROVIDERS } from '@agentwiki/shared'
import type { AIProviderId, AIProviderSetting } from '@agentwiki/shared'
import { cn } from '../../lib/utils'

const providerIds = Object.keys(AI_PROVIDERS) as AIProviderId[]

export function AISettingsTab({ isDark }: { isDark: boolean }) {
  const { data } = useAISettings()
  const { data: usageData } = useAIUsage()
  const updateSetting = useUpdateAISetting()
  const deleteSetting = useDeleteAISetting()

  const settings = data?.settings ?? []
  const usage = usageData?.usage ?? []

  return (
    <div className="space-y-6">
      <div>
        <h2 className={cn('text-sm font-semibold', isDark ? 'text-neutral-200' : 'text-neutral-800')}>AI Providers</h2>
        <p className={cn('text-xs mt-1', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
          Configure AI providers for your workspace. API keys are encrypted at rest.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {providerIds.map((id) => {
          const provider = AI_PROVIDERS[id]
          const setting = settings.find((s) => s.providerId === id)
          return (
            <ProviderCard
              key={id}
              providerId={id}
              providerName={provider.name}
              models={provider.models as unknown as string[]}
              setting={setting}
              isDark={isDark}
              onSave={(apiKey, model, enabled) =>
                updateSetting.mutate({ providerId: id, apiKey, defaultModel: model, isEnabled: enabled })
              }
              onDelete={() => deleteSetting.mutate(id)}
              isSaving={updateSetting.isPending}
            />
          )
        })}
      </div>

      {/* Usage statistics */}
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
                    <td className={cn('px-3 py-2 text-right', isDark ? 'text-neutral-400' : 'text-neutral-500')}>
                      {u.inputTokens + u.outputTokens}
                    </td>
                    <td className={cn('px-3 py-2 text-right', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/** Individual provider configuration card */
function ProviderCard({
  providerId: _providerId,
  providerName,
  models,
  setting,
  isDark,
  onSave,
  onDelete,
  isSaving,
}: {
  providerId: string
  providerName: string
  models: string[]
  setting?: AIProviderSetting
  isDark: boolean
  onSave: (apiKey: string, model: string, enabled: boolean) => void
  onDelete: () => void
  isSaving: boolean
}) {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(setting?.defaultModel || models[0])
  const [enabled, setEnabled] = useState(setting?.isEnabled ?? true)

  const isConfigured = !!setting

  return (
    <div className={cn('rounded-lg border p-3 space-y-3', isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-white')}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('text-sm font-medium', isDark ? 'text-neutral-100' : 'text-neutral-900')}>{providerName}</span>
          {isConfigured && (
            <span className={cn('rounded-full px-2 py-0.5 text-[10px]', enabled ? 'bg-green-500/10 text-green-400' : 'bg-neutral-500/10 text-neutral-400')}>
              {enabled ? 'Active' : 'Disabled'}
            </span>
          )}
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded accent-brand-500"
          />
          <span className={cn('text-[11px]', isDark ? 'text-neutral-400' : 'text-neutral-500')}>Enabled</span>
        </label>
      </div>

      {/* API Key */}
      <div>
        <label className={cn('text-[11px] font-medium', isDark ? 'text-neutral-400' : 'text-neutral-500')}>API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={isConfigured ? '••••••••  (saved)' : 'Enter API key'}
          className={cn(
            'mt-1 w-full rounded border px-2.5 py-1.5 text-base outline-none md:text-xs',
            isDark ? 'border-white/[0.06] bg-surface-2 text-neutral-200 placeholder-neutral-600' : 'border-neutral-200 bg-neutral-50 text-neutral-800 placeholder-neutral-400',
          )}
        />
      </div>

      {/* Model */}
      <div>
        <label className={cn('text-[11px] font-medium', isDark ? 'text-neutral-400' : 'text-neutral-500')}>Model</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className={cn(
            'mt-1 w-full rounded border px-2.5 py-1.5 text-base outline-none md:text-xs',
            isDark ? 'border-white/[0.06] bg-surface-2 text-neutral-200' : 'border-neutral-200 bg-neutral-50 text-neutral-800',
          )}
        >
          {models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => {
            if (!apiKey && !isConfigured) return
            onSave(apiKey || '__unchanged__', model, enabled)
            setApiKey('')
          }}
          disabled={isSaving}
          className={cn(
            'flex-1 cursor-pointer rounded px-3 py-1.5 text-xs font-medium transition-colors',
            'bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50',
          )}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        {isConfigured && (
          <button
            onClick={() => {
              if (window.confirm(`Remove ${providerName} configuration?`)) onDelete()
            }}
            className="cursor-pointer rounded px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  )
}
