/** Left sidebar panel: folder tree, browse, search, theme toggle, user menu */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Sun, Moon, PanelLeftClose, PanelLeft, FolderPlus, Filter, Settings, User } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../stores/app-store'
import { useAuth } from '../../hooks/use-auth'
import { FolderTree } from '../sidebar/folder-tree'
import { BrowsePanel, type BrowseFilter } from '../sidebar/browse-panel'
import { useCreateFolder } from '../../hooks/use-folders'
import { useCreateDocument, useDocuments } from '../../hooks/use-documents'
import { FileText } from 'lucide-react'

export function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed, theme, toggleTheme } = useAppStore()
  const [search, setSearch] = useState('')
  const [showBrowse, setShowBrowse] = useState(false)
  const [browseFilter, setBrowseFilter] = useState<BrowseFilter | null>(null)
  const createFolder = useCreateFolder()
  const createDocument = useCreateDocument()
  const { openTab, setActiveTab } = useAppStore()
  const { user } = useAuth()
  const navigate = useNavigate()

  const isDark = theme === 'dark'

  // Filtered docs when browse filter active
  const filterParams = browseFilter
    ? browseFilter.type === 'category'
      ? { category: browseFilter.value }
      : { tag: browseFilter.value }
    : {}
  const { data: filteredData } = useDocuments(browseFilter ? filterParams : { limit: 0 })

  const handleNewDocument = async () => {
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

  const handleNewFolder = async () => {
    const name = window.prompt('Folder name:')
    if (!name?.trim()) return
    try {
      await createFolder.mutateAsync({ name: name.trim() })
    } catch (err) {
      console.error('Failed to create folder:', err)
    }
  }

  if (sidebarCollapsed) {
    return (
      <div
        className={cn(
          'flex w-10 flex-col items-center border-r py-3',
          isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-white',
        )}
      >
        <button
          onClick={() => setSidebarCollapsed(false)}
          className={cn(
            'cursor-pointer rounded-md p-1.5',
            isDark ? 'text-neutral-500 hover:bg-surface-3 hover:text-neutral-300' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700',
          )}
          title="Expand sidebar"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex w-[260px] shrink-0 flex-col border-r',
        isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-white',
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center justify-between px-3 py-3 border-b',
          isDark ? 'border-white/[0.06]' : 'border-neutral-200',
        )}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-brand-700">
            <span className="text-[10px] font-bold text-white">A</span>
          </div>
          <span className={cn('text-sm font-semibold tracking-tight', isDark ? 'text-neutral-100' : 'text-neutral-900')}>
            AgentWiki
          </span>
        </div>
        <button
          onClick={() => setSidebarCollapsed(true)}
          className={cn(
            'cursor-pointer rounded-md p-1',
            isDark ? 'text-neutral-500 hover:bg-surface-3 hover:text-neutral-300' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700',
          )}
          title="Collapse sidebar"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-2 py-2">
        <div className="relative">
          <Search className={cn('absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2', isDark ? 'text-neutral-500' : 'text-neutral-400')} />
          <input
            type="text"
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              'w-full rounded-lg border py-1.5 pl-8 pr-3 text-xs outline-none',
              isDark
                ? 'border-white/[0.06] bg-surface-2 text-neutral-200 placeholder-neutral-500 focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/30'
                : 'border-neutral-200 bg-neutral-50 text-neutral-900 placeholder-neutral-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30',
            )}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-1 px-2 py-1">
        <button
          onClick={handleNewDocument}
          disabled={createDocument.isPending}
          className={cn(
            'flex flex-1 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium',
            isDark
              ? 'text-neutral-400 hover:bg-surface-3 hover:text-neutral-200'
              : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800',
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          New doc
        </button>
        <button
          onClick={handleNewFolder}
          disabled={createFolder.isPending}
          className={cn(
            'flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs',
            isDark
              ? 'text-neutral-400 hover:bg-surface-3 hover:text-neutral-200'
              : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800',
          )}
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => { setShowBrowse((v) => !v); if (showBrowse) setBrowseFilter(null) }}
          className={cn(
            'flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs',
            showBrowse
              ? 'bg-brand-600 text-white'
              : isDark
                ? 'text-neutral-400 hover:bg-surface-3 hover:text-neutral-200'
                : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800',
          )}
          title="Browse by tags/categories"
        >
          <Filter className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Browse panel */}
      {showBrowse && (
        <div className={cn('border-b pb-2', isDark ? 'border-white/[0.06]' : 'border-neutral-200')}>
          <BrowsePanel
            activeFilter={browseFilter}
            onSelectFilter={setBrowseFilter}
            onClearFilter={() => setBrowseFilter(null)}
          />
        </div>
      )}

      {/* Folder tree or filtered results */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {browseFilter ? (
          <div className="space-y-0.5">
            {(filteredData?.data ?? []).map((doc) => (
              <div
                key={doc.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs',
                  isDark
                    ? 'text-neutral-400 hover:bg-surface-3 hover:text-neutral-200'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800',
                )}
                onClick={() => {
                  const tabId = `tab-${doc.id}`
                  openTab({ id: tabId, documentId: doc.id, title: doc.title })
                  setActiveTab(tabId)
                  navigate(`/doc/${doc.slug}`)
                }}
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
                <span className="truncate">{doc.title}</span>
              </div>
            ))}
            {(filteredData?.data ?? []).length === 0 && (
              <p className={cn('px-2 py-4 text-center text-xs', isDark ? 'text-neutral-600' : 'text-neutral-400')}>
                No documents found
              </p>
            )}
          </div>
        ) : (
          <FolderTree searchQuery={search} />
        )}
      </div>

      {/* Footer: user menu + theme toggle */}
      <div
        className={cn(
          'flex items-center justify-between border-t px-3 py-2',
          isDark ? 'border-white/[0.06]' : 'border-neutral-200',
        )}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/profile')}
            className={cn(
              'flex cursor-pointer items-center gap-1.5 rounded-md p-1',
              isDark ? 'text-neutral-500 hover:bg-surface-3 hover:text-neutral-300' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700',
            )}
            title="Profile"
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-5 w-5 rounded-full" />
            ) : (
              <User className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={() => navigate('/settings')}
            className={cn(
              'cursor-pointer rounded-md p-1',
              isDark ? 'text-neutral-500 hover:bg-surface-3 hover:text-neutral-300' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700',
            )}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <span className={cn('text-xs', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
            {isDark ? 'Dark' : 'Light'}
          </span>
          <button
            onClick={toggleTheme}
            className={cn(
              'cursor-pointer rounded-md p-1',
              isDark ? 'text-neutral-500 hover:bg-surface-3 hover:text-neutral-300' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700',
            )}
            title="Toggle theme"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}
