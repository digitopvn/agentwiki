/** Admin settings page with tab deeplinking via URL search params */

import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Users, Building2, Key, Keyboard, HardDrive, Sparkles, Download } from 'lucide-react'
import { useAppStore } from '../stores/app-store'
import { cn } from '../lib/utils'
import { MembersTab } from '../components/settings/members-tab'
import { ApiKeysTab } from '../components/settings/api-keys-tab'
import { StorageTab } from '../components/settings/storage-tab'
import { AISettingsTab } from '../components/settings/ai-settings-tab'
import { ImportTab } from '../components/settings/import-tab'
import { ShortcutsTab } from '../components/settings/shortcuts-tab'

type TabId = 'members' | 'workspace' | 'api-keys' | 'ai' | 'storage' | 'import' | 'shortcuts'

const TABS: { id: TabId; label: string; icon: typeof Users }[] = [
  { id: 'members', label: 'Members', icon: Users },
  { id: 'workspace', label: 'Workspace', icon: Building2 },
  { id: 'api-keys', label: 'API Keys', icon: Key },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'import', label: 'Import', icon: Download },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
]

const TAB_IDS = TABS.map((t) => t.id)

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { theme } = useAppStore()
  const navigate = useNavigate()
  const isDark = theme === 'dark'

  // Derive active tab from URL — fallback to 'members' if invalid
  const rawTab = searchParams.get('tab')
  const activeTab: TabId = TAB_IDS.includes(rawTab as TabId) ? (rawTab as TabId) : 'members'

  const setTab = (id: TabId) => setSearchParams({ tab: id }, { replace: true })

  return (
    <div className={cn('min-h-screen', isDark ? 'bg-surface-0' : 'bg-neutral-50')}>
      {/* Header */}
      <div className={cn('border-b px-4 py-4 md:px-6', isDark ? 'border-white/[0.06]' : 'border-neutral-200')}>
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button onClick={() => navigate('/')} className={cn('cursor-pointer rounded-lg p-2 md:p-1.5', isDark ? 'hover:bg-surface-3 active:bg-surface-3 text-neutral-400' : 'hover:bg-neutral-100 active:bg-neutral-100 text-neutral-500')}>
            <ArrowLeft className="h-5 w-5 md:h-4 md:w-4" />
          </button>
          <h1 className={cn('text-lg font-semibold', isDark ? 'text-neutral-100' : 'text-neutral-900')}>Settings</h1>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-4 md:px-6 md:py-6">
        {/* Tab nav — scrollable on mobile, deeplinked via ?tab=<id> */}
        <div className={cn('flex gap-1 rounded-lg border p-1 mb-6 overflow-x-auto', isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-neutral-100')}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                'flex shrink-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors md:py-1.5',
                activeTab === id
                  ? 'bg-brand-600 text-white'
                  : isDark ? 'text-neutral-400 hover:text-neutral-200' : 'text-neutral-500 hover:text-neutral-700',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">{label}</span>
              <span className="sr-only sm:hidden">{label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'members' && <MembersTab isDark={isDark} />}
        {activeTab === 'workspace' && <WorkspaceTab isDark={isDark} />}
        {activeTab === 'api-keys' && <ApiKeysTab isDark={isDark} />}
        {activeTab === 'ai' && <AISettingsTab isDark={isDark} />}
        {activeTab === 'storage' && <StorageTab isDark={isDark} />}
        {activeTab === 'import' && <ImportTab isDark={isDark} />}
        {activeTab === 'shortcuts' && <ShortcutsTab isDark={isDark} />}
      </div>
    </div>
  )
}

/** Workspace settings tab (read-only, kept inline)
 *  TODO: Replace hardcoded workspace name and plan with data from a tenant/workspace API endpoint.
 *  These values are currently static placeholders. */
function WorkspaceTab({ isDark }: { isDark: boolean }) {
  return (
    <div className="space-y-4">
      <h2 className={cn('text-sm font-semibold', isDark ? 'text-neutral-200' : 'text-neutral-800')}>Workspace</h2>
      <div className={cn('rounded-lg border p-4 space-y-3', isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-white')}>
        <div>
          <label className={cn('text-xs font-medium', isDark ? 'text-neutral-400' : 'text-neutral-500')}>Workspace name</label>
          {/* TODO: fetch from tenant API */}
          <p className={cn('text-sm mt-0.5', isDark ? 'text-neutral-200' : 'text-neutral-800')}>AgentWiki</p>
        </div>
        <div>
          <label className={cn('text-xs font-medium', isDark ? 'text-neutral-400' : 'text-neutral-500')}>Plan</label>
          {/* TODO: fetch from billing/subscription API */}
          <p className={cn('text-sm mt-0.5', isDark ? 'text-neutral-200' : 'text-neutral-800')}>Free</p>
        </div>
      </div>
    </div>
  )
}

