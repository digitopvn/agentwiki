/** Draggable document item for sidebar folder tree */

import { useDraggable } from '@dnd-kit/core'
import { FileText } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../stores/app-store'
import { useLeftClickDragListeners, type DragData } from '../../lib/dnd-utils'

interface DraggableDocProps {
  doc: { id: string; title: string; folderId?: string | null }
  paddingLeft: number
  onOpen: () => void
}

export function DraggableDoc({ doc, paddingLeft, onOpen }: DraggableDocProps) {
  const { theme } = useAppStore()

  const dragData: DragData = {
    type: 'document',
    id: doc.id,
    name: doc.title,
    parentId: doc.folderId ?? null,
  }

  const { attributes, listeners: rawListeners, setNodeRef, isDragging } = useDraggable({
    id: `doc-${doc.id}`,
    data: dragData,
  })
  const listeners = useLeftClickDragListeners(rawListeners)

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        'flex cursor-pointer items-center gap-1.5 rounded py-0.5 text-xs',
        theme === 'dark'
          ? 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100'
          : 'text-neutral-600 hover:bg-neutral-100',
        isDragging && 'opacity-40',
      )}
      style={{ paddingLeft }}
      onClick={onOpen}
    >
      <FileText className="h-3 w-3 shrink-0" />
      <span className="truncate">{doc.title}</span>
    </div>
  )
}
