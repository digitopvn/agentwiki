/** Center panel: mobile header + tab bar + editor area */

import { Menu, PanelRight, Search } from 'lucide-react'
import { useAppStore } from '../../stores/app-store'
import { useIsMobile } from '../../hooks/use-is-mobile'
import { TabBar } from '../editor/tab-bar'
import { Editor } from '../editor/editor'
import { WelcomeScreen } from '../editor/welcome-screen'
import { cn } from '../../lib/utils'

export function MainPanel() {
  const { openTabs, activeTabId, theme, setMobileSidebarOpen, setMobileMetadataOpen } = useAppStore()
  const isMobile = useIsMobile()
  const isDark = theme === 'dark'

  const activeTab = openTabs.find((t) => t.id === activeTabId) ?? null

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Mobile header */}
      {isMobile && (
        <div
          className={cn(
            'flex items-center justify-between px-2 py-2 border-b shrink-0',
            isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-white',
          )}
        >
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className={cn(
              'flex items-center justify-center rounded-lg p-2',
              isDark ? 'text-neutral-400 active:bg-surface-3' : 'text-neutral-500 active:bg-neutral-100',
            )}
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-gradient-to-br from-brand-500 to-brand-700">
              <span className="text-[8px] font-bold text-white">A</span>
            </div>
            <span className={cn('text-sm font-semibold', isDark ? 'text-neutral-100' : 'text-neutral-900')}>
              AgentWiki
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
              }}
              className={cn(
                'flex items-center justify-center rounded-lg p-2',
                isDark ? 'text-neutral-400 active:bg-surface-3' : 'text-neutral-500 active:bg-neutral-100',
              )}
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </button>
            {activeTab && (
              <button
                onClick={() => setMobileMetadataOpen(true)}
                className={cn(
                  'flex items-center justify-center rounded-lg p-2',
                  isDark ? 'text-neutral-400 active:bg-surface-3' : 'text-neutral-500 active:bg-neutral-100',
                )}
                aria-label="Document properties"
              >
                <PanelRight className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {openTabs.length > 0 && <TabBar />}
      <div className="flex-1 overflow-hidden">
        {activeTab ? (
          <Editor key={activeTab.documentId} documentId={activeTab.documentId} tabId={activeTab.id} />
        ) : (
          <WelcomeScreen />
        )}
      </div>
    </div>
  )
}
