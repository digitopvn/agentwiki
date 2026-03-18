/** Recursive collapsible folder tree fetched from GET /api/folders */

import { FileText } from 'lucide-react'
import { useFolderTree } from '../../hooks/use-folders'
import { useDocuments } from '../../hooks/use-documents'
import { useAppStore } from '../../stores/app-store'
import { FolderNode } from './folder-node'
import { cn } from '../../lib/utils'

interface FolderTreeProps {
  searchQuery?: string
}

export function FolderTree({ searchQuery = '' }: FolderTreeProps) {
  const { data: folderData, isLoading: foldersLoading } = useFolderTree()
  const { data: docData, isLoading: docsLoading } = useDocuments({ folderId: undefined })
  const { theme, openTab, setActiveTab } = useAppStore()

  const folders = folderData?.folders ?? []
  // Root-level documents (no folder)
  const rootDocs = (docData?.data ?? []).filter(
    (d) =>
      !d.folderId &&
      (!searchQuery || d.title.toLowerCase().includes(searchQuery.toLowerCase())),
  )

  if (foldersLoading || docsLoading) {
    return (
      <div className="space-y-1 px-1 py-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-5 animate-pulse rounded bg-neutral-800" />
        ))}
      </div>
    )
  }

  const handleOpenDoc = (doc: { id: string; title: string }) => {
    const tabId = `tab-${doc.id}`
    openTab({ id: tabId, documentId: doc.id, title: doc.title })
    setActiveTab(tabId)
  }

  return (
    <div className="space-y-0.5">
      {folders.map((folder) => (
        <FolderNode key={folder.id} folder={folder} searchQuery={searchQuery} />
      ))}
      {rootDocs.map((doc) => (
        <div
          key={doc.id}
          className={cn(
            'flex cursor-pointer items-center gap-1.5 rounded px-2 py-0.5 text-xs',
            theme === 'dark'
              ? 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100'
              : 'text-neutral-600 hover:bg-neutral-100',
          )}
          onClick={() => handleOpenDoc(doc)}
        >
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{doc.title}</span>
        </div>
      ))}
      {folders.length === 0 && rootDocs.length === 0 && (
        <p className="px-2 py-4 text-center text-xs text-neutral-500">
          {searchQuery ? 'No results found' : 'No documents yet'}
        </p>
      )}
    </div>
  )
}
