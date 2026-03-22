/** Left sidebar panel: folder tree, browse, search, theme toggle, user menu */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Sun, Moon, PanelLeftClose, PanelLeft, FolderPlus, Filter, Settings, User, X, HardDrive, Network } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../stores/app-store'
import { useIsMobile } from '../../hooks/use-is-mobile'
import { useAuth } from '../../hooks/use-auth'
import { FolderTree } from '../sidebar/folder-tree'
import { BrowsePanel, type BrowseFilter } from '../sidebar/browse-panel'
import { CreateFolderModal } from '../sidebar/create-folder-modal'
import { useCreateFolder } from '../../hooks/use-folders'
import { useCreateDocument, useDocuments } from '../../hooks/use-documents'
import { FileText } from 'lucide-react'

export function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed, theme, toggleTheme, setMobileSidebarOpen, toggleStorageDrawer } = useAppStore()
  const [search, setSearch] = useState('')
  const [showBrowse, setShowBrowse] = useState(false)
  const [folderModalOpen, setFolderModalOpen] = useState(false)
  const [browseFilter, setBrowseFilter] = useState<BrowseFilter | null>(null)
  const createFolder = useCreateFolder()
  const createDocument = useCreateDocument()
  const { openTab, setActiveTab } = useAppStore()
  const { user } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

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
      if (isMobile) setMobileSidebarOpen(false)
    } catch (err) {
      console.error('Failed to create document:', err)
    }
  }

  const handleNewFolder = async (name: string) => {
    try {
      await createFolder.mutateAsync({ name })
    } catch (err) {
      console.error('Failed to create folder:', err)
    }
  }

  const handleOpenDoc = (doc: { id: string; title: string; slug: string }) => {
    const tabId = `tab-${doc.id}`
    openTab({ id: tabId, documentId: doc.id, title: doc.title })
    setActiveTab(tabId)
    navigate(`/doc/${doc.slug}`)
    if (isMobile) setMobileSidebarOpen(false)
  }

  // On desktop, show collapsed state
  if (!isMobile && sidebarCollapsed) {
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
        'flex h-full shrink-0 flex-col border-r',
        isMobile ? 'w-full' : 'w-[260px]',
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
        {isMobile ? (
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className={cn(
              'rounded-lg p-2',
              isDark ? 'text-neutral-500 active:bg-surface-3' : 'text-neutral-400 active:bg-neutral-100',
            )}
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        ) : (
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
        )}
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
              'w-full rounded-lg border py-2 pl-8 pr-3 text-base outline-none md:py-1.5 md:text-xs',
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
            'flex flex-1 items-center gap-1.5 rounded-lg px-2 py-2.5 text-sm font-medium md:py-1.5 md:text-xs',
            isDark
              ? 'text-neutral-400 hover:bg-surface-3 hover:text-neutral-200 active:bg-surface-3'
              : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 active:bg-neutral-100',
          )}
        >
          <Plus className="h-4 w-4 md:h-3.5 md:w-3.5" />
          New doc
        </button>
        <button
          onClick={() => setFolderModalOpen(true)}
          disabled={createFolder.isPending}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-2 py-2.5 text-sm md:py-1.5 md:text-xs',
            isDark
              ? 'text-neutral-400 hover:bg-surface-3 hover:text-neutral-200 active:bg-surface-3'
              : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 active:bg-neutral-100',
          )}
        >
          <FolderPlus className="h-4 w-4 md:h-3.5 md:w-3.5" />
        </button>
        <button
          onClick={() => { setShowBrowse((v) => !v); if (showBrowse) setBrowseFilter(null) }}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-2 py-2.5 text-sm md:py-1.5 md:text-xs',
            showBrowse
              ? 'bg-brand-600 text-white'
              : isDark
                ? 'text-neutral-400 hover:bg-surface-3 hover:text-neutral-200 active:bg-surface-3'
                : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 active:bg-neutral-100',
          )}
          title="Browse by tags/categories"
        >
          <Filter className="h-4 w-4 md:h-3.5 md:w-3.5" />
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
                  'flex items-center gap-2 rounded-lg px-2 py-2.5 text-sm md:py-1 md:text-xs',
                  isDark
                    ? 'text-neutral-400 hover:bg-surface-3 hover:text-neutral-200 active:bg-surface-3'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800 active:bg-neutral-100',
                )}
                onClick={() => handleOpenDoc(doc)}
              >
                <FileText className="h-4 w-4 shrink-0 text-neutral-500 md:h-3.5 md:w-3.5" />
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
          <FolderTree searchQuery={search} onDocumentOpen={isMobile ? () => setMobileSidebarOpen(false) : undefined} />
        )}
      </div>

      {/* Storage + Graph buttons */}
      <div className={cn('border-t px-2 py-1.5 space-y-0.5', isDark ? 'border-white/[0.06]' : 'border-neutral-200')}>
        <button
          onClick={toggleStorageDrawer}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm md:py-1.5 md:text-xs',
            isDark
              ? 'text-neutral-400 hover:bg-surface-3 hover:text-neutral-200'
              : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800',
          )}
        >
          <HardDrive className="h-4 w-4 md:h-3.5 md:w-3.5" />
          Storage
        </button>
        <button
          onClick={() => { navigate('/graph'); if (isMobile) setMobileSidebarOpen(false) }}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm md:py-1.5 md:text-xs',
            isDark
              ? 'text-neutral-400 hover:bg-surface-3 hover:text-neutral-200'
              : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800',
          )}
        >
          <Network className="h-4 w-4 md:h-3.5 md:w-3.5" />
          Knowledge Graph
        </button>
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
            onClick={() => { navigate('/profile'); if (isMobile) setMobileSidebarOpen(false) }}
            className={cn(
              'flex items-center gap-1.5 rounded-md p-2 md:p-1',
              isDark ? 'text-neutral-500 hover:bg-surface-3 hover:text-neutral-300 active:bg-surface-3' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 active:bg-neutral-100',
            )}
            title="Profile"
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-5 w-5 rounded-full" />
            ) : (
              <User className="h-5 w-5 md:h-4 md:w-4" />
            )}
          </button>
          <button
            onClick={() => { navigate('/settings'); if (isMobile) setMobileSidebarOpen(false) }}
            className={cn(
              'rounded-md p-2 md:p-1',
              isDark ? 'text-neutral-500 hover:bg-surface-3 hover:text-neutral-300 active:bg-surface-3' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 active:bg-neutral-100',
            )}
            title="Settings"
          >
            <Settings className="h-5 w-5 md:h-4 md:w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <span className={cn('text-xs', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
            {isDark ? 'Dark' : 'Light'}
          </span>
          <button
            onClick={toggleTheme}
            className={cn(
              'rounded-md p-2 md:p-1',
              isDark ? 'text-neutral-500 hover:bg-surface-3 hover:text-neutral-300 active:bg-surface-3' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 active:bg-neutral-100',
            )}
            title="Toggle theme"
          >
            {isDark ? <Sun className="h-5 w-5 md:h-4 md:w-4" /> : <Moon className="h-5 w-5 md:h-4 md:w-4" />}
          </button>
        </div>
      </div>

      <CreateFolderModal
        open={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        onSubmit={handleNewFolder}
      />
    </div>
  )
}
