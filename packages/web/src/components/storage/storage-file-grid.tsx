/** Grid/list view of files and subfolders in current storage folder */

import { Folder, FileText, Image, Film, Music, File, Download, Trash2, MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../lib/utils'
import { useDeleteUpload } from '../../hooks/use-storage'
import type { Upload, StorageFolderTree } from '@agentwiki/shared'

interface Props {
  files: Upload[]
  subfolders: StorageFolderTree[]
  viewMode: 'grid' | 'list'
  searchQuery: string
  onNavigateFolder: (id: string) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
}

/** Get icon for content type */
function fileIcon(contentType: string) {
  if (contentType.startsWith('image/')) return <Image className="h-8 w-8 text-emerald-400" />
  if (contentType.startsWith('video/')) return <Film className="h-8 w-8 text-purple-400" />
  if (contentType.startsWith('audio/')) return <Music className="h-8 w-8 text-amber-400" />
  if (contentType.includes('pdf') || contentType.includes('text')) return <FileText className="h-8 w-8 text-blue-400" />
  return <File className="h-8 w-8 text-neutral-400" />
}

/** Format bytes to human-readable size */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function FileContextMenu({ file, onClose }: { file: Upload; onClose: () => void }) {
  const deleteUpload = useDeleteUpload()

  const handleDownload = () => {
    onClose()
    window.open(`/api/files/${file.fileKey}`, '_blank')
  }

  const handleDelete = async () => {
    onClose()
    if (!window.confirm(`Delete "${file.filename}"?`)) return
    await deleteUpload.mutateAsync(file.id)
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full z-50 mt-0.5 w-36 rounded-md border border-neutral-700 bg-neutral-800 py-1 shadow-lg">
        <button onClick={handleDownload} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700">
          <Download className="h-3.5 w-3.5" /> Download
        </button>
        <button onClick={handleDelete} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-neutral-700">
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>
    </>
  )
}

export function StorageFileGrid({ files, subfolders, viewMode, searchQuery, onNavigateFolder, selectedIds, onToggleSelect }: Props) {
  const [menuFileId, setMenuFileId] = useState<string | null>(null)
  const query = searchQuery.toLowerCase()

  const filteredFolders = subfolders.filter((f) => f.name.toLowerCase().includes(query))
  const filteredFiles = files.filter((f) => f.filename.toLowerCase().includes(query))

  const isEmpty = filteredFolders.length === 0 && filteredFiles.length === 0

  if (isEmpty) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-neutral-500">
        <File className="h-12 w-12 text-neutral-700" />
        <p className="text-sm">No files here yet</p>
        <p className="text-xs">Upload files or create folders to get started</p>
      </div>
    )
  }

  if (viewMode === 'list') {
    return (
      <div className="flex-1 overflow-y-auto">
        {/* Subfolder rows */}
        {filteredFolders.map((folder) => (
          <div
            key={`folder-${folder.id}`}
            onClick={() => onNavigateFolder(folder.id)}
            className="flex cursor-pointer items-center gap-3 border-b border-neutral-800/50 px-4 py-2.5 hover:bg-neutral-800/50"
          >
            <Folder className="h-5 w-5 shrink-0 text-amber-400" />
            <span className="flex-1 truncate text-sm text-neutral-200">{folder.name}</span>
            <span className="text-xs text-neutral-500">Folder</span>
          </div>
        ))}
        {/* File rows */}
        {filteredFiles.map((file) => (
          <div key={file.id} className="group relative flex items-center gap-3 border-b border-neutral-800/50 px-4 py-2.5 hover:bg-neutral-800/50">
            <input
              type="checkbox"
              checked={selectedIds.has(file.id)}
              onChange={() => onToggleSelect(file.id)}
              className="h-3.5 w-3.5 shrink-0 accent-blue-500"
            />
            <div className="shrink-0">{fileIcon(file.contentType)}</div>
            <span className="flex-1 truncate text-sm text-neutral-200">{file.filename}</span>
            <span className="text-xs text-neutral-500">{formatSize(file.sizeBytes)}</span>
            <span className="text-xs text-neutral-600">{formatDate(file.createdAt)}</span>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuFileId(menuFileId === file.id ? null : file.id) }}
              className="shrink-0 rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-neutral-700"
            >
              <MoreHorizontal className="h-3.5 w-3.5 text-neutral-400" />
            </button>
            {menuFileId === file.id && <FileContextMenu file={file} onClose={() => setMenuFileId(null)} />}
          </div>
        ))}
      </div>
    )
  }

  // Grid view
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {/* Subfolder cards */}
        {filteredFolders.map((folder) => (
          <div
            key={`folder-${folder.id}`}
            onClick={() => onNavigateFolder(folder.id)}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-neutral-800 p-4 hover:border-neutral-600 hover:bg-neutral-800/50"
          >
            <Folder className="h-10 w-10 text-amber-400" />
            <span className="w-full truncate text-center text-xs text-neutral-200">{folder.name}</span>
          </div>
        ))}
        {/* File cards */}
        {filteredFiles.map((file) => (
          <div
            key={file.id}
            className={cn(
              'group relative flex flex-col items-center gap-2 rounded-lg border p-4 hover:border-neutral-600 hover:bg-neutral-800/50',
              selectedIds.has(file.id) ? 'border-blue-500 bg-blue-500/10' : 'border-neutral-800',
            )}
          >
            {/* Checkbox */}
            <input
              type="checkbox"
              checked={selectedIds.has(file.id)}
              onChange={() => onToggleSelect(file.id)}
              className={cn(
                'absolute left-2 top-2 h-3.5 w-3.5 accent-blue-500',
                selectedIds.size === 0 && 'opacity-0 group-hover:opacity-100',
              )}
            />
            {/* Preview */}
            {file.contentType.startsWith('image/') ? (
              <img src={`/api/files/${file.fileKey}`} alt={file.filename} className="h-16 w-full rounded object-cover" loading="lazy" />
            ) : (
              fileIcon(file.contentType)
            )}
            <span className="w-full truncate text-center text-xs text-neutral-200">{file.filename}</span>
            <span className="text-[10px] text-neutral-500">{formatSize(file.sizeBytes)}</span>
            {/* Menu */}
            <button
              onClick={(e) => { e.stopPropagation(); setMenuFileId(menuFileId === file.id ? null : file.id) }}
              className="absolute right-1 top-1 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-neutral-700"
            >
              <MoreHorizontal className="h-3.5 w-3.5 text-neutral-400" />
            </button>
            {menuFileId === file.id && <FileContextMenu file={file} onClose={() => setMenuFileId(null)} />}
          </div>
        ))}
      </div>
    </div>
  )
}
