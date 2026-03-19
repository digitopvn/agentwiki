/** Admin settings page with tabs: Members, Workspace, API Keys, Shortcuts */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Users, Building2, Key, Keyboard, Trash2, HardDrive } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../stores/app-store'
import { apiClient } from '../lib/api-client'
import { cn } from '../lib/utils'
import { StorageTab } from '../components/settings/storage-tab'

type TabId = 'members' | 'workspace' | 'api-keys' | 'shortcuts' | 'storage'

const TABS: { id: TabId; label: string; icon: typeof Users }[] = [
  { id: 'members', label: 'Members', icon: Users },
  { id: 'workspace', label: 'Workspace', icon: Building2 },
  { id: 'api-keys', label: 'API Keys', icon: Key },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
]

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('members')
  const { theme } = useAppStore()
  const navigate = useNavigate()
  const isDark = theme === 'dark'

  return (
    <div className={cn('min-h-screen', isDark ? 'bg-surface-0' : 'bg-neutral-50')}>
      {/* Header */}
      <div className={cn('border-b px-6 py-4', isDark ? 'border-white/[0.06]' : 'border-neutral-200')}>
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button onClick={() => navigate('/')} className={cn('cursor-pointer rounded-lg p-1.5', isDark ? 'hover:bg-surface-3 text-neutral-400' : 'hover:bg-neutral-100 text-neutral-500')}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className={cn('text-lg font-semibold', isDark ? 'text-neutral-100' : 'text-neutral-900')}>Settings</h1>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-6">
        {/* Tab nav */}
        <div className={cn('flex gap-1 rounded-lg border p-1 mb-6', isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-neutral-100')}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                activeTab === id
                  ? 'bg-brand-600 text-white'
                  : isDark ? 'text-neutral-400 hover:text-neutral-200' : 'text-neutral-500 hover:text-neutral-700',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'members' && <MembersTab isDark={isDark} />}
        {activeTab === 'workspace' && <WorkspaceTab isDark={isDark} />}
        {activeTab === 'api-keys' && <ApiKeysTab isDark={isDark} />}
        {activeTab === 'storage' && <StorageTab isDark={isDark} />}
        {activeTab === 'shortcuts' && <ShortcutsTab isDark={isDark} />}
      </div>
    </div>
  )
}

/** Members management tab */
function MembersTab({ isDark }: { isDark: boolean }) {
  interface Member {
    id: string
    userId: string
    role: string
    joinedAt: string
    userName: string
    userEmail: string
    userAvatar: string | null
  }

  const qc = useQueryClient()
  const { data } = useQuery<{ members: Member[] }>({
    queryKey: ['members'],
    queryFn: () => apiClient.get('/api/members'),
  })

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => apiClient.put(`/api/members/${id}`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  })

  const removeMember = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/members/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  })

  const members = data?.members ?? []

  return (
    <div className="space-y-4">
      <h2 className={cn('text-sm font-semibold', isDark ? 'text-neutral-200' : 'text-neutral-800')}>Team members</h2>
      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className={cn('flex items-center gap-3 rounded-lg border p-3', isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-white')}>
            {m.userAvatar ? (
              <img src={m.userAvatar} alt="" className="h-8 w-8 rounded-full" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                {m.userName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <p className={cn('text-sm font-medium', isDark ? 'text-neutral-100' : 'text-neutral-900')}>{m.userName}</p>
              <p className={cn('text-xs', isDark ? 'text-neutral-500' : 'text-neutral-400')}>{m.userEmail}</p>
            </div>
            <select
              value={m.role}
              onChange={(e) => updateRole.mutate({ id: m.id, role: e.target.value })}
              className={cn('rounded border px-2 py-1 text-xs outline-none', isDark ? 'border-white/[0.06] bg-surface-2 text-neutral-200' : 'border-neutral-200 bg-white text-neutral-700')}
            >
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              onClick={() => { if (window.confirm(`Remove ${m.userName}?`)) removeMember.mutate(m.id) }}
              className="cursor-pointer rounded p-1 text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {members.length === 0 && (
          <p className={cn('py-8 text-center text-sm', isDark ? 'text-neutral-500' : 'text-neutral-400')}>No members found.</p>
        )}
      </div>
    </div>
  )
}

/** Workspace settings tab */
function WorkspaceTab({ isDark }: { isDark: boolean }) {
  return (
    <div className="space-y-4">
      <h2 className={cn('text-sm font-semibold', isDark ? 'text-neutral-200' : 'text-neutral-800')}>Workspace</h2>
      <div className={cn('rounded-lg border p-4 space-y-3', isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-white')}>
        <div>
          <label className={cn('text-xs font-medium', isDark ? 'text-neutral-400' : 'text-neutral-500')}>Workspace name</label>
          <p className={cn('text-sm mt-0.5', isDark ? 'text-neutral-200' : 'text-neutral-800')}>AgentWiki</p>
        </div>
        <div>
          <label className={cn('text-xs font-medium', isDark ? 'text-neutral-400' : 'text-neutral-500')}>Plan</label>
          <p className={cn('text-sm mt-0.5', isDark ? 'text-neutral-200' : 'text-neutral-800')}>Free</p>
        </div>
      </div>
    </div>
  )
}

/** API Keys management tab */
function ApiKeysTab({ isDark }: { isDark: boolean }) {
  interface ApiKey {
    id: string
    name: string
    keyPrefix: string
    scopes: string[]
    lastUsedAt: string | null
    createdAt: string
  }

  const qc = useQueryClient()
  const { data } = useQuery<{ keys: ApiKey[] }>({
    queryKey: ['api-keys'],
    queryFn: () => apiClient.get('/api/keys'),
  })

  const revokeKey = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  })

  const keys = data?.keys ?? []

  return (
    <div className="space-y-4">
      <h2 className={cn('text-sm font-semibold', isDark ? 'text-neutral-200' : 'text-neutral-800')}>API Keys</h2>
      <div className="space-y-2">
        {keys.map((k) => (
          <div key={k.id} className={cn('flex items-center gap-3 rounded-lg border p-3', isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-white')}>
            <Key className="h-4 w-4 shrink-0 text-brand-400" />
            <div className="flex-1">
              <p className={cn('text-sm font-medium', isDark ? 'text-neutral-100' : 'text-neutral-900')}>{k.name}</p>
              <p className={cn('text-xs font-mono', isDark ? 'text-neutral-500' : 'text-neutral-400')}>{k.keyPrefix}...</p>
            </div>
            <button
              onClick={() => { if (window.confirm('Revoke this key?')) revokeKey.mutate(k.id) }}
              className="cursor-pointer rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
            >
              Revoke
            </button>
          </div>
        ))}
        {keys.length === 0 && (
          <p className={cn('py-8 text-center text-sm', isDark ? 'text-neutral-500' : 'text-neutral-400')}>No API keys created.</p>
        )}
      </div>
    </div>
  )
}

/** Keyboard shortcuts display tab */
function ShortcutsTab({ isDark }: { isDark: boolean }) {
  const shortcuts = [
    { keys: 'Ctrl/Cmd + K', action: 'Open command palette' },
    { keys: 'Ctrl/Cmd + N', action: 'New document' },
    { keys: 'Ctrl/Cmd + S', action: 'Save version checkpoint' },
    { keys: 'Ctrl/Cmd + \\', action: 'Toggle sidebar' },
    { keys: 'Ctrl/Cmd + .', action: 'Toggle metadata panel' },
    { keys: 'Ctrl/Cmd + Shift + [', action: 'Previous tab' },
    { keys: 'Ctrl/Cmd + Shift + ]', action: 'Next tab' },
    { keys: 'Escape', action: 'Close modals' },
  ]

  return (
    <div className="space-y-4">
      <h2 className={cn('text-sm font-semibold', isDark ? 'text-neutral-200' : 'text-neutral-800')}>Keyboard shortcuts</h2>
      <div className={cn('rounded-lg border overflow-hidden', isDark ? 'border-white/[0.06]' : 'border-neutral-200')}>
        {shortcuts.map((s, i) => (
          <div
            key={s.keys}
            className={cn(
              'flex items-center justify-between px-4 py-2.5',
              i > 0 && (isDark ? 'border-t border-white/[0.04]' : 'border-t border-neutral-100'),
              isDark ? 'bg-surface-1' : 'bg-white',
            )}
          >
            <span className={cn('text-sm', isDark ? 'text-neutral-300' : 'text-neutral-700')}>{s.action}</span>
            <kbd className={cn('rounded-md px-2 py-0.5 font-mono text-xs', isDark ? 'bg-surface-3 text-neutral-400' : 'bg-neutral-100 text-neutral-500')}>
              {s.keys}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  )
}
