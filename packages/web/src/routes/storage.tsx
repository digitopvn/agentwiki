/** Storage page: folder tree sidebar + file browser with breadcrumbs */

import { useState, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAppStore } from '../stores/app-store'
import { useStorageFolderTree, useStorageFiles } from '../hooks/use-storage'
import { StorageSidebar } from '../components/storage/storage-sidebar'
import { StorageBreadcrumb } from '../components/storage/storage-breadcrumb'
import { StorageToolbar } from '../components/storage/storage-toolbar'
import { StorageFileGrid } from '../components/storage/storage-file-grid'
import { StorageBulkBar } from '../components/storage/storage-bulk-bar'
import { cn } from '../lib/utils'
import type { StorageFolderTree as FolderTree } from '@agentwiki/shared'

/** Find direct child folders of a given parent in the tree */
function findChildFolders(tree: FolderTree[], parentId: string | null): FolderTree[] {
  if (parentId === null) return tree
  for (const node of tree) {
    if (node.id === parentId) return node.children
    const found = findChildFolders(node.children, parentId)
    if (found.length) return found
  }
  return []
}

export function StoragePage() {
  const { folderId: paramFolderId } = useParams<{ folderId?: string }>()
  const navigate = useNavigate()
  const { theme } = useAppStore()

  const currentFolderId = paramFolderId ?? null
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data: folderData } = useStorageFolderTree()
  const { data: fileData, isLoading: filesLoading } = useStorageFiles(currentFolderId)

  const folders: FolderTree[] = folderData?.folders ?? []
  const files = fileData?.files ?? []
  const subfolders = findChildFolders(folders, currentFolderId)

  // Clear selection on folder change
  useEffect(() => { setSelectedIds(new Set()) }, [currentFolderId])

  const handleSelectFolder = useCallback(
    (id: string | null) => {
      navigate(id ? `/storage/${id}` : '/storage')
    },
    [navigate],
  )

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Responsive: auto-switch to list on small screens
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const handler = (e: MediaQueryListEvent) => setViewMode(e.matches ? 'list' : 'grid')
    if (mq.matches) setViewMode('list')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return (
    <div className={cn('flex h-screen overflow-hidden', theme === 'dark' ? 'bg-neutral-950 text-neutral-100' : 'bg-white text-neutral-900')}>
      <StorageSidebar
        currentFolderId={currentFolderId}
        onSelectFolder={handleSelectFolder}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main content */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <StorageBreadcrumb folderTree={folders} currentFolderId={currentFolderId} onNavigate={handleSelectFolder} />
        <StorageToolbar
          currentFolderId={currentFolderId}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          fileCount={files.length}
        />

        {filesLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-700 border-t-blue-500" />
          </div>
        ) : (
          <StorageFileGrid
            files={files}
            subfolders={subfolders}
            viewMode={viewMode}
            searchQuery={searchQuery}
            onNavigateFolder={handleSelectFolder}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        )}

        <StorageBulkBar
          selectedFileIds={Array.from(selectedIds)}
          selectedFolderIds={[]}
          onClearSelection={() => setSelectedIds(new Set())}
        />
      </div>
    </div>
  )
}
