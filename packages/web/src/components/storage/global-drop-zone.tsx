/** Global drag & drop overlay — shows when external files are dragged into the app window */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../stores/app-store'
import { useUploadWithProgress } from '../../hooks/use-upload-with-progress'

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

export function GlobalDropZone() {
  const [isDragging, setIsDragging] = useState(false)
  const { setStorageDrawerOpen, theme } = useAppStore()
  const uploadWithProgress = useUploadWithProgress()
  const isDark = theme === 'dark'

  // Track drag counter to handle nested elements (useRef to survive re-renders)
  const dragCounterRef = useRef(0)

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    // Only show overlay for external file drops, not internal DnD
    if (!e.dataTransfer?.types.includes('Files')) return
    dragCounterRef.current++
    if (dragCounterRef.current === 1) setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setIsDragging(false)

    const files = e.dataTransfer?.files
    if (!files?.length) return

    // Open storage drawer to show progress
    setStorageDrawerOpen(true)

    const validFiles = Array.from(files).filter((file) => {
      if (file.size > MAX_FILE_SIZE) {
        alert(`"${file.name}" is too large (max 100MB)`)
        return false
      }
      return true
    })
    await Promise.allSettled(validFiles.map((file) => uploadWithProgress(file)))
  }, [setStorageDrawerOpen, uploadWithProgress])

  useEffect(() => {
    document.addEventListener('dragenter', handleDragEnter)
    document.addEventListener('dragleave', handleDragLeave)
    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('drop', handleDrop)
    return () => {
      document.removeEventListener('dragenter', handleDragEnter)
      document.removeEventListener('dragleave', handleDragLeave)
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('drop', handleDrop)
    }
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop])

  if (!isDragging) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className={cn(
          'flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed p-12',
          isDark ? 'border-brand-500/60 bg-surface-1/90' : 'border-brand-500/60 bg-white/90',
        )}
      >
        <Upload className="h-12 w-12 text-brand-400" />
        <p className={cn('text-lg font-semibold', isDark ? 'text-neutral-100' : 'text-neutral-900')}>
          Drop files to upload
        </p>
        <p className={cn('text-sm', isDark ? 'text-neutral-400' : 'text-neutral-500')}>
          Files will be uploaded to storage (max 100MB each)
        </p>
      </div>
    </div>
  )
}
