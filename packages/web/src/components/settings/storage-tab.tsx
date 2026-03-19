/** R2 Storage management: file grid with upload, preview, delete */

import { useRef, useState } from 'react'
import { Upload, Trash2, FileIcon, Image, Download, Cloud, Info } from 'lucide-react'
import { useUploads, useUploadFile, useDeleteUpload } from '../../hooks/use-uploads'
import { cn } from '../../lib/utils'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function StorageTab({ isDark }: { isDark: boolean }) {
  const { data } = useUploads()
  const uploadFile = useUploadFile()
  const deleteUpload = useDeleteUpload()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const files = data?.files ?? []
  const totalSize = files.reduce((sum, f) => sum + f.sizeBytes, 0)
  const isImage = (ct: string) => ct.startsWith('image/')

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await uploadFile.mutateAsync(file)
    } catch (err) {
      console.error('Upload failed:', err)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDelete = async (id: string, filename: string) => {
    if (!window.confirm(`Delete "${filename}"?`)) return
    await deleteUpload.mutateAsync(id)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className={cn('text-sm font-semibold', isDark ? 'text-neutral-200' : 'text-neutral-800')}>Storage</h2>
        <div className="flex items-center gap-3">
          <span className={cn('text-xs', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
            {files.length} files · {formatBytes(totalSize)}
          </span>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadFile.isPending}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" />
            {uploadFile.isPending ? 'Uploading...' : 'Upload file'}
          </button>
          <input ref={fileInputRef} type="file" onChange={handleUpload} className="hidden" />
        </div>
      </div>

      {/* R2 Configuration info */}
      <div className={cn('rounded-lg border p-4 space-y-2', isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-white')}>
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-brand-400" />
          <span className={cn('text-xs font-semibold', isDark ? 'text-neutral-200' : 'text-neutral-700')}>Cloudflare R2</span>
          <span className="rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-400">Connected</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={cn('text-[10px] uppercase tracking-wider', isDark ? 'text-neutral-600' : 'text-neutral-400')}>Bucket</span>
            <p className={cn('text-xs font-mono mt-0.5', isDark ? 'text-neutral-300' : 'text-neutral-600')}>agentwiki-files</p>
          </div>
          <div>
            <span className={cn('text-[10px] uppercase tracking-wider', isDark ? 'text-neutral-600' : 'text-neutral-400')}>Max file size</span>
            <p className={cn('text-xs mt-0.5', isDark ? 'text-neutral-300' : 'text-neutral-600')}>10 MB</p>
          </div>
          <div>
            <span className={cn('text-[10px] uppercase tracking-wider', isDark ? 'text-neutral-600' : 'text-neutral-400')}>Total files</span>
            <p className={cn('text-xs mt-0.5', isDark ? 'text-neutral-300' : 'text-neutral-600')}>{files.length}</p>
          </div>
          <div>
            <span className={cn('text-[10px] uppercase tracking-wider', isDark ? 'text-neutral-600' : 'text-neutral-400')}>Total size</span>
            <p className={cn('text-xs mt-0.5', isDark ? 'text-neutral-300' : 'text-neutral-600')}>{formatBytes(totalSize)}</p>
          </div>
        </div>
        <div className="flex items-start gap-1.5 mt-1">
          <Info className={cn('h-3 w-3 mt-0.5 shrink-0', isDark ? 'text-neutral-600' : 'text-neutral-400')} />
          <p className={cn('text-[11px]', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
            R2 storage is configured via Cloudflare dashboard. Images dragged into the editor are automatically uploaded here.
          </p>
        </div>
      </div>

      {/* File grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {files.map((file) => (
          <div
            key={file.id}
            className={cn(
              'group relative overflow-hidden rounded-lg border',
              isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-white',
            )}
          >
            {/* Preview area */}
            <div
              className="cursor-pointer"
              onClick={() => isImage(file.contentType) && setPreview(`/api/files/${file.fileKey}`)}
            >
              {isImage(file.contentType) ? (
                <img
                  src={`/api/files/${file.fileKey}`}
                  alt={file.filename}
                  className="h-28 w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className={cn('flex h-28 items-center justify-center', isDark ? 'bg-surface-2' : 'bg-neutral-50')}>
                  <FileIcon className="h-8 w-8 text-neutral-500" />
                </div>
              )}
            </div>

            {/* File info */}
            <div className="p-2">
              <p className={cn('truncate text-xs font-medium', isDark ? 'text-neutral-200' : 'text-neutral-800')}>{file.filename}</p>
              <p className={cn('text-[10px]', isDark ? 'text-neutral-500' : 'text-neutral-400')}>{formatBytes(file.sizeBytes)}</p>
            </div>

            {/* Actions overlay */}
            <div className="absolute top-1 right-1 flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              <a
                href={`/api/files/${file.fileKey}`}
                download={file.filename}
                className="rounded-md bg-black/60 p-2 text-white hover:bg-black/80 active:bg-black/80 md:p-1"
                title="Download"
              >
                <Download className="h-4 w-4 md:h-3 md:w-3" />
              </a>
              <button
                onClick={() => handleDelete(file.id, file.filename)}
                className="cursor-pointer rounded-md bg-black/60 p-2 text-red-400 hover:bg-black/80 active:bg-black/80 md:p-1"
                title="Delete"
              >
                <Trash2 className="h-4 w-4 md:h-3 md:w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {files.length === 0 && (
        <div className={cn('flex flex-col items-center gap-2 rounded-lg border border-dashed py-12', isDark ? 'border-white/[0.08]' : 'border-neutral-300')}>
          <Image className={cn('h-8 w-8', isDark ? 'text-neutral-600' : 'text-neutral-400')} />
          <p className={cn('text-sm', isDark ? 'text-neutral-500' : 'text-neutral-400')}>No files uploaded yet</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer text-xs text-brand-400 hover:underline"
          >
            Upload your first file
          </button>
        </div>
      )}

      {/* Image preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setPreview(null)}>
          <img src={preview} alt="Preview" className="max-h-[80vh] max-w-[90vw] rounded-lg" />
        </div>
      )}
    </div>
  )
}
