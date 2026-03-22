/** Global drag & drop overlay — handles markdown import and file uploads */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Upload, FileText } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../stores/app-store'
import { useUploadWithProgress } from '../../hooks/use-upload-with-progress'
import { useMarkdownImport, partitionMarkdownFiles } from '../../hooks/use-markdown-import'

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

export function GlobalDropZone() {
  const [isDragging, setIsDragging] = useState(false)
  const [hasMarkdown, setHasMarkdown] = useState(false)
  const { setStorageDrawerOpen, theme } = useAppStore()
  const uploadWithProgress = useUploadWithProgress()
  const { importMarkdownFiles } = useMarkdownImport()
  const isDark = theme === 'dark'

  // Track drag counter to handle nested elements (useRef to survive re-renders)
  const dragCounterRef = useRef(0)

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    // Only show overlay for external file drops, not internal DnD
    if (!e.dataTransfer?.types.includes('Files')) return
    dragCounterRef.current++
    if (dragCounterRef.current === 1) {
      setIsDragging(true)
      // Check if any dragged items look like markdown (best-effort from item names)
      const items = e.dataTransfer?.items
      if (items) {
        const hasMd = Array.from(items).some((item) =>
          item.type === 'text/markdown' || item.type === 'text/x-markdown',
        )
        setHasMarkdown(hasMd)
      }
    }
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDragging(false)
      setHasMarkdown(false)
    }
  }, [])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setIsDragging(false)
    setHasMarkdown(false)

    const files = e.dataTransfer?.files
    if (!files?.length) return

    const allFiles = Array.from(files)
    const { markdown, other } = partitionMarkdownFiles(allFiles)

    // Import markdown files as documents
    if (markdown.length > 0) {
      const count = await importMarkdownFiles(markdown)
      if (count > 0) {
        console.log(`Imported ${count} markdown file(s) as document(s)`)
      }
    }

    // Upload non-markdown files to storage
    if (other.length > 0) {
      setStorageDrawerOpen(true)
      const validFiles = other.filter((file) => {
        if (file.size > MAX_FILE_SIZE) {
          console.warn(`"${file.name}" is too large (max 100MB)`)
          return false
        }
        return true
      })
      await Promise.allSettled(validFiles.map((file) => uploadWithProgress(file)))
    }
  }, [setStorageDrawerOpen, uploadWithProgress, importMarkdownFiles])

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
        {hasMarkdown ? (
          <FileText className="h-12 w-12 text-brand-400" />
        ) : (
          <Upload className="h-12 w-12 text-brand-400" />
        )}
        <p className={cn('text-lg font-semibold', isDark ? 'text-neutral-100' : 'text-neutral-900')}>
          {hasMarkdown ? 'Drop to create notes' : 'Drop files to upload'}
        </p>
        <p className={cn('text-sm', isDark ? 'text-neutral-400' : 'text-neutral-500')}>
          {hasMarkdown
            ? 'Markdown files will be imported as documents'
            : 'Files will be uploaded to storage (max 100MB each)'}
        </p>
      </div>
    </div>
  )
}
