/** Recursive collapsible folder tree with drag & drop support */

import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { FileText, Folder } from 'lucide-react'
import { useFolderTree } from '../../hooks/use-folders'
import { useDocuments, useUpdateDocument } from '../../hooks/use-documents'
import { useUpdateFolder } from '../../hooks/use-folders'
import { useAppStore } from '../../stores/app-store'
import { FolderNode } from './folder-node'
import { DraggableDoc } from './draggable-doc'
import { cn } from '../../lib/utils'
import { isDescendant, type DragData } from '../../lib/dnd-utils'

interface FolderTreeProps {
  searchQuery?: string
}

export function FolderTree({ searchQuery = '' }: FolderTreeProps) {
  const { data: folderData, isLoading: foldersLoading } = useFolderTree()
  const { data: docData, isLoading: docsLoading } = useDocuments({ folderId: undefined })
  const { theme, openTab, setActiveTab } = useAppStore()
  const updateFolder = useUpdateFolder()
  const updateDocument = useUpdateDocument()
  const [activeDrag, setActiveDrag] = useState<DragData | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const folders = folderData?.folders ?? []
  const rootDocs = (docData?.data ?? []).filter(
    (d) =>
      !d.folderId &&
      (!searchQuery || d.title.toLowerCase().includes(searchQuery.toLowerCase())),
  )

  // Root drop zone — dropping here moves item to root level
  const { setNodeRef: rootDropRef, isOver: isOverRoot } = useDroppable({
    id: 'root-drop-zone',
    data: { type: 'root' },
  })

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined
    if (data) setActiveDrag(data)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null)
    const { active, over } = event
    if (!over || !active.data.current) return

    const dragData = active.data.current as DragData
    const overData = over.data.current as { type: string; id?: string } | undefined
    if (!overData) return

    // Determine target folder id (null = root)
    const targetFolderId = overData.type === 'root' ? null : overData.id ?? null

    if (dragData.type === 'folder') {
      // Don't drop folder onto itself
      if (dragData.id === targetFolderId) return
      // Prevent cycle: can't drop parent into its own descendant
      if (targetFolderId && isDescendant(dragData.id, targetFolderId, folders)) return
      // Don't move if already in target
      if (dragData.parentId === targetFolderId) return
      updateFolder.mutate(
        { id: dragData.id, parentId: targetFolderId },
        { onError: () => console.error('Failed to move folder') },
      )
    } else if (dragData.type === 'document') {
      // Don't move if already in target
      if (dragData.parentId === targetFolderId) return
      updateDocument.mutate(
        { id: dragData.id, folderId: targetFolderId },
        { onError: () => console.error('Failed to move document') },
      )
    }
  }

  const handleOpenDoc = (doc: { id: string; title: string }) => {
    const tabId = `tab-${doc.id}`
    openTab({ id: tabId, documentId: doc.id, title: doc.title })
    setActiveTab(tabId)
  }

  if (foldersLoading || docsLoading) {
    return (
      <div className="space-y-1 px-1 py-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-5 animate-pulse rounded bg-neutral-800" />
        ))}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-0.5">
        {folders.map((folder) => (
          <FolderNode key={folder.id} folder={folder} searchQuery={searchQuery} />
        ))}
        {rootDocs.map((doc) => (
          <DraggableDoc
            key={doc.id}
            doc={doc}
            paddingLeft={8}
            onOpen={() => handleOpenDoc(doc)}
          />
        ))}
        {/* Root drop zone at bottom */}
        <div
          ref={rootDropRef}
          className={cn(
            'min-h-[24px] rounded-sm transition-colors',
            isOverRoot && 'bg-blue-500/10 ring-1 ring-inset ring-blue-500/30',
          )}
        />
        {folders.length === 0 && rootDocs.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-neutral-500">
            {searchQuery ? 'No results found' : 'No documents yet'}
          </p>
        )}
      </div>

      {/* Ghost element while dragging */}
      <DragOverlay dropAnimation={null}>
        {activeDrag && (
          <div
            className={cn(
              'flex items-center gap-1.5 rounded px-2 py-1 text-xs shadow-lg',
              theme === 'dark'
                ? 'bg-neutral-800 text-neutral-200'
                : 'bg-white text-neutral-800 shadow-md',
            )}
          >
            {activeDrag.type === 'folder' ? (
              <Folder className="h-3.5 w-3.5 shrink-0 text-blue-400" />
            ) : (
              <FileText className="h-3 w-3 shrink-0" />
            )}
            <span className="truncate">{activeDrag.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
