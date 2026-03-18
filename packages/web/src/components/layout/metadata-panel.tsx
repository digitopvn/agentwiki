/** Right metadata panel: document properties, tags, version history */

import { PanelRight } from 'lucide-react'
import { useAppStore } from '../../stores/app-store'
import { cn } from '../../lib/utils'
import { DocumentProperties } from '../metadata/document-properties'
import { TagEditor } from '../metadata/tag-editor'
import { VersionHistory } from '../metadata/version-history'

export function MetadataPanel() {
  const { activeTabId, openTabs, metadataPanelCollapsed, setMetadataPanelCollapsed, theme } = useAppStore()

  const activeTab = openTabs.find((t) => t.id === activeTabId) ?? null

  if (metadataPanelCollapsed) {
    return (
      <div className={cn(
        'flex w-10 flex-col items-center border-l py-3',
        theme === 'dark' ? 'border-neutral-800 bg-neutral-900' : 'border-neutral-200 bg-neutral-50',
      )}>
        <button
          onClick={() => setMetadataPanelCollapsed(false)}
          className="rounded p-1 text-neutral-400 hover:text-neutral-100"
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
        'flex w-[300px] shrink-0 flex-col border-l overflow-y-auto',
        theme === 'dark' ? 'border-neutral-800 bg-neutral-900' : 'border-neutral-200 bg-neutral-50',
      )}
    >
      {/* Header */}
      <div className={cn(
        'flex items-center justify-between border-b px-3 py-3',
        theme === 'dark' ? 'border-neutral-800' : 'border-neutral-200',
      )}>
        <span className={cn('text-xs font-semibold uppercase tracking-wider',
          theme === 'dark' ? 'text-neutral-400' : 'text-neutral-500',
        )}>
          Properties
        </span>
        <button
          onClick={() => setMetadataPanelCollapsed(true)}
          className="rounded p-1 text-neutral-400 hover:text-neutral-100"
          title="Collapse properties panel"
        >
          <PanelRight className="h-4 w-4" />
        </button>
      </div>

      {activeTab ? (
        <div className="flex flex-col gap-4 p-3">
          <DocumentProperties documentId={activeTab.documentId} />
          <div className={cn('border-t', theme === 'dark' ? 'border-neutral-800' : 'border-neutral-200')} />
          <TagEditor documentId={activeTab.documentId} />
          <div className={cn('border-t', theme === 'dark' ? 'border-neutral-800' : 'border-neutral-200')} />
          <VersionHistory documentId={activeTab.documentId} />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-center text-xs text-neutral-500">Open a document to view its properties</p>
        </div>
      )}
    </div>
  )
}
