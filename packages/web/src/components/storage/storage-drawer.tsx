/** Storage drawer — slides in from right, shows files with upload, search, extraction status */

import { useRef, useState, useEffect, useCallback } from 'react'
import { X, Upload, Search, HardDrive } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../stores/app-store'
import { useUploads, useDeleteUpload } from '../../hooks/use-uploads'
import { StorageFileCard } from './storage-file-card'
import { UploadProgressList } from './upload-progress-list'
import { useUploadWithProgress } from '../../hooks/use-upload-with-progress'

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

export function StorageDrawer() {
  const { storageDrawerOpen, setStorageDrawerOpen, theme } = useAppStore()
  const [search, setSearch] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data, refetch } = useUploads()
  const deleteUpload = useDeleteUpload()
  const uploadWithProgress = useUploadWithProgress()
  const isDark = theme === 'dark'

  // Poll for extraction status updates when any file is processing
  const files = data?.files ?? []
  const hasProcessing = files.some((f) => f.extractionStatus === 'pending' || f.extractionStatus === 'processing')
  useEffect(() => {
    if (!hasProcessing || !storageDrawerOpen) return
    const interval = setInterval(() => refetch(), 5000)
    return () => clearInterval(interval)
  }, [hasProcessing, storageDrawerOpen, refetch])

  // Filter files by search
  const filtered = search
    ? files.filter((f) => f.filename.toLowerCase().includes(search.toLowerCase()))
    : files

  // Close on Escape
  useEffect(() => {
    if (!storageDrawerOpen) return
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setStorageDrawerOpen(false) }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [storageDrawerOpen, setStorageDrawerOpen])

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList?.length) return
    const filesToUpload = Array.from(fileList)
    for (const file of filesToUpload) {
      if (file.size > MAX_FILE_SIZE) {
        alert(`"${file.name}" is too large (max 100MB)`)
        continue
      }
      await uploadWithProgress(file)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [uploadWithProgress])

  const handleDelete = useCallback(async (id: string, filename: string) => {
    if (!window.confirm(`Delete "${filename}"?`)) return
    await deleteUpload.mutateAsync(id)
  }, [deleteUpload])

  if (!storageDrawerOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setStorageDrawerOpen(false)} />

      {/* Drawer */}
      <div
        className={cn(
          'fixed top-0 right-0 z-50 flex h-full w-full flex-col shadow-2xl sm:w-[400px]',
          'animate-slide-in-right',
          isDark ? 'bg-surface-1 border-l border-white/[0.06]' : 'bg-white border-l border-neutral-200',
        )}
      >
        {/* Header */}
        <div className={cn('flex items-center justify-between border-b px-4 py-3', isDark ? 'border-white/[0.06]' : 'border-neutral-200')}>
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-brand-400" />
            <span className={cn('text-sm font-semibold', isDark ? 'text-neutral-100' : 'text-neutral-900')}>Storage</span>
            <span className={cn('text-[10px] rounded-full px-1.5 py-0.5', isDark ? 'bg-surface-3 text-neutral-400' : 'bg-neutral-100 text-neutral-500')}>
              {files.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-500"
            >
              <Upload className="h-3 w-3" />
              Upload
            </button>
            <button onClick={() => setStorageDrawerOpen(false)} className={cn('rounded-md p-1', isDark ? 'text-neutral-500 hover:bg-surface-3' : 'text-neutral-400 hover:bg-neutral-100')}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <input ref={fileInputRef} type="file" multiple onChange={handleUpload} className="hidden" />
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <div className="relative">
            <Search className={cn('absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2', isDark ? 'text-neutral-500' : 'text-neutral-400')} />
            <input
              type="text"
              placeholder="Filter files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                'w-full rounded-lg border py-1.5 pl-8 pr-3 text-xs outline-none',
                isDark
                  ? 'border-white/[0.06] bg-surface-2 text-neutral-200 placeholder-neutral-500 focus:border-brand-500/50'
                  : 'border-neutral-200 bg-neutral-50 text-neutral-900 placeholder-neutral-400 focus:border-brand-500',
              )}
            />
          </div>
        </div>

        {/* Upload progress */}
        <UploadProgressList isDark={isDark} />

        {/* File grid */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {filtered.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {filtered.map((file) => (
                <StorageFileCard key={file.id} file={file} isDark={isDark} onDelete={handleDelete} />
              ))}
            </div>
          ) : (
            <div className={cn('flex flex-col items-center gap-2 rounded-lg border border-dashed py-12', isDark ? 'border-white/[0.08]' : 'border-neutral-300')}>
              <HardDrive className={cn('h-8 w-8', isDark ? 'text-neutral-600' : 'text-neutral-400')} />
              <p className={cn('text-sm', isDark ? 'text-neutral-500' : 'text-neutral-400')}>
                {search ? 'No files match filter' : 'No files uploaded yet'}
              </p>
              {!search && (
                <button onClick={() => fileInputRef.current?.click()} className="text-xs text-brand-400 hover:underline">
                  Upload your first file
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
