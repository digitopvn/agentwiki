/** Storage folder tree sidebar */

import { useState } from 'react'
import { FolderPlus, HardDrive, ChevronLeft } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../stores/app-store'
import { useStorageFolderTree, useCreateStorageFolder } from '../../hooks/use-storage'
import { StorageFolderNode } from './storage-folder-node'
import type { StorageFolderTree } from '@agentwiki/shared'

interface Props {
  currentFolderId: string | null
  onSelectFolder: (id: string | null) => void
  collapsed: boolean
  onToggleCollapse: () => void
}

export function StorageSidebar({ currentFolderId, onSelectFolder, collapsed, onToggleCollapse }: Props) {
  const { theme } = useAppStore()
  const { data, isLoading } = useStorageFolderTree()
  const createFolder = useCreateStorageFolder()

  const handleNewFolder = async () => {
    const name = window.prompt('Folder name:')
    if (!name?.trim()) return
    try {
      await createFolder.mutateAsync({ name: name.trim(), parentId: currentFolderId })
    } catch (err) {
      console.error('Failed to create folder:', err)
    }
  }

  if (collapsed) {
    return (
      <div className="flex w-10 flex-col items-center border-r border-neutral-800 bg-neutral-900 py-3">
        <button onClick={onToggleCollapse} className="rounded p-1 text-neutral-400 hover:text-neutral-100" title="Expand">
          <ChevronLeft className="h-4 w-4 rotate-180" />
        </button>
      </div>
    )
  }

  const folders: StorageFolderTree[] = data?.folders ?? []

  return (
    <div className={cn('flex w-[240px] shrink-0 flex-col border-r', theme === 'dark' ? 'border-neutral-800 bg-neutral-900' : 'border-neutral-200 bg-neutral-50')}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-neutral-800">
        <div className="flex items-center gap-1.5">
          <HardDrive className="h-4 w-4 text-neutral-400" />
          <span className={cn('text-sm font-semibold', theme === 'dark' ? 'text-neutral-100' : 'text-neutral-900')}>Storage</span>
        </div>
        <button onClick={onToggleCollapse} className="rounded p-1 text-neutral-400 hover:text-neutral-100" title="Collapse">
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {/* New folder button */}
      <div className="px-2 py-2">
        <button
          onClick={handleNewFolder}
          disabled={createFolder.isPending}
          className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          New folder
        </button>
      </div>

      {/* Folder tree */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {/* Root (all files) */}
        <button
          onClick={() => onSelectFolder(null)}
          className={cn(
            'flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs',
            currentFolderId === null
              ? 'bg-blue-500/20 text-blue-400'
              : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100',
          )}
        >
          <HardDrive className="h-3.5 w-3.5" />
          All files
        </button>

        {isLoading && <div className="px-2 py-4 text-xs text-neutral-500">Loading...</div>}

        {folders.map((folder) => (
          <StorageFolderNode
            key={folder.id}
            folder={folder}
            depth={0}
            activeFolderId={currentFolderId}
            onSelect={onSelectFolder}
          />
        ))}
      </div>
    </div>
  )
}
