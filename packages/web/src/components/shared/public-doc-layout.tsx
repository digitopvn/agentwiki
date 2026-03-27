/** Shared layout for public document views (share links and published docs) */

import { useEffect } from 'react'
import { MarkdownRenderer } from './markdown-renderer'

interface PublicDocLayoutProps {
  title: string
  content: string
  category?: string
  label: string
  isLoading: boolean
  error: boolean
}

/** Reusable layout wrapper for public/shared document pages */
export function PublicDocLayout({ title, content, category, label, isLoading, error }: PublicDocLayoutProps) {
  useEffect(() => {
    if (title) document.title = `${title} · AgentWiki`
    return () => { document.title = 'AgentWiki' }
  }, [title])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-0">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-800 border-t-brand-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-surface-0">
        <p className="text-sm text-neutral-400">This {label.toLowerCase()} is invalid or has expired.</p>
        <a href="/" className="text-xs text-brand-400 hover:underline">Go to AgentWiki</a>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-surface-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-8 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-brand-700">
            <span className="text-[9px] font-bold text-white">A</span>
          </div>
          <span className="text-sm font-semibold text-neutral-200">AgentWiki</span>
          <span className="text-xs text-neutral-600">· {label}</span>
        </div>
        {category && (
          <span className="rounded-full bg-surface-3 px-2.5 py-0.5 text-[11px] text-neutral-400">{category}</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-6 text-3xl font-bold text-neutral-100">{title}</h1>
          <MarkdownRenderer content={content} />
        </div>
      </div>
    </div>
  )
}
