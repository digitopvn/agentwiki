/** Single folder item with expand/collapse and context menu */

import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Folder, FolderOpen, FileText, Plus, Pencil, Trash2 } from 'lucide-react'
import { useDroppable, useDraggable } from '@dnd-kit/core'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../stores/app-store'
import { useIsMobile } from '../../hooks/use-is-mobile'
import { useUpdateFolder, useDeleteFolder, useCreateFolder } from '../../hooks/use-folders'
import { useCreateDocument, useDocuments } from '../../hooks/use-documents'
import { DocumentContextMenu } from './document-context-menu'
import { CreateFolderModal } from './create-folder-modal'

interface FolderTreeNode {
  id: string
  name: string
  children: FolderTreeNode[]
}

interface FolderNodeProps {
  folder: FolderTreeNode
  depth?: number
  searchQuery?: string
}

export function FolderNode({ folder, depth = 0, searchQuery = '' }: FolderNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [docMenu, setDocMenu] = useState<{
    doc: { id: string; title: string; slug: string; folderId?: string | null }
    x: number
    y: number
  } | null>(null)
  const [subfolderModalOpen, setSubfolderModalOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const { theme, openTab, setActiveTab } = useAppStore()
  const updateFolder = useUpdateFolder()
  const deleteFolder = useDeleteFolder()
  const createFolder = useCreateFolder()
  const createDocument = useCreateDocument()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const isDark = theme === 'dark'

  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: folder.id })

  const { data: docData } = useDocuments({ folderId: folder.id })
  const docs = docData?.data ?? []

  // Close context menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    if (contextMenu) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [contextMenu])

  const handleRename = async () => {
    setContextMenu(null)
    const name = window.prompt('Rename folder:', folder.name)
    if (!name?.trim() || name === folder.name) return
    await updateFolder.mutateAsync({ id: folder.id, name: name.trim() })
  }

  const handleDelete = async () => {
    setContextMenu(null)
    if (!window.confirm(`Delete folder "${folder.name}" and all its contents?`)) return
    await deleteFolder.mutateAsync(folder.id)
  }

  const handleNewSubfolder = () => {
    setContextMenu(null)
    setSubfolderModalOpen(true)
  }

  const handleCreateSubfolder = async (name: string) => {
    await createFolder.mutateAsync({ name, parentId: folder.id })
    setExpanded(true)
  }

  const handleNewDoc = async () => {
    setContextMenu(null)
    const doc = await createDocument.mutateAsync({ title: 'Untitled', folderId: folder.id })
    const tabId = `tab-${doc.id}`
    openTab({ id: tabId, documentId: doc.id, title: doc.title })
    setActiveTab(tabId)
    navigate(`/doc/${doc.slug}`)
    setExpanded(true)
  }

  const handleOpenDoc = (doc: { id: string; title: string; slug: string }) => {
    const tabId = `tab-${doc.id}`
    openTab({ id: tabId, documentId: doc.id, title: doc.title })
    setActiveTab(tabId)
    navigate(`/doc/${doc.slug}`)
  }

  const paddingLeft = depth * 12 + 8

  const filterMatch = (title: string) =>
    !searchQuery || title.toLowerCase().includes(searchQuery.toLowerCase())

  const visibleDocs = docs.filter((d) => filterMatch(d.title))
  const hasChildren = folder.children.length > 0 || visibleDocs.length > 0

  return (
    <div>
      {/* Folder row (droppable target) */}
      <div
        ref={setDropRef}
        className={cn(
          'group flex cursor-pointer items-center gap-1.5 rounded-lg py-2.5 text-sm select-none md:py-1 md:text-xs',
          isOver && 'ring-1 ring-brand-400 bg-brand-500/10',
          isDark
            ? 'text-neutral-300 hover:bg-surface-3 active:bg-surface-3'
            : 'text-neutral-700 hover:bg-neutral-100 active:bg-neutral-100',
        )}
        style={{ paddingLeft }}
        onClick={() => setExpanded((v) => !v)}
        onContextMenu={(e) => {
          e.preventDefault()
          setContextMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        <ChevronRight
          className={cn(
            'h-4 w-4 shrink-0 text-neutral-500 transition-transform duration-150 md:h-3 md:w-3',
            expanded && 'rotate-90',
            !hasChildren && 'opacity-0',
          )}
        />
        {expanded ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-brand-400 md:h-3.5 md:w-3.5" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-brand-400 md:h-3.5 md:w-3.5" />
        )}
        <span className="truncate">{folder.name}</span>
      </div>

      {/* Folder context menu */}
      {contextMenu && (
        isMobile ? (
          <MobileFolderContextMenu
            folderName={folder.name}
            isDark={isDark}
            onNewDoc={handleNewDoc}
            onNewSubfolder={handleNewSubfolder}
            onRename={handleRename}
            onDelete={handleDelete}
            onClose={() => setContextMenu(null)}
          />
        ) : (
          <div
            ref={menuRef}
            className={cn(
              'fixed z-50 min-w-[160px] overflow-hidden rounded-xl border py-1 shadow-xl',
              isDark ? 'border-white/[0.08] bg-surface-2' : 'border-neutral-200 bg-white',
            )}
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <ContextMenuItem icon={<Plus className="h-3.5 w-3.5" />} label="New document" onClick={handleNewDoc} isDark={isDark} />
            <ContextMenuItem icon={<Plus className="h-3.5 w-3.5" />} label="New subfolder" onClick={handleNewSubfolder} isDark={isDark} />
            <div className={cn('my-1 border-t', isDark ? 'border-white/[0.06]' : 'border-neutral-200')} />
            <ContextMenuItem icon={<Pencil className="h-3.5 w-3.5" />} label="Rename" onClick={handleRename} isDark={isDark} />
            <ContextMenuItem icon={<Trash2 className="h-3.5 w-3.5" />} label="Delete" onClick={handleDelete} isDark={isDark} danger />
          </div>
        )
      )}

      {/* Children */}
      {expanded && (
        <div>
          {folder.children.map((child) => (
            <FolderNode key={child.id} folder={child} depth={depth + 1} searchQuery={searchQuery} />
          ))}
          {visibleDocs.map((doc) => (
            <NestedDraggableDoc
              key={doc.id}
              doc={doc}
              paddingLeft={paddingLeft + 20}
              isDark={isDark}
              onClick={() => handleOpenDoc(doc)}
              onContextMenu={(e) => {
                e.preventDefault()
                setDocMenu({ doc: { ...doc, folderId: folder.id }, x: e.clientX, y: e.clientY })
              }}
            />
          ))}
        </div>
      )}

      {/* Document context menu */}
      {docMenu && (
        <DocumentContextMenu
          doc={docMenu.doc}
          position={{ x: docMenu.x, y: docMenu.y }}
          onClose={() => setDocMenu(null)}
        />
      )}

      <CreateFolderModal
        open={subfolderModalOpen}
        onClose={() => setSubfolderModalOpen(false)}
        onSubmit={handleCreateSubfolder}
        parentName={folder.name}
      />
    </div>
  )
}

function NestedDraggableDoc({
  doc,
  paddingLeft,
  isDark,
  onClick,
  onContextMenu,
}: {
  doc: { id: string; title: string; slug: string }
  paddingLeft: number
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
        'flex cursor-pointer items-center gap-2 rounded-lg py-2.5 text-sm md:py-1 md:text-xs',
        isDragging && 'opacity-40',
        isDark
          ? 'text-neutral-400 hover:bg-surface-3 hover:text-neutral-200 active:bg-surface-3'
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800 active:bg-neutral-100',
      )}
      style={{ paddingLeft }}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <FileText className="h-4 w-4 shrink-0 text-neutral-500 md:h-3 md:w-3" />
      <span className="truncate">{doc.title}</span>
    </div>
  )
}

function ContextMenuItem({
  icon,
  label,
  onClick,
  isDark,
  danger = false,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  isDark: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-xs',
        danger
          ? 'text-red-400 hover:bg-red-500/10 active:bg-red-500/10'
          : isDark
            ? 'text-neutral-300 hover:bg-surface-3 active:bg-surface-3'
            : 'text-neutral-700 hover:bg-neutral-50 active:bg-neutral-50',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

/** Mobile bottom sheet context menu for folders */
function MobileFolderContextMenu({
  folderName,
  isDark,
  onNewDoc,
  onNewSubfolder,
  onRename,
  onDelete,
  onClose,
}: {
  folderName: string
  isDark: boolean
  onNewDoc: () => void
  onNewSubfolder: () => void
  onRename: () => void
  onDelete: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={cn(
          'safe-area-bottom relative z-10 w-full max-w-md rounded-t-2xl pb-6 pt-2',
          isDark ? 'bg-surface-2' : 'bg-white',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center py-2">
          <div className={cn('h-1 w-8 rounded-full', isDark ? 'bg-neutral-600' : 'bg-neutral-300')} />
        </div>
        <div className={cn('px-4 pb-2 text-sm font-medium truncate', isDark ? 'text-neutral-300' : 'text-neutral-700')}>
          {folderName}
        </div>
        <MobileContextItem icon={<Plus className="h-5 w-5" />} label="New document" onClick={onNewDoc} isDark={isDark} />
        <MobileContextItem icon={<Plus className="h-5 w-5" />} label="New subfolder" onClick={onNewSubfolder} isDark={isDark} />
        <div className={cn('my-1 mx-4 border-t', isDark ? 'border-white/[0.06]' : 'border-neutral-200')} />
        <MobileContextItem icon={<Pencil className="h-5 w-5" />} label="Rename" onClick={onRename} isDark={isDark} />
        <MobileContextItem icon={<Trash2 className="h-5 w-5" />} label="Delete" onClick={onDelete} isDark={isDark} danger />
      </div>
    </div>
  )
}

function MobileContextItem({
  icon,
  label,
  onClick,
  isDark,
  danger = false,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  isDark: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-3 text-base',
        danger
          ? 'text-red-400 active:bg-red-500/10'
          : isDark
            ? 'text-neutral-300 active:bg-surface-3'
            : 'text-neutral-700 active:bg-neutral-50',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
