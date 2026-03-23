/** Single folder item with expand/collapse, sortable, context menu, and external markdown drop */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Folder, FolderOpen, Plus, Pencil, Trash2 } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../stores/app-store'
import { useUpdateFolder, useDeleteFolder, useCreateFolder } from '../../hooks/use-folders'
import { useCreateDocument, useDocuments } from '../../hooks/use-documents'
import { DocumentContextMenu } from './document-context-menu'
import { CreateFolderModal } from './create-folder-modal'
import { SortableDocItem } from './folder-tree'
import { useMarkdownImport, partitionMarkdownFiles } from '../../hooks/use-markdown-import'

interface FolderTreeNode {
  id: string
  parentId: string | null
  name: string
  positionIndex?: string
  updatedAt?: Date | string
  docCount?: number
  children: FolderTreeNode[]
}

interface FolderNodeProps {
  folder: FolderTreeNode
  depth?: number
  searchQuery?: string
  sortMode?: 'manual' | 'name' | 'date'
  sortDirection?: 'asc' | 'desc'
  isSortable?: boolean
}

export function FolderNode({
  folder,
  depth = 0,
  searchQuery = '',
  sortMode = 'manual',
  sortDirection = 'asc',
  isSortable = true,
}: FolderNodeProps) {
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

  const isDark = theme === 'dark'

  // Sortable for this folder
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `folder-${folder.id}`,
    data: { type: 'folder', folder },
    disabled: !isSortable,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  // External markdown drop support (from main)
  const { importMarkdownFiles } = useMarkdownImport()
  const [isExternalDragOver, setIsExternalDragOver] = useState(false)

  const handleExternalDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    setIsExternalDragOver(true)
  }, [])

  const handleExternalDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    e.preventDefault()
    setIsExternalDragOver(false)
  }, [])

  const handleExternalDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsExternalDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    const { markdown } = partitionMarkdownFiles(files)
    if (markdown.length === 0) return

    setExpanded(true)
    await importMarkdownFiles(markdown, folder.id)
  }, [folder.id, importMarkdownFiles])

  // limit: 100 = API max; virtual scroll needed for >100 docs per folder
  const { data: docData } = useDocuments({ folderId: folder.id, sort: 'position', order: 'asc', limit: 100, enabled: expanded })
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

  // Sort children
  const sortedChildren = useMemo(() => {
    if (sortMode === 'name') {
      return [...folder.children].sort((a, b) =>
        sortDirection === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
      )
    }
    if (sortMode === 'date') {
      return [...folder.children].sort((a, b) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        return sortDirection === 'asc' ? aTime - bTime : bTime - aTime
      })
    }
    return folder.children
  }, [folder.children, sortMode, sortDirection])

  const sortedDocs = useMemo(() => {
    if (sortMode === 'name') {
      return [...visibleDocs].sort((a, b) =>
        sortDirection === 'asc' ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title),
      )
    }
    if (sortMode === 'date') {
      return [...visibleDocs].sort((a, b) =>
        sortDirection === 'asc'
          ? new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
          : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
    }
    return visibleDocs
  }, [visibleDocs, sortMode, sortDirection])

  const hasChildren = sortedChildren.length > 0 || sortedDocs.length > 0 || (folder.docCount ?? 0) > 0

  // DnD ids for nested sortable contexts
  const childFolderDndIds = sortedChildren.map((c) => `folder-${c.id}`)
  const childDocDndIds = sortedDocs.map((d) => `doc-${d.id}`)

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {/* Folder row */}
      <div
        {...listeners}
        className={cn(
          'group flex cursor-pointer items-center gap-1.5 rounded-lg py-1 text-xs select-none',
          isExternalDragOver && 'ring-1 ring-brand-400 bg-brand-500/10',
          isDark
            ? 'text-neutral-300 hover:bg-surface-3'
            : 'text-neutral-700 hover:bg-neutral-100',
        )}
        style={{ paddingLeft }}
        onClick={() => setExpanded((v) => !v)}
        onContextMenu={(e) => {
          e.preventDefault()
          setContextMenu({ x: e.clientX, y: e.clientY })
        }}
        onDragOver={handleExternalDragOver}
        onDragLeave={handleExternalDragLeave}
        onDrop={handleExternalDrop}
      >
        <ChevronRight
          className={cn(
            'h-3 w-3 shrink-0 text-neutral-500 transition-transform duration-150',
            expanded && 'rotate-90',
            !hasChildren && 'opacity-0',
          )}
        />
        {expanded ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-brand-400" />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 text-brand-400" />
        )}
        <span className="truncate">{folder.name}</span>
      </div>

      {/* Folder context menu */}
      {contextMenu && (
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
      )}

      {/* Children */}
      {expanded && (
        <div>
          {/* Child folders */}
          <SortableContext items={childFolderDndIds} strategy={verticalListSortingStrategy} disabled={!isSortable}>
            {sortedChildren.map((child) => (
              <FolderNode
                key={child.id}
                folder={child}
                depth={depth + 1}
                searchQuery={searchQuery}
                sortMode={sortMode}
                sortDirection={sortDirection}
                isSortable={isSortable}
              />
            ))}
          </SortableContext>

          {/* Child documents */}
          <SortableContext items={childDocDndIds} strategy={verticalListSortingStrategy} disabled={!isSortable}>
            {sortedDocs.map((doc) => (
              <SortableDocItem
                key={doc.id}
                doc={doc}
                paddingLeft={paddingLeft + 20}
                isDark={isDark}
                isSortable={isSortable}
                onClick={() => handleOpenDoc(doc)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setDocMenu({ doc: { ...doc, folderId: folder.id }, x: e.clientX, y: e.clientY })
                }}
              />
            ))}
          </SortableContext>
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
          ? 'text-red-400 hover:bg-red-500/10'
          : isDark
            ? 'text-neutral-300 hover:bg-surface-3'
            : 'text-neutral-700 hover:bg-neutral-50',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
