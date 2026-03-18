/** Version history list fetched from GET /api/documents/:id/versions */

import { Clock, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useDocumentVersions } from '../../hooks/use-documents'
import { useAppStore } from '../../stores/app-store'
import { cn } from '../../lib/utils'

interface VersionHistoryProps {
  documentId: string
}

export function VersionHistory({ documentId }: VersionHistoryProps) {
  const { data, isLoading } = useDocumentVersions(documentId)
  const { theme } = useAppStore()
  const [expanded, setExpanded] = useState(false)

  const isDark = theme === 'dark'
  const versions = data?.versions ?? []

  const formatDate = (d: Date | string) =>
    new Date(d).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <Clock className="h-3.5 w-3.5 text-neutral-500" />
        <h3 className={cn('flex-1 text-xs font-semibold uppercase tracking-wider', isDark ? 'text-neutral-400' : 'text-neutral-500')}>
          Version history
        </h3>
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-neutral-500" />
        ) : (
          <ChevronRight className="h-3 w-3 text-neutral-500" />
        )}
      </button>

      {expanded && (
        <div className="space-y-1">
          {isLoading && (
            <div className="space-y-1">
              {[...Array(3)].map((_, i) => (
                <div key={i} className={cn('h-8 animate-pulse rounded', isDark ? 'bg-neutral-800' : 'bg-neutral-100')} />
              ))}
            </div>
          )}

          {!isLoading && versions.length === 0 && (
            <p className={cn('text-xs', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
              No versions yet
            </p>
          )}

          {versions.map((v) => (
            <div
              key={v.id}
              className={cn(
                'rounded px-2 py-1.5 text-xs',
                isDark ? 'bg-neutral-800' : 'bg-neutral-100',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn('font-medium', isDark ? 'text-neutral-200' : 'text-neutral-700')}>
                  v{v.version}
                </span>
                <span className={cn('text-xs', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
                  {formatDate(v.createdAt)}
                </span>
              </div>
              {v.changeSummary && (
                <p className={cn('mt-0.5 truncate', isDark ? 'text-neutral-400' : 'text-neutral-500')}>
                  {v.changeSummary}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
