/** Empty state shown when no document tab is open */

import { BookOpen, Plus, Search } from 'lucide-react'
import { useAppStore } from '../../stores/app-store'
import { useCreateDocument } from '../../hooks/use-documents'

export function WelcomeScreen() {
  const { theme, openTab, setActiveTab } = useAppStore()
  const createDocument = useCreateDocument()

  const handleNewDoc = async () => {
    try {
      const doc = await createDocument.mutateAsync({ title: 'Untitled' })
      const tabId = `tab-${doc.id}`
      openTab({ id: tabId, documentId: doc.id, title: doc.title })
      setActiveTab(tabId)
    } catch (err) {
      console.error('Failed to create document:', err)
    }
  }

  const isDark = theme === 'dark'

  return (
    <div
      className={`flex h-full flex-col items-center justify-center gap-6 ${
        isDark ? 'bg-neutral-950 text-neutral-100' : 'bg-white text-neutral-900'
      }`}
    >
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/10">
          <BookOpen className="h-7 w-7 text-blue-500" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold">Welcome to AgentWiki</h2>
          <p className={`mt-1 text-sm ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
            Open a document from the sidebar or create a new one
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleNewDoc}
          disabled={createDocument.isPending}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          New document
        </button>
        <button
          onClick={() => {
            // Trigger command palette via keyboard shortcut simulation
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
          }}
          className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium ${
            isDark
              ? 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'
              : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          <Search className="h-4 w-4" />
          Search docs
        </button>
      </div>

      <div className={`text-xs ${isDark ? 'text-neutral-600' : 'text-neutral-400'}`}>
        Press <kbd className={`rounded px-1 py-0.5 font-mono text-xs ${isDark ? 'bg-neutral-800' : 'bg-neutral-100'}`}>Ctrl+K</kbd> to open command palette
      </div>
    </div>
  )
}
