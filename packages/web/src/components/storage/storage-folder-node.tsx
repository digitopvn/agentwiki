/** Recursive storage folder tree node */

import { useState } from 'react'
import { Folder, FolderOpen, ChevronRight, MoreHorizontal, Pencil, Trash2, FolderPlus } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useCreateStorageFolder, useUpdateStorageFolder, useDeleteStorageFolder } from '../../hooks/use-storage'
import type { StorageFolderTree } from '@agentwiki/shared'

interface Props {
  folder: StorageFolderTree
  depth: number
  activeFolderId: string | null
  onSelect: (id: string | null) => void
}

export function StorageFolderNode({ folder, depth, activeFolderId, onSelect }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const updateFolder = useUpdateStorageFolder()
  const deleteFolder = useDeleteStorageFolder()
  const createFolder = useCreateStorageFolder()

  const isActive = folder.id === activeFolderId
  const hasChildren = folder.children.length > 0
  const paddingLeft = depth * 12 + 8

  const handleRename = async () => {
    setShowMenu(false)
    const name = window.prompt('Rename folder:', folder.name)
    if (!name?.trim() || name === folder.name) return
    try {
      await updateFolder.mutateAsync({ id: folder.id, name: name.trim() })
    } catch (err) {
      console.error('Failed to rename folder:', err)
    }
  }

  const handleDelete = async () => {
    setShowMenu(false)
    if (!window.confirm(`Delete "${folder.name}"? Files inside will be moved to root.`)) return
    try {
      await deleteFolder.mutateAsync(folder.id)
      if (isActive) onSelect(null)
    } catch (err) {
      console.error('Failed to delete folder:', err)
    }
  }

  const handleNewSubfolder = async () => {
    setShowMenu(false)
    const name = window.prompt('Subfolder name:')
    if (!name?.trim()) return
    try {
      await createFolder.mutateAsync({ name: name.trim(), parentId: folder.id })
      setExpanded(true)
    } catch (err) {
      console.error('Failed to create subfolder:', err)
    }
  }

  return (
    <div>
      <div
        className={cn(
          'group relative flex items-center gap-1 rounded py-1 pr-1 text-xs cursor-pointer',
          isActive ? 'bg-blue-500/20 text-blue-400' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100',
        )}
        style={{ paddingLeft }}
      >
        {/* Expand chevron */}
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
          className={cn('shrink-0 p-0.5 rounded hover:bg-neutral-700', !hasChildren && 'invisible')}
        >
          <ChevronRight className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')} />
        </button>

        {/* Folder icon + name */}
        <div className="flex flex-1 items-center gap-1.5 truncate" onClick={() => { onSelect(folder.id); setExpanded(true) }}>
          {expanded ? <FolderOpen className="h-3.5 w-3.5 shrink-0" /> : <Folder className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">{folder.name}</span>
        </div>

        {/* Context menu trigger */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
          className="shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-neutral-700"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>

        {/* Dropdown menu */}
        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full z-50 mt-0.5 w-36 rounded-md border border-neutral-700 bg-neutral-800 py-1 shadow-lg">
              <button onClick={handleNewSubfolder} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700">
                <FolderPlus className="h-3.5 w-3.5" /> New subfolder
              </button>
              <button onClick={handleRename} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700">
                <Pencil className="h-3.5 w-3.5" /> Rename
              </button>
              <button onClick={handleDelete} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-neutral-700">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </>
        )}
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {folder.children.map((child) => (
            <StorageFolderNode key={child.id} folder={child} depth={depth + 1} activeFolderId={activeFolderId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}
