/** Cmd/Ctrl+K command palette: autocomplete suggestions, hybrid search, recent docs, quick actions */

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import { Search, FileText, Plus, FolderPlus, X, Clock, Sparkles, History } from 'lucide-react'
import { useDocuments, useCreateDocument } from '../../hooks/use-documents'
import { useSearch, useSuggest } from '../../hooks/use-search'
import { useDebounce } from '../../hooks/use-debounce'
import { useCreateFolder } from '../../hooks/use-folders'
import { useAppStore } from '../../stores/app-store'
import { cn } from '../../lib/utils'

export function CommandPalette() {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query.trim(), 250)
  const debouncedSuggestQuery = useDebounce(query.trim(), 150)

  const { theme, openTab, setActiveTab, commandPaletteOpen: open, setCommandPaletteOpen: setOpen } = useAppStore()
  const navigate = useNavigate()

  // Autocomplete suggestions (faster debounce, >= 1 char)
  const { data: suggestData } = useSuggest(debouncedSuggestQuery)
  // Hybrid search for typed queries (>= 2 chars)
  const { data: searchData } = useSearch(debouncedQuery)
  // Recent docs when no query
  const { data: recentData } = useDocuments({ limit: 5 })
  const createDocument = useCreateDocument()
  const createFolder = useCreateFolder()

  const isDark = theme === 'dark'

  // Toggle on Ctrl+K / Cmd+K
  const toggleCommandPalette = useAppStore((s) => s.toggleCommandPalette)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      toggleCommandPalette()
    }
    if (e.key === 'Escape') setOpen(false)
  }, [toggleCommandPalette, setOpen])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const openDocument = (doc: { id: string; title: string; slug: string }) => {
    const tabId = `tab-${doc.id}`
    openTab({ id: tabId, documentId: doc.id, title: doc.title })
    setActiveTab(tabId)
    navigate(`/doc/${doc.slug}`)
    setOpen(false)
    setQuery('')
  }

  const handleSuggestionClick = (item: { text: string; documentId?: string; slug?: string; source: string }) => {
    if (item.documentId && item.slug) {
      // Title or fuzzy suggestion — navigate directly
      openDocument({ id: item.documentId, title: item.text, slug: item.slug })
    } else {
      // History suggestion — fill search input to trigger full search
      setQuery(item.text)
    }
  }

  const handleNewDoc = async () => {
    setOpen(false)
    try {
      const doc = await createDocument.mutateAsync({ title: query.trim() || 'Untitled' })
      const tabId = `tab-${doc.id}`
      openTab({ id: tabId, documentId: doc.id, title: doc.title })
      setActiveTab(tabId)
      navigate(`/doc/${doc.slug}`)
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

  const suggestions = suggestData?.suggestions ?? []
  const searchResults = searchData?.results ?? []
  const recentDocs = recentData?.data ?? []
  const showSuggestions = debouncedSuggestQuery.length >= 1 && suggestions.length > 0
  const showSearch = debouncedQuery.length >= 2 && searchResults.length > 0
  const showRecent = !showSuggestions && !showSearch && recentDocs.length > 0

  /** Icon for suggestion source type */
  const suggestIcon = (source: string) => {
    if (source === 'history') return <History className="h-3.5 w-3.5" />
    if (source === 'fuzzy') return <Sparkles className="h-3.5 w-3.5" />
    return <FileText className="h-3.5 w-3.5" />
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh] md:px-0 md:pt-[20vh]"
      onClick={() => setOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className={cn(
          'relative w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl',
          isDark ? 'border-white/[0.08] bg-surface-2' : 'border-neutral-200 bg-white',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false}>
          {/* Search input */}
          <div
            className={cn(
              'flex items-center gap-2 border-b px-4 py-3',
              isDark ? 'border-white/[0.06]' : 'border-neutral-200',
            )}
          >
            <Search className={cn('h-4 w-4 shrink-0', isDark ? 'text-neutral-500' : 'text-neutral-400')} />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search documents or type a command..."
              className={cn(
                'flex-1 bg-transparent text-base outline-none md:text-sm',
                isDark ? 'text-neutral-100 placeholder-neutral-500' : 'text-neutral-900 placeholder-neutral-400',
              )}
              autoFocus
            />
            <button
              onClick={() => setOpen(false)}
              className={cn(
                'cursor-pointer rounded-md p-0.5',
                isDark ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-400 hover:text-neutral-600',
              )}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty
              className={cn('px-3 py-6 text-center text-sm', isDark ? 'text-neutral-500' : 'text-neutral-400')}
            >
              No results found.
            </Command.Empty>

            {/* Quick actions */}
            <Command.Group
              heading={
                <span className={cn('px-2 py-1 text-[11px] font-semibold uppercase tracking-wider', isDark ? 'text-neutral-600' : 'text-neutral-400')}>
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

            {/* Autocomplete suggestions */}
            {showSuggestions && (
              <Command.Group
                heading={
                  <span className={cn('px-2 py-1 text-[11px] font-semibold uppercase tracking-wider', isDark ? 'text-neutral-600' : 'text-neutral-400')}>
                    Suggestions
                  </span>
                }
              >
                {suggestions.map((item, idx) => (
                  <CommandItem
                    key={`suggest-${idx}`}
                    icon={suggestIcon(item.source)}
                    label={item.text}
                    sublabel={item.source === 'fuzzy' ? 'fuzzy match' : item.source === 'history' ? 'recent search' : undefined}
                    accuracy={item.accuracy}
                    onSelect={() => handleSuggestionClick(item)}
                    isDark={isDark}
                  />
                ))}
              </Command.Group>
            )}

            {/* Search results */}
            {showSearch && (
              <Command.Group
                heading={
                  <span className={cn('px-2 py-1 text-[11px] font-semibold uppercase tracking-wider', isDark ? 'text-neutral-600' : 'text-neutral-400')}>
                    Search results
                  </span>
                }
              >
                {searchResults.map((result) => (
                  <CommandItem
                    key={result.id}
                    icon={<FileText className="h-3.5 w-3.5" />}
                    label={result.title}
                    sublabel={result.snippet ?? result.category ?? undefined}
                    accuracy={result.accuracy}
                    onSelect={() => openDocument(result)}
                    isDark={isDark}
                  />
                ))}
              </Command.Group>
            )}

            {/* Recent documents (when no search query) */}
            {showRecent && (
              <Command.Group
                heading={
                  <span className={cn('px-2 py-1 text-[11px] font-semibold uppercase tracking-wider', isDark ? 'text-neutral-600' : 'text-neutral-400')}>
                    Recent
                  </span>
                }
              >
                {recentDocs.map((doc) => (
                  <CommandItem
                    key={doc.id}
                    icon={<Clock className="h-3.5 w-3.5" />}
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
          <div
            className={cn(
              'flex justify-end border-t px-3 py-2',
              isDark ? 'border-white/[0.06]' : 'border-neutral-200',
            )}
          >
            <span className={cn('text-[11px]', isDark ? 'text-neutral-600' : 'text-neutral-400')}>
              ↑↓ navigate · Enter select · Esc close
            </span>
          </div>
        </Command>
      </div>
    </div>
  )
}

function AccuracyBadge({ value, isDark }: { value: number; isDark: boolean }) {
  const color =
    value >= 80
      ? 'text-emerald-400 bg-emerald-500/10'
      : value >= 50
        ? 'text-amber-400 bg-amber-500/10'
        : isDark
          ? 'text-neutral-500 bg-neutral-500/10'
          : 'text-neutral-400 bg-neutral-400/10'

  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums group-aria-selected:bg-white/20 group-aria-selected:text-white',
        color,
      )}
    >
      {value}%
    </span>
  )
}

function CommandItem({
  icon,
  label,
  sublabel,
  accuracy,
  onSelect,
  isDark,
}: {
  icon: React.ReactNode
  label: string
  sublabel?: string
  accuracy?: number
  onSelect: () => void
  isDark: boolean
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className={cn(
        'group flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm aria-selected:bg-brand-600 aria-selected:text-white',
        isDark ? 'text-neutral-300 hover:bg-surface-3' : 'text-neutral-700 hover:bg-neutral-50',
      )}
    >
      <span className="shrink-0 text-neutral-500 aria-selected:text-white">{icon}</span>
      <div className="flex-1 truncate">
        <span>{label}</span>
        {sublabel && (
          <span className={cn('ml-2 text-xs', isDark ? 'text-neutral-500' : 'text-neutral-400')}>{sublabel}</span>
        )}
      </div>
      {accuracy != null && <AccuracyBadge value={accuracy} isDark={isDark} />}
    </Command.Item>
  )
}
