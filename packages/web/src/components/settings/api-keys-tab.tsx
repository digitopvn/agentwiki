/** API Keys tab — create, list, revoke API keys */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Key, Plus, Copy, Check, AlertTriangle } from 'lucide-react'
import { apiClient } from '../../lib/api-client'
import { cn } from '../../lib/utils'

interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

interface CreatedKey {
  id: string
  key: string
  keyPrefix: string
  name: string
  scopes: string[]
}

const AVAILABLE_SCOPES = ['doc:read', 'doc:create', 'doc:update', 'doc:delete', 'doc:search', 'doc:share']

export function ApiKeysTab({ isDark }: { isDark: boolean }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [newKey, setNewKey] = useState<CreatedKey | null>(null)
  const [copied, setCopied] = useState(false)

  // Form state
  const [keyName, setKeyName] = useState('')
  const [scopes, setScopes] = useState<string[]>(['doc:read'])
  const [expiresInDays, setExpiresInDays] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiClient.get<{ keys: ApiKey[] }>('/api/keys'),
  })

  const createKey = useMutation({
    mutationFn: (body: { name: string; scopes: string[]; expiresInDays?: number }) =>
      apiClient.post<CreatedKey>('/api/keys', body),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['api-keys'] })
      setNewKey(result)
      setShowForm(false)
      setKeyName('')
      setScopes(['doc:read'])
      setExpiresInDays('')
    },
  })

  const revokeKey = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  })

  const copyKey = async () => {
    if (!newKey) return
    await navigator.clipboard.writeText(newKey.key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const toggleScope = (scope: string) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    )
  }

  const handleCreate = () => {
    if (!keyName || scopes.length === 0) return
    const body: { name: string; scopes: string[]; expiresInDays?: number } = { name: keyName, scopes }
    const days = parseInt(expiresInDays, 10)
    if (!isNaN(days) && days > 0) body.expiresInDays = days
    createKey.mutate(body)
  }

  const keys = data?.keys ?? []

  const inputCls = cn(
    'w-full rounded border px-2.5 py-1.5 text-base outline-none md:text-xs',
    isDark
      ? 'border-white/[0.06] bg-surface-2 text-neutral-200 placeholder-neutral-600'
      : 'border-neutral-200 bg-neutral-50 text-neutral-800 placeholder-neutral-400',
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={cn('text-sm font-semibold', isDark ? 'text-neutral-200' : 'text-neutral-800')}>
            API Keys
          </h2>
          <p className={cn('text-xs mt-0.5', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
            Manage API keys for programmatic access.
          </p>
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setNewKey(null) }}
          className="flex cursor-pointer items-center gap-1.5 rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-3.5 w-3.5" />
          Create API Key
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className={cn('rounded-lg border p-3 space-y-3', isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-white')}>
          <p className={cn('text-xs font-medium', isDark ? 'text-neutral-300' : 'text-neutral-700')}>New API Key</p>

          {/* Name */}
          <div>
            <label className={cn('text-[11px] font-medium', isDark ? 'text-neutral-400' : 'text-neutral-500')}>Name</label>
            <input
              type="text"
              placeholder="e.g. CI/CD deploy key"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              className={cn(inputCls, 'mt-1')}
            />
          </div>

          {/* Scopes */}
          <div>
            <label className={cn('text-[11px] font-medium', isDark ? 'text-neutral-400' : 'text-neutral-500')}>Scopes</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {AVAILABLE_SCOPES.map((s) => (
                <label key={s} className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={scopes.includes(s)}
                    onChange={() => toggleScope(s)}
                    className="h-3.5 w-3.5 rounded accent-brand-500"
                  />
                  <span className={cn('text-[11px]', isDark ? 'text-neutral-300' : 'text-neutral-600')}>{s}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Expiry */}
          <div>
            <label className={cn('text-[11px] font-medium', isDark ? 'text-neutral-400' : 'text-neutral-500')}>
              Expires in (days) — optional
            </label>
            <input
              type="number"
              placeholder="e.g. 90"
              min="1"
              max="365"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              className={cn(inputCls, 'mt-1 w-32')}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={createKey.isPending || !keyName || scopes.length === 0}
              className="cursor-pointer rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {createKey.isPending ? 'Creating...' : 'Create Key'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className={cn('cursor-pointer rounded px-3 py-1.5 text-xs', isDark ? 'text-neutral-400 hover:text-neutral-200' : 'text-neutral-500 hover:text-neutral-700')}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* One-time key display banner */}
      {newKey && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
            <span className="text-xs font-medium text-amber-300">Save this key — it won't be shown again</span>
          </div>
          <div className="flex items-center gap-2">
            <code className={cn('flex-1 rounded px-3 py-2 font-mono text-sm select-all', isDark ? 'bg-surface-2 text-neutral-200' : 'bg-neutral-100 text-neutral-800')}>
              {newKey.key}
            </code>
            <button
              onClick={copyKey}
              title="Copy key"
              className={cn('cursor-pointer rounded p-1.5 transition-colors', isDark ? 'text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.06]' : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100')}
            >
              {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <button
            onClick={() => setNewKey(null)}
            className={cn('text-[11px] cursor-pointer', isDark ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-400 hover:text-neutral-600')}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Keys list */}
      {isLoading ? (
        <p className={cn('py-6 text-center text-xs', isDark ? 'text-neutral-500' : 'text-neutral-400')}>Loading...</p>
      ) : keys.length === 0 ? (
        <div className={cn('flex flex-col items-center gap-2 py-8', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
          <Key className="h-6 w-6 opacity-40" />
          <p className="text-xs">No API keys yet.</p>
        </div>
      ) : (
        <div className={cn('rounded-lg border divide-y', isDark ? 'border-white/[0.06] divide-white/[0.04]' : 'border-neutral-200 divide-neutral-100')}>
          {keys.map((k) => (
            <KeyRow
              key={k.id}
              apiKey={k}
              isDark={isDark}
              onRevoke={() => {
                if (window.confirm(`Revoke key "${k.name}"? This cannot be undone.`)) revokeKey.mutate(k.id)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Single API key row */
function KeyRow({
  apiKey: k,
  isDark,
  onRevoke,
}: {
  apiKey: ApiKey
  isDark: boolean
  onRevoke: () => void
}) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <Key className={cn('mt-0.5 h-3.5 w-3.5 flex-shrink-0', isDark ? 'text-neutral-500' : 'text-neutral-400')} />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('text-xs font-medium', isDark ? 'text-neutral-200' : 'text-neutral-800')}>{k.name}</span>
          <code className={cn('rounded px-1.5 py-0.5 font-mono text-[10px]', isDark ? 'bg-surface-2 text-neutral-400' : 'bg-neutral-100 text-neutral-500')}>
            {k.keyPrefix}…
          </code>
        </div>
        <div className="flex flex-wrap gap-1">
          {k.scopes.map((s) => (
            <span key={s} className={cn('rounded px-1.5 py-0.5 text-[10px]', isDark ? 'bg-brand-600/15 text-brand-400' : 'bg-brand-50 text-brand-600')}>
              {s}
            </span>
          ))}
        </div>
        <div className={cn('flex gap-3 text-[10px]', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
          <span>Created {new Date(k.createdAt).toLocaleDateString()}</span>
          {k.lastUsedAt && <span>Last used {new Date(k.lastUsedAt).toLocaleDateString()}</span>}
          {k.expiresAt && <span>Expires {new Date(k.expiresAt).toLocaleDateString()}</span>}
        </div>
      </div>
      <button
        onClick={onRevoke}
        className={cn('cursor-pointer rounded px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/10 flex-shrink-0')}
      >
        Revoke
      </button>
    </div>
  )
}
