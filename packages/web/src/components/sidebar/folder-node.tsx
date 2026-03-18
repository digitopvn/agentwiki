/** Single folder item with expand/collapse and context menu */

import { useState, useRef, useEffect } from 'react'
import { ChevronRight, Folder, FolderOpen, FileText, Plus, Pencil, Trash2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../stores/app-store'
import { useUpdateFolder, useDeleteFolder, useCreateFolder } from '../../hooks/use-folders'
import { useCreateDocument } from '../../hooks/use-documents'
import { useDocuments } from '../../hooks/use-documents'

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
  const menuRef = useRef<HTMLDivElement>(null)

  const { theme, openTab, setActiveTab } = useAppStore()
  const updateFolder = useUpdateFolder()
  const deleteFolder = useDeleteFolder()
  const createFolder = useCreateFolder()
  const createDocument = useCreateDocument()

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

  const handleNewSubfolder = async () => {
    setContextMenu(null)
    const name = window.prompt('New subfolder name:')
    if (!name?.trim()) return
    await createFolder.mutateAsync({ name: name.trim(), parentId: folder.id })
    setExpanded(true)
  }

  const handleNewDoc = async () => {
    setContextMenu(null)
    const doc = await createDocument.mutateAsync({ title: 'Untitled', folderId: folder.id })
    const tabId = `tab-${doc.id}`
    openTab({ id: tabId, documentId: doc.id, title: doc.title })
    setActiveTab(tabId)
    setExpanded(true)
  }

  const handleOpenDoc = (doc: { id: string; title: string }) => {
    const tabId = `tab-${doc.id}`
    openTab({ id: tabId, documentId: doc.id, title: doc.title })
    setActiveTab(tabId)
  }

  const paddingLeft = depth * 12 + 8

  const filterMatch = (title: string) =>
    !searchQuery || title.toLowerCase().includes(searchQuery.toLowerCase())

  const visibleDocs = docs.filter((d) => filterMatch(d.title))
  const hasChildren = folder.children.length > 0 || visibleDocs.length > 0

  return (
    <div>
      {/* Folder row */}
      <div
        className={cn(
          'group flex cursor-pointer items-center gap-1 rounded py-0.5 text-xs select-none',
          theme === 'dark'
            ? 'text-neutral-300 hover:bg-neutral-800'
            : 'text-neutral-700 hover:bg-neutral-100',
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
            'h-3 w-3 shrink-0 transition-transform text-neutral-500',
            expanded && 'rotate-90',
            !hasChildren && 'opacity-0',
          )}
        />
        {expanded ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-blue-400" />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 text-blue-400" />
        )}
        <span className="truncate">{folder.name}</span>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[160px] rounded-md border border-neutral-700 bg-neutral-800 py-1 shadow-xl"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <ContextMenuItem icon={<Plus className="h-3.5 w-3.5" />} label="New document" onClick={handleNewDoc} />
          <ContextMenuItem icon={<Plus className="h-3.5 w-3.5" />} label="New subfolder" onClick={handleNewSubfolder} />
          <div className="my-1 border-t border-neutral-700" />
          <ContextMenuItem icon={<Pencil className="h-3.5 w-3.5" />} label="Rename" onClick={handleRename} />
          <ContextMenuItem icon={<Trash2 className="h-3.5 w-3.5" />} label="Delete" onClick={handleDelete} danger />
        </div>
      )}

      {/* Children */}
      {expanded && (
        <div>
          {folder.children.map((child) => (
            <FolderNode key={child.id} folder={child} depth={depth + 1} searchQuery={searchQuery} />
          ))}
          {visibleDocs.map((doc) => (
            <div
              key={doc.id}
              className={cn(
                'flex cursor-pointer items-center gap-1.5 rounded py-0.5 text-xs',
                theme === 'dark'
                  ? 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100'
                  : 'text-neutral-600 hover:bg-neutral-100',
              )}
              style={{ paddingLeft: paddingLeft + 20 }}
              onClick={() => handleOpenDoc(doc)}
            >
              <FileText className="h-3 w-3 shrink-0" />
              <span className="truncate">{doc.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ContextMenuItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-neutral-700',
        danger ? 'text-red-400' : 'text-neutral-200',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
