/** Breadcrumb navigation for storage folder hierarchy */

import { ChevronRight, HardDrive } from 'lucide-react'
import type { StorageFolderTree } from '@agentwiki/shared'

interface Props {
  folderTree: StorageFolderTree[]
  currentFolderId: string | null
  onNavigate: (folderId: string | null) => void
}

/** Build path segments from root to current folder */
function buildPath(tree: StorageFolderTree[], targetId: string): StorageFolderTree[] {
  for (const node of tree) {
    if (node.id === targetId) return [node]
    const childPath = buildPath(node.children, targetId)
    if (childPath.length) return [node, ...childPath]
  }
  return []
}

export function StorageBreadcrumb({ folderTree, currentFolderId, onNavigate }: Props) {
  const path = currentFolderId ? buildPath(folderTree, currentFolderId) : []

  return (
    <nav className="flex items-center gap-1 px-4 py-2 text-xs text-neutral-400">
      <button
        onClick={() => onNavigate(null)}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-neutral-800 hover:text-neutral-100"
      >
        <HardDrive className="h-3 w-3" />
        Storage
      </button>

      {path.map((segment, i) => {
        const isLast = i === path.length - 1
        return (
          <span key={segment.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-neutral-600" />
            {isLast ? (
              <span className="rounded px-1.5 py-0.5 font-medium text-neutral-200">{segment.name}</span>
            ) : (
              <button
                onClick={() => onNavigate(segment.id)}
                className="rounded px-1.5 py-0.5 hover:bg-neutral-800 hover:text-neutral-100"
              >
                {segment.name}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}
