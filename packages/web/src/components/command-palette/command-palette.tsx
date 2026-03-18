/** Cmd/Ctrl+K command palette using cmdk: search documents, quick actions */

import { useEffect, useState, useCallback } from 'react'
import { Command } from 'cmdk'
import { Search, FileText, Plus, FolderPlus, X } from 'lucide-react'
import { useDocuments, useCreateDocument } from '../../hooks/use-documents'
import { useCreateFolder } from '../../hooks/use-folders'
import { useAppStore } from '../../stores/app-store'
import { cn } from '../../lib/utils'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const { theme, openTab, setActiveTab } = useAppStore()
  const { data: docData } = useDocuments({ search: query, limit: 20 })
  const createDocument = useCreateDocument()
  const createFolder = useCreateFolder()

  const isDark = theme === 'dark'

  // Toggle on Ctrl+K / Cmd+K
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      setOpen((v) => !v)
    }
    if (e.key === 'Escape') setOpen(false)
  }, [])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const openDocument = (doc: { id: string; title: string }) => {
    const tabId = `tab-${doc.id}`
    openTab({ id: tabId, documentId: doc.id, title: doc.title })
    setActiveTab(tabId)
    setOpen(false)
    setQuery('')
  }

  const handleNewDoc = async () => {
    setOpen(false)
    try {
      const doc = await createDocument.mutateAsync({ title: query.trim() || 'Untitled' })
      const tabId = `tab-${doc.id}`
      openTab({ id: tabId, documentId: doc.id, title: doc.title })
      setActiveTab(tabId)
    } catch (err) {
      console.error('Failed to create document:', err)
    }
    setQuery('')
  }

  const handleNewFolder = async () => {
    setOpen(false)
    const name = query.trim() || 'New Folder'
    try {
      await createFolder.mutateAsync({ name })
    } catch (err) {
      console.error('Failed to create folder:', err)
    }
    setQuery('')
  }

  if (!open) return null

  const docs = docData?.data ?? []

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={() => setOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className={cn(
          'relative w-full max-w-lg overflow-hidden rounded-xl border shadow-2xl',
          isDark ? 'border-neutral-700 bg-neutral-900' : 'border-neutral-200 bg-white',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false}>
          {/* Search input */}
          <div className={cn('flex items-center gap-2 border-b px-4 py-3', isDark ? 'border-neutral-700' : 'border-neutral-200')}>
            <Search className="h-4 w-4 shrink-0 text-neutral-400" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search documents or type a command..."
              className={cn(
                'flex-1 bg-transparent text-sm outline-none placeholder-neutral-500',
                isDark ? 'text-neutral-100' : 'text-neutral-900',
              )}
              autoFocus
            />
            <button
              onClick={() => setOpen(false)}
              className="rounded p-0.5 text-neutral-400 hover:text-neutral-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className={cn('px-3 py-6 text-center text-sm', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
              No results found.
            </Command.Empty>

            {/* Quick actions */}
            <Command.Group
              heading={
                <span className={cn('px-2 py-1 text-xs font-semibold uppercase tracking-wider', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
                  Actions
                </span>
              }
            >
              <CommandItem
                icon={<Plus className="h-3.5 w-3.5" />}
                label={query ? `Create "${query}"` : 'New document'}
                onSelect={handleNewDoc}
                isDark={isDark}
              />
              <CommandItem
                icon={<FolderPlus className="h-3.5 w-3.5" />}
                label={query ? `New folder "${query}"` : 'New folder'}
                onSelect={handleNewFolder}
                isDark={isDark}
              />
            </Command.Group>

            {/* Documents */}
            {docs.length > 0 && (
              <Command.Group
                heading={
                  <span className={cn('px-2 py-1 text-xs font-semibold uppercase tracking-wider', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
                    Documents
                  </span>
                }
              >
                {docs.map((doc) => (
                  <CommandItem
                    key={doc.id}
                    icon={<FileText className="h-3.5 w-3.5" />}
                    label={doc.title}
                    sublabel={doc.category ?? undefined}
                    onSelect={() => openDocument(doc)}
                    isDark={isDark}
                  />
                ))}
              </Command.Group>
            )}
          </Command.List>

          {/* Footer hint */}
          <div className={cn('flex justify-end border-t px-3 py-2', isDark ? 'border-neutral-700' : 'border-neutral-200')}>
            <span className={cn('text-xs', isDark ? 'text-neutral-600' : 'text-neutral-400')}>
              ↑↓ navigate · Enter select · Esc close
            </span>
          </div>
        </Command>
      </div>
    </div>
  )
}

function CommandItem({
  icon,
  label,
  sublabel,
  onSelect,
  isDark,
}: {
  icon: React.ReactNode
  label: string
  sublabel?: string
  onSelect: () => void
  isDark: boolean
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm aria-selected:bg-blue-600 aria-selected:text-white',
        isDark ? 'text-neutral-200 hover:bg-neutral-800' : 'text-neutral-700 hover:bg-neutral-50',
      )}
    >
      <span className="shrink-0 text-neutral-400 aria-selected:text-white">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {sublabel && (
        <span className="text-xs text-neutral-500">{sublabel}</span>
      )}
    </Command.Item>
  )
}
