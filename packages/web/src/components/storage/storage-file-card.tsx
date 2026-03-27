/** Individual file card in storage grid — thumbnail, info, actions, extraction status */

import { FileIcon, Download, Trash2, Copy } from 'lucide-react'
import { cn } from '../../lib/utils'
import { API_BASE } from '../../lib/api-client'
import { ExtractionBadge } from './extraction-badge'
import type { Upload } from '../../hooks/use-uploads'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface StorageFileCardProps {
  file: Upload
  isDark: boolean
  onDelete: (id: string, filename: string) => void
}

export function StorageFileCard({ file, isDark, onDelete }: StorageFileCardProps) {
  const isImage = file.contentType.startsWith('image/')

  const handleCopyUrl = () => {
    void navigator.clipboard.writeText(`${API_BASE}/api/files/${file.fileKey}`)
  }

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-lg border',
        isDark ? 'border-white/[0.06] bg-surface-2' : 'border-neutral-200 bg-white',
      )}
    >
      {/* Preview area */}
      <div className="h-24">
        {isImage ? (
          <img
            src={`${API_BASE}/api/files/${file.fileKey}`}
            alt={file.filename}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className={cn('flex h-full items-center justify-center', isDark ? 'bg-surface-3' : 'bg-neutral-50')}>
            <FileIcon className="h-7 w-7 text-neutral-500" />
          </div>
        )}
      </div>

      {/* File info */}
      <div className="space-y-1 p-2">
        <p className={cn('truncate text-xs font-medium', isDark ? 'text-neutral-200' : 'text-neutral-800')}>
          {file.filename}
        </p>
        <div className="flex items-center justify-between">
          <span className={cn('text-[10px]', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
            {formatBytes(file.sizeBytes)}
          </span>
          <ExtractionBadge status={file.extractionStatus} />
        </div>
      </div>

      {/* Hover actions */}
      <div className="absolute top-1 right-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={handleCopyUrl}
          className="rounded-md bg-black/60 p-1 text-white hover:bg-black/80"
          title="Copy URL"
        >
          <Copy className="h-3 w-3" />
        </button>
        <a
          href={`${API_BASE}/api/files/${file.fileKey}`}
          download={file.filename}
          className="rounded-md bg-black/60 p-1 text-white hover:bg-black/80"
          title="Download"
        >
          <Download className="h-3 w-3" />
        </a>
        <button
          onClick={() => onDelete(file.id, file.filename)}
          className="rounded-md bg-black/60 p-1 text-red-400 hover:bg-black/80"
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
