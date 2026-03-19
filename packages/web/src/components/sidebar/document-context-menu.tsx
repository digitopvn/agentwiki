/** Right-click context menu for documents in sidebar */

import { useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, Pencil, FolderInput, Trash2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../stores/app-store'
import { useUpdateDocument, useDeleteDocument } from '../../hooks/use-documents'

interface DocumentContextMenuProps {
  doc: { id: string; title: string; slug: string; folderId?: string | null }
  position: { x: number; y: number }
  onClose: () => void
}

export function DocumentContextMenu({ doc, position, onClose }: DocumentContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const { theme, openTab, setActiveTab, closeTab, openTabs } = useAppStore()
  const updateDocument = useUpdateDocument()
  const deleteDocument = useDeleteDocument()
  const navigate = useNavigate()

  const isDark = theme === 'dark'

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const handleOpen = () => {
    onClose()
    const tabId = `tab-${doc.id}`
    openTab({ id: tabId, documentId: doc.id, title: doc.title })
    setActiveTab(tabId)
    navigate(`/doc/${doc.slug}`)
  }

  const handleRename = async () => {
    onClose()
    const newTitle = window.prompt('Rename document:', doc.title)
    if (!newTitle?.trim() || newTitle === doc.title) return
    try {
      await updateDocument.mutateAsync({ id: doc.id, title: newTitle.trim() })
    } catch (err) {
      console.error('Failed to rename document:', err)
    }
  }

  const handleMoveToFolder = async () => {
    onClose()
    const folderId = window.prompt('Enter folder ID to move to (leave empty for root):')
    if (folderId === null) return
    try {
      await updateDocument.mutateAsync({ id: doc.id, folderId: folderId.trim() || null })
    } catch (err) {
      console.error('Failed to move document:', err)
    }
  }

  const handleDelete = async () => {
    onClose()
    if (!window.confirm(`Delete "${doc.title}"?`)) return
    try {
      await deleteDocument.mutateAsync(doc.id)
      // Close tab if open
      const openTab = openTabs.find((t) => t.documentId === doc.id)
      if (openTab) {
        closeTab(openTab.id)
        navigate('/')
      }
    } catch (err) {
      console.error('Failed to delete document:', err)
    }
  }

  return (
    <div
      ref={menuRef}
      className={cn(
        'fixed z-50 min-w-[160px] overflow-hidden rounded-xl border py-1 shadow-xl',
        isDark ? 'border-white/[0.08] bg-surface-2' : 'border-neutral-200 bg-white',
      )}
      style={{ top: position.y, left: position.x }}
    >
      <MenuItem icon={<ExternalLink className="h-3.5 w-3.5" />} label="Open" onClick={handleOpen} isDark={isDark} />
      <div className={cn('my-1 border-t', isDark ? 'border-white/[0.06]' : 'border-neutral-200')} />
      <MenuItem icon={<Pencil className="h-3.5 w-3.5" />} label="Rename" onClick={handleRename} isDark={isDark} />
      <MenuItem icon={<FolderInput className="h-3.5 w-3.5" />} label="Move to folder" onClick={handleMoveToFolder} isDark={isDark} />
      <div className={cn('my-1 border-t', isDark ? 'border-white/[0.06]' : 'border-neutral-200')} />
      <MenuItem icon={<Trash2 className="h-3.5 w-3.5" />} label="Delete" onClick={handleDelete} isDark={isDark} danger />
    </div>
  )
}

function MenuItem({
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
