/** Recursive collapsible folder tree with drag-and-drop support */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { DndContext, DragEndEvent, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable, useDroppable } from '@dnd-kit/core'
import { useFolderTree } from '../../hooks/use-folders'
import { useDocuments, useUpdateDocument } from '../../hooks/use-documents'
import { useAppStore } from '../../stores/app-store'
import { FolderNode } from './folder-node'
import { DocumentContextMenu } from './document-context-menu'
import { cn } from '../../lib/utils'

interface FolderTreeProps {
  searchQuery?: string
  onDocumentOpen?: () => void
}

export function FolderTree({ searchQuery = '', onDocumentOpen }: FolderTreeProps) {
  const { data: folderData, isLoading: foldersLoading } = useFolderTree()
  const { data: docData, isLoading: docsLoading } = useDocuments({ folderId: undefined })
  const { theme, openTab, setActiveTab } = useAppStore()
  const updateDocument = useUpdateDocument()
  const navigate = useNavigate()

  const [docMenu, setDocMenu] = useState<{
    doc: { id: string; title: string; slug: string; folderId?: string | null }
    x: number
    y: number
  } | null>(null)

  const [activeDoc, setActiveDoc] = useState<{ id: string; title: string } | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const isDark = theme === 'dark'
  const folders = folderData?.folders ?? []
  const rootDocs = (docData?.data ?? []).filter(
    (d) =>
      !d.folderId &&
      (!searchQuery || d.title.toLowerCase().includes(searchQuery.toLowerCase())),
  )

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

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDoc(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const docId = String(active.id)
    const targetId = String(over.id)
    const folderId = targetId === 'root-drop' ? null : targetId

    try {
      await updateDocument.mutateAsync({ id: docId, folderId })
    } catch (err) {
      console.error('Failed to move document:', err)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => {
        const doc = rootDocs.find((d) => d.id === e.active.id) ?? { id: String(e.active.id), title: 'Document' }
        setActiveDoc({ id: String(e.active.id), title: doc.title })
      }}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-0.5">
        {/* Root drop zone — drop here to move doc to root */}
        <RootDropZone isDark={isDark} />

        {folders.map((folder) => (
          <FolderNode key={folder.id} folder={folder} searchQuery={searchQuery} />
        ))}
        {rootDocs.map((doc) => (
          <DraggableDocItem
            key={doc.id}
            doc={doc}
            isDark={isDark}
            onClick={() => handleOpenDoc(doc)}
            onContextMenu={(e) => {
              e.preventDefault()
              setDocMenu({ doc, x: e.clientX, y: e.clientY })
            }}
          />
        ))}
        {folders.length === 0 && rootDocs.length === 0 && (
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
        {activeDoc ? (
          <div className={cn(
            'flex items-center gap-2 rounded-lg px-2 py-1 text-xs shadow-lg',
            isDark ? 'bg-surface-3 text-neutral-200' : 'bg-white text-neutral-700 border border-neutral-200',
          )}>
            <FileText className="h-3.5 w-3.5 text-neutral-500" />
            <span className="truncate">{activeDoc.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

/** Draggable document item in sidebar */
function DraggableDocItem({
  doc,
  isDark,
  onClick,
  onContextMenu,
}: {
  doc: { id: string; title: string; slug: string }
  isDark: boolean
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: doc.id })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
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
