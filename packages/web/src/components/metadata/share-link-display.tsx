/** Displays share link for public/specific-users documents with copy button */

import { useEffect } from 'react'
import { Link2, Copy, Check, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../stores/app-store'
import { useShareLinks, useCreateShareLink, useDeleteShareLink } from '../../hooks/use-share-links'

interface ShareLinkDisplayProps {
  documentId: string
}

export function ShareLinkDisplay({ documentId }: ShareLinkDisplayProps) {
  const { theme } = useAppStore()
  const isDark = theme === 'dark'
  const [copied, setCopied] = useState(false)

  const { data: linksData } = useShareLinks(documentId)
  const createLink = useCreateShareLink()
  const deleteLink = useDeleteShareLink()

  const links = linksData?.links ?? []
  const activeLink = links[0]

  // Auto-create share link if none exists
  useEffect(() => {
    if (linksData && links.length === 0 && !createLink.isPending) {
      createLink.mutate({ documentId })
    }
  }, [linksData, links.length])

  const shareUrl = activeLink
    ? `${window.location.origin}/share/${activeLink.token}`
    : null

  const handleCopy = async () => {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRevoke = async () => {
    if (!activeLink) return
    await deleteLink.mutateAsync({ id: activeLink.id, documentId })
  }

  if (!shareUrl) {
    return (
      <div className={cn('mt-2 text-xs', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
        Generating share link...
      </div>
    )
  }

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Link2 className="h-3 w-3 shrink-0 text-brand-400" />
        <span className={cn('text-xs font-medium', isDark ? 'text-neutral-300' : 'text-neutral-600')}>
          Share link
        </span>
      </div>

      <div
        className={cn(
          'flex items-center gap-1 rounded-lg border px-2 py-1.5',
          isDark ? 'border-white/[0.06] bg-surface-3' : 'border-neutral-200 bg-neutral-50',
        )}
      >
        <span className={cn('flex-1 truncate text-[11px]', isDark ? 'text-neutral-400' : 'text-neutral-500')}>
          {shareUrl}
        </span>
        <button
          onClick={handleCopy}
          className={cn(
            'shrink-0 cursor-pointer rounded p-1',
            isDark ? 'text-neutral-400 hover:bg-surface-4 hover:text-neutral-200' : 'text-neutral-400 hover:bg-neutral-200',
          )}
          title="Copy link"
        >
          {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
        </button>
        <button
          onClick={handleRevoke}
          className={cn(
            'shrink-0 cursor-pointer rounded p-1 text-red-400 hover:bg-red-500/10',
          )}
          title="Revoke link"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
