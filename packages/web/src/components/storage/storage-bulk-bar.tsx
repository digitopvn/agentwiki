/** Floating bottom bar for bulk actions on selected storage items */

import { Trash2, FolderInput, X } from 'lucide-react'
import { useBulkDelete } from '../../hooks/use-storage'

interface Props {
  selectedFileIds: string[]
  selectedFolderIds: string[]
  onClearSelection: () => void
}

export function StorageBulkBar({ selectedFileIds, selectedFolderIds, onClearSelection }: Props) {
  const bulkDelete = useBulkDelete()
  const total = selectedFileIds.length + selectedFolderIds.length

  if (total === 0) return null

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${total} selected item(s)?`)) return
    await bulkDelete.mutateAsync({ fileIds: selectedFileIds, folderIds: selectedFolderIds })
    onClearSelection()
  }

  return (
    <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 shadow-xl">
      <span className="text-xs font-medium text-neutral-200">{total} selected</span>

      <div className="h-4 w-px bg-neutral-700" />

      <button
        onClick={handleDelete}
        disabled={bulkDelete.isPending}
        className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-red-400 hover:bg-red-500/20 disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </button>

      <button onClick={onClearSelection} className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
