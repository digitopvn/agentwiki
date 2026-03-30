/** Left sidebar panel: folder tree, search, theme toggle */

import { useState } from 'react'
import { Search, Plus, Sun, Moon, ChevronLeft, FolderPlus, HardDrive } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../stores/app-store'
import { FolderTree } from '../sidebar/folder-tree'
import { useCreateFolder } from '../../hooks/use-folders'
import { useCreateDocument } from '../../hooks/use-documents'

export function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed, theme, toggleTheme } = useAppStore()
  const [search, setSearch] = useState('')
  const createFolder = useCreateFolder()
  const createDocument = useCreateDocument()
  const { openTab, setActiveTab } = useAppStore()
  const navigate = useNavigate()
  const location = useLocation()

  const handleNewDocument = async () => {
    try {
      const doc = await createDocument.mutateAsync({ title: 'Untitled' })
      const tabId = `tab-${doc.id}`
      openTab({ id: tabId, documentId: doc.id, title: doc.title })
      setActiveTab(tabId)
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
      <div className="flex w-10 flex-col items-center border-r border-neutral-800 bg-neutral-900 py-3">
        <button
          onClick={() => setSidebarCollapsed(false)}
          className="rounded p-1 text-neutral-400 hover:text-neutral-100"
          title="Expand sidebar"
        >
          <ChevronLeft className="h-4 w-4 rotate-180" />
        </button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex w-[260px] shrink-0 flex-col border-r border-neutral-800',
        theme === 'dark' ? 'bg-neutral-900' : 'bg-neutral-50',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-neutral-800">
        <span className={cn('text-sm font-semibold', theme === 'dark' ? 'text-neutral-100' : 'text-neutral-900')}>
          AgentWiki
        </span>
        <button
          onClick={() => setSidebarCollapsed(true)}
          className="rounded p-1 text-neutral-400 hover:text-neutral-100"
          title="Collapse sidebar"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-2 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              'w-full rounded-md border py-1.5 pl-7 pr-3 text-xs outline-none focus:ring-1 focus:ring-blue-500',
              theme === 'dark'
                ? 'border-neutral-700 bg-neutral-800 text-neutral-100 placeholder-neutral-500'
                : 'border-neutral-300 bg-white text-neutral-900 placeholder-neutral-400',
            )}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-1 px-2 py-1">
        <button
          onClick={handleNewDocument}
          disabled={createDocument.isPending}
          className="flex flex-1 items-center gap-1.5 rounded px-2 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
        >
          <Plus className="h-3.5 w-3.5" />
          New doc
        </button>
        <button
          onClick={handleNewFolder}
          disabled={createFolder.isPending}
          className="flex items-center gap-1.5 rounded px-2 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Storage link */}
      <div className="px-2 pb-1">
        <button
          onClick={() => navigate('/storage')}
          className={cn(
            'flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs',
            location.pathname.startsWith('/storage')
              ? 'bg-blue-500/20 text-blue-400'
              : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100',
          )}
        >
          <HardDrive className="h-3.5 w-3.5" />
          Storage
        </button>
      </div>

      {/* Folder tree */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        <FolderTree searchQuery={search} />
      </div>

      {/* Footer: theme toggle */}
      <div className="flex items-center justify-between border-t border-neutral-800 px-3 py-2">
        <span className="text-xs text-neutral-500">
          {theme === 'dark' ? 'Dark' : 'Light'} mode
        </span>
        <button
          onClick={toggleTheme}
          className="rounded p-1 text-neutral-400 hover:text-neutral-100"
          title="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
