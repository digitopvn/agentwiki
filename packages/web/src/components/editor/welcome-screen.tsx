/** Empty state shown when no document tab is open */

import { useNavigate } from 'react-router-dom'
import { BookOpen, Plus, Search, Sparkles } from 'lucide-react'
import { useAppStore } from '../../stores/app-store'
import { useCreateDocument } from '../../hooks/use-documents'

export function WelcomeScreen() {
  const { theme, openTab, setActiveTab } = useAppStore()
  const createDocument = useCreateDocument()
  const navigate = useNavigate()

  const handleNewDoc = async () => {
    try {
      const doc = await createDocument.mutateAsync({ title: 'Untitled' })
      const tabId = `tab-${doc.id}`
      openTab({ id: tabId, documentId: doc.id, title: doc.title })
      setActiveTab(tabId)
      navigate(`/doc/${doc.slug}`)
    } catch (err) {
      console.error('Failed to create document:', err)
    }
  }

  const isDark = theme === 'dark'

  return (
    <div
      className={`relative flex h-full flex-col items-center justify-center gap-8 overflow-hidden ${
        isDark ? 'bg-surface-0 text-neutral-100' : 'bg-neutral-50 text-neutral-900'
      }`}
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute top-1/4 left-1/2 h-[300px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600/5 blur-[100px]" />

      <div className="relative z-10 flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500/15 to-brand-700/15 ring-1 ring-brand-500/20">
          <BookOpen className="h-8 w-8 text-brand-400" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-semibold tracking-tight">Welcome to AgentWiki</h2>
          <p className={`mt-2 max-w-xs text-sm leading-relaxed ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
            Open a document from the sidebar or create a new one to get started
          </p>
        </div>
      </div>

      <div className="relative z-10 flex flex-col gap-3 px-6 sm:flex-row sm:px-0">
        <button
          onClick={handleNewDoc}
          disabled={createDocument.isPending}
          className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-brand-600/20 hover:bg-brand-500 active:bg-brand-500 disabled:opacity-50 sm:py-2.5"
        >
          <Plus className="h-4 w-4" />
          New document
        </button>
        <button
          onClick={() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
          }}
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-medium sm:py-2.5 ${
            isDark
              ? 'border-white/[0.08] text-neutral-300 hover:bg-surface-2 active:bg-surface-2'
              : 'border-neutral-200 text-neutral-700 hover:bg-white active:bg-white'
          }`}
        >
          <Search className="h-4 w-4" />
          Search docs
        </button>
      </div>

      {/* Quick tips — hidden on mobile (keyboard shortcuts not relevant) */}
      <div className="relative z-10 hidden items-center gap-2 md:flex">
        <Sparkles className={`h-3 w-3 ${isDark ? 'text-neutral-600' : 'text-neutral-400'}`} />
        <span className={`text-xs ${isDark ? 'text-neutral-600' : 'text-neutral-400'}`}>
          Press{' '}
          <kbd
            className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ${
              isDark ? 'bg-surface-3 text-neutral-400' : 'bg-neutral-100 text-neutral-500'
            }`}
          >
            Ctrl+K
          </kbd>{' '}
          to open command palette
        </span>
      </div>
    </div>
  )
}
