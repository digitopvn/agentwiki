/** Recursive collapsible folder tree with sortable drag-and-drop */

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Folder } from 'lucide-react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useFolderTree } from '../../hooks/use-folders'
import { useDocuments, useUpdateDocument } from '../../hooks/use-documents'
import { useReorderItem } from '../../hooks/use-reorder'
import { useAppStore } from '../../stores/app-store'
import { FolderNode } from './folder-node'
import { DocumentContextMenu } from './document-context-menu'
import { cn } from '../../lib/utils'

/** Parse DnD item id to extract type and real id */
function parseItemId(dndId: string | number): { type: 'folder' | 'document'; id: string } {
  const s = String(dndId)
  if (s.startsWith('folder-')) return { type: 'folder', id: s.slice(7) }
  if (s.startsWith('doc-')) return { type: 'document', id: s.slice(4) }
  return { type: 'document', id: s }
}

interface FolderTreeProps {
  searchQuery?: string
  sortMode?: 'manual' | 'name' | 'date'
  sortDirection?: 'asc' | 'desc'
  onDocumentOpen?: () => void
}

export function FolderTree({
  searchQuery = '',
  sortMode = 'manual',
  sortDirection = 'asc',
  onDocumentOpen,
}: FolderTreeProps) {
  const { data: folderData, isLoading: foldersLoading } = useFolderTree()
  const { data: docData, isLoading: docsLoading } = useDocuments({ folderId: 'null', sort: 'position', order: 'asc', limit: 200 })
  const { theme, openTab, setActiveTab } = useAppStore()
  const updateDocument = useUpdateDocument()
  const reorderItem = useReorderItem()
  const navigate = useNavigate()

  const [docMenu, setDocMenu] = useState<{
    doc: { id: string; title: string; slug: string; folderId?: string | null }
    x: number
    y: number
  } | null>(null)

  const [activeItem, setActiveItem] = useState<{ type: 'folder' | 'document'; id: string; title: string } | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const isDark = theme === 'dark'
  const folders = folderData?.folders ?? []
  const allRootDocs = (docData?.data ?? []).filter(
    (d) => !searchQuery || d.title.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Apply sort to folders
  const sortedFolders = useMemo(() => {
    if (sortMode === 'name') {
      return [...folders].sort((a, b) =>
        sortDirection === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
      )
    }
    if (sortMode === 'date') {
      return [...folders].sort((a, b) =>
        sortDirection === 'asc'
          ? new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
          : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
    }
    return folders // manual: already sorted by positionIndex from API
  }, [folders, sortMode, sortDirection])

  // Apply sort to root docs
  const sortedRootDocs = useMemo(() => {
    if (sortMode === 'name') {
      return [...allRootDocs].sort((a, b) =>
        sortDirection === 'asc' ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title),
      )
    }
    if (sortMode === 'date') {
      return [...allRootDocs].sort((a, b) =>
        sortDirection === 'asc'
          ? new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
          : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
    }
    return allRootDocs
  }, [allRootDocs, sortMode, sortDirection])

  const isManualSort = sortMode === 'manual'

  // DnD ids for sortable contexts
  const folderDndIds = sortedFolders.map((f) => `folder-${f.id}`)
  const docDndIds = sortedRootDocs.map((d) => `doc-${d.id}`)

  if (foldersLoading || docsLoading) {
    return (
      <div className="space-y-1.5 px-2 py-2">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className={cn('h-5 animate-pulse rounded-md', isDark ? 'bg-surface-3' : 'bg-neutral-200')}
          />
        ))}
      </div>
    )
  }

  const handleOpenDoc = (doc: { id: string; title: string; slug: string }) => {
    const tabId = `tab-${doc.id}`
    openTab({ id: tabId, documentId: doc.id, title: doc.title })
    setActiveTab(tabId)
    navigate(`/doc/${doc.slug}`)
    onDocumentOpen?.()
  }

  const handleDragStart = (event: DragStartEvent) => {
    const parsed = parseItemId(event.active.id)
    if (parsed.type === 'folder') {
      const folder = folders.find((f) => f.id === parsed.id)
      setActiveItem({ type: 'folder', id: parsed.id, title: folder?.name ?? 'Folder' })
    } else {
      // Check root docs first, then look in DnD data for folder-level docs
      const doc = allRootDocs.find((d) => d.id === parsed.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dndData = event.active.data.current as Record<string, any> | undefined
      const title = doc?.title ?? dndData?.doc?.title ?? 'Document'
      setActiveItem({ type: 'document', id: parsed.id, title })
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveItem(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeParsed = parseItemId(active.id)
    const overParsed = parseItemId(over.id)

    // Document dragged onto a folder → move into folder
    if (activeParsed.type === 'document' && overParsed.type === 'folder') {
      try {
        await updateDocument.mutateAsync({ id: activeParsed.id, folderId: overParsed.id })
      } catch (err) {
        console.error('Failed to move document:', err)
      }
      return
    }

    // Reorder within same type (only in manual sort mode)
    if (isManualSort && activeParsed.type === overParsed.type) {
      // Determine which item list this drag belongs to (root or inside a folder)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const activeData = active.data.current as Record<string, any> | undefined
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const overData = over.data.current as Record<string, any> | undefined

      let items: string[]
      let parentId: string | null = null

      if (activeParsed.type === 'folder') {
        items = folderDndIds
      } else {
        // Check if this doc is in the root doc list
        const isRootDoc = docDndIds.includes(String(active.id))
        if (isRootDoc) {
          items = docDndIds
        } else {
          // Doc inside a folder — get sibling list from sortable context data
          const sortableItems = overData?.sortable?.items ?? activeData?.sortable?.items
          if (Array.isArray(sortableItems) && sortableItems.length > 0) {
            items = sortableItems.map(String)
            parentId = activeData?.doc?.folderId ?? null
          } else {
            return // Cannot determine sibling list
          }
        }
      }

      const oldIndex = items.indexOf(String(active.id))
      const newIndex = items.indexOf(String(over.id))
      if (oldIndex === -1 || newIndex === -1) return

      // Compute afterId and beforeId based on new position
      const realIds = items.map((id) => parseItemId(id).id)
      const withoutActive = realIds.filter((_, i) => i !== oldIndex)
      const insertAt = newIndex
      const afterId = insertAt > 0 ? withoutActive[insertAt - 1] : undefined
      const beforeId = insertAt < withoutActive.length ? withoutActive[insertAt] : undefined

      try {
        await reorderItem.mutateAsync({
          type: activeParsed.type,
          id: activeParsed.id,
          parentId,
          afterId,
          beforeId,
        })
      } catch (err) {
        console.error('Failed to reorder:', err)
      }
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-0.5">
        {/* Root drop zone — drop here to move doc to root */}
        <RootDropZone isDark={isDark} />

        {/* Sortable folders */}
        <SortableContext items={folderDndIds} strategy={verticalListSortingStrategy} disabled={!isManualSort}>
          {sortedFolders.map((folder) => (
            <FolderNode
              key={folder.id}
              folder={folder}
              searchQuery={searchQuery}
              sortMode={sortMode}
              sortDirection={sortDirection}
              isSortable={isManualSort}
            />
          ))}
        </SortableContext>

        {/* Sortable root documents */}
        <SortableContext items={docDndIds} strategy={verticalListSortingStrategy} disabled={!isManualSort}>
          {sortedRootDocs.map((doc) => (
            <SortableDocItem
              key={doc.id}
              doc={doc}
              isDark={isDark}
              isSortable={isManualSort}
              onClick={() => handleOpenDoc(doc)}
              onContextMenu={(e) => {
                e.preventDefault()
                setDocMenu({ doc, x: e.clientX, y: e.clientY })
              }}
            />
          ))}
        </SortableContext>

        {sortedFolders.length === 0 && sortedRootDocs.length === 0 && (
          <p className={cn('px-2 py-4 text-center text-xs', isDark ? 'text-neutral-600' : 'text-neutral-400')}>
            {searchQuery ? 'No results found' : 'No documents yet'}
          </p>
        )}

        {docMenu && (
          <DocumentContextMenu
            doc={docMenu.doc}
            position={{ x: docMenu.x, y: docMenu.y }}
            onClose={() => setDocMenu(null)}
          />
        )}
      </div>

      <DragOverlay>
        {activeItem ? (
          <div
            className={cn(
              'flex items-center gap-2 rounded-lg px-2 py-1 text-xs shadow-lg',
              isDark ? 'bg-surface-3 text-neutral-200' : 'bg-white text-neutral-700 border border-neutral-200',
            )}
          >
            {activeItem.type === 'folder' ? (
              <Folder className="h-3.5 w-3.5 text-brand-400" />
            ) : (
              <FileText className="h-3.5 w-3.5 text-neutral-500" />
            )}
            <span className="truncate">{activeItem.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

/** Sortable document item in sidebar */
export function SortableDocItem({
  doc,
  isDark,
  isSortable,
  paddingLeft,
  onClick,
  onContextMenu,
}: {
  doc: { id: string; title: string; slug: string }
  isDark: boolean
  isSortable: boolean
  paddingLeft?: number
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `doc-${doc.id}`,
    data: { type: 'document', doc },
    disabled: !isSortable,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    paddingLeft,
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2.5 text-sm md:py-1 md:text-xs',
        isDragging && 'opacity-40',
        isDark
          ? 'text-neutral-400 hover:bg-surface-3 hover:text-neutral-200 active:bg-surface-3'
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800 active:bg-neutral-100',
      )}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <FileText className="h-4 w-4 shrink-0 text-neutral-500 md:h-3.5 md:w-3.5" />
      <span className="truncate">{doc.title}</span>
    </div>
  )
}

/** Root drop zone to move docs out of folders */
function RootDropZone({ isDark }: { isDark: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'root-drop' })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'mx-1 rounded-lg border border-dashed px-2 py-1 text-center text-[10px] transition-colors',
        isOver
          ? 'border-brand-400 bg-brand-500/10 text-brand-400'
          : isDark
            ? 'border-transparent text-transparent'
            : 'border-transparent text-transparent',
      )}
    >
      {isOver ? 'Drop here for root' : '\u00A0'}
    </div>
  )
}
