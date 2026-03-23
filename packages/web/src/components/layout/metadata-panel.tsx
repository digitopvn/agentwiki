/** Right metadata panel: document properties, tags, version history */

import { PanelRight, X } from 'lucide-react'
import { useAppStore } from '../../stores/app-store'
import { useIsMobile } from '../../hooks/use-is-mobile'
import { cn } from '../../lib/utils'
import { DocumentProperties } from '../metadata/document-properties'
import { TagEditor } from '../metadata/tag-editor'
import { VersionHistory } from '../metadata/version-history'

export function MetadataPanel() {
  const { activeTabId, openTabs, metadataPanelCollapsed, setMetadataPanelCollapsed, theme, setMobileMetadataOpen } = useAppStore()
  const isMobile = useIsMobile()

  const activeTab = openTabs.find((t) => t.id === activeTabId) ?? null
  const isDark = theme === 'dark'

  // On desktop, show collapsed state
  if (!isMobile && metadataPanelCollapsed) {
    return (
      <div
        className={cn(
          'flex w-10 flex-col items-center border-l py-3',
          isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-white',
        )}
      >
        <button
          onClick={() => setMetadataPanelCollapsed(false)}
          className={cn(
            'cursor-pointer rounded-md p-1.5',
            isDark ? 'text-neutral-500 hover:bg-surface-3 hover:text-neutral-300' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700',
          )}
          title="Expand properties panel"
        >
          <PanelRight className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex h-full shrink-0 flex-col border-l overflow-y-auto',
        isMobile ? 'w-full' : 'w-[300px]',
        isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-white',
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center justify-between border-b px-3 py-3',
          isDark ? 'border-white/[0.06]' : 'border-neutral-200',
        )}
      >
        <span
          className={cn(
            'text-[11px] font-semibold uppercase tracking-wider',
            isDark ? 'text-neutral-500' : 'text-neutral-400',
          )}
        >
          Properties
        </span>
        {isMobile ? (
          <button
            onClick={() => setMobileMetadataOpen(false)}
            className={cn(
              'rounded-lg p-2',
              isDark ? 'text-neutral-500 active:bg-surface-3' : 'text-neutral-400 active:bg-neutral-100',
            )}
            aria-label="Close properties"
          >
            <X className="h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={() => setMetadataPanelCollapsed(true)}
            className={cn(
              'cursor-pointer rounded-md p-1',
              isDark ? 'text-neutral-500 hover:bg-surface-3 hover:text-neutral-300' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700',
            )}
            title="Collapse properties panel"
          >
            <PanelRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {activeTab ? (
        <div className="flex flex-col gap-4 p-3">
          <DocumentProperties documentId={activeTab.documentId} />
          <div className={cn('border-t', isDark ? 'border-white/[0.06]' : 'border-neutral-200')} />
          <TagEditor documentId={activeTab.documentId} />
          <div className={cn('border-t', isDark ? 'border-white/[0.06]' : 'border-neutral-200')} />
          <VersionHistory documentId={activeTab.documentId} />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-4">
          <p className={cn('text-center text-xs', isDark ? 'text-neutral-600' : 'text-neutral-400')}>
            Open a document to view its properties
          </p>
        </div>
      )}
    </div>
  )
}
