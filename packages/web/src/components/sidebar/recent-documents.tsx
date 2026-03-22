/** Collapsible section showing recently modified documents */

import { useNavigate } from 'react-router-dom'
import { ChevronRight, Clock, FileText } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../stores/app-store'
import { useDocuments } from '../../hooks/use-documents'
import { usePreferences, useSetPreference } from '../../hooks/use-preferences'

/** Format a date as relative time (e.g., "2m ago", "1h ago", "3d ago") */
function relativeTime(date: Date | string): string {
  const now = Date.now()
  const then = new Date(date).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 30) return `${diffDay}d ago`
  return new Date(date).toLocaleDateString()
}

interface RecentDocumentsProps {
  onDocumentOpen?: () => void
}

export function RecentDocuments({ onDocumentOpen }: RecentDocumentsProps) {
  const { data: prefs } = usePreferences()
  const setPref = useSetPreference()
  const expanded = prefs?.sidebar_recent_collapsed !== 'true'

  const { data } = useDocuments({ limit: 10, sort: 'updatedAt', order: 'desc' })
  const { theme, openTab, setActiveTab } = useAppStore()
  const navigate = useNavigate()

  const isDark = theme === 'dark'
  const docs = data?.data ?? []

  if (docs.length === 0) return null

  const toggleExpanded = () => {
    setPref.mutate({
      key: 'sidebar_recent_collapsed',
      value: expanded ? 'true' : 'false',
    })
  }

  const handleOpenDoc = (doc: { id: string; title: string; slug: string }) => {
    const tabId = `tab-${doc.id}`
    openTab({ id: tabId, documentId: doc.id, title: doc.title })
    setActiveTab(tabId)
    navigate(`/doc/${doc.slug}`)
    onDocumentOpen?.()
  }

  return (
    <div className={cn('border-b', isDark ? 'border-white/[0.06]' : 'border-neutral-200')}>
      {/* Header */}
      <button
        onClick={toggleExpanded}
        className={cn(
          'flex w-full items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider',
          isDark ? 'text-neutral-500 hover:text-neutral-400' : 'text-neutral-400 hover:text-neutral-600',
        )}
      >
        <ChevronRight
          className={cn('h-2.5 w-2.5 transition-transform duration-150', expanded && 'rotate-90')}
        />
        <Clock className="h-2.5 w-2.5" />
        Recent
      </button>

      {/* Document list */}
      {expanded && (
        <div className="space-y-0.5 px-1 pb-1.5">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs',
                isDark
                  ? 'text-neutral-400 hover:bg-surface-3 hover:text-neutral-200'
                  : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800',
              )}
              onClick={() => handleOpenDoc(doc)}
            >
              <FileText className="h-3 w-3 shrink-0 text-neutral-500" />
              <span className="min-w-0 flex-1 truncate">{doc.title}</span>
              <span
                className={cn('shrink-0 text-[10px]', isDark ? 'text-neutral-600' : 'text-neutral-400')}
              >
                {relativeTime(doc.updatedAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
