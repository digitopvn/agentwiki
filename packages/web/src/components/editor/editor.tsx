/** BlockNote editor wrapper: loads content from API, auto-saves on change (debounced 1s) */

import { useEffect, useRef, useCallback } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import { useDocument, useUpdateDocument } from '../../hooks/use-documents'
import { useAppStore } from '../../stores/app-store'
import { cn } from '../../lib/utils'

interface EditorProps {
  documentId: string
  tabId: string
}

export function Editor({ documentId, tabId }: EditorProps) {
  const { data: doc, isLoading } = useDocument(documentId)
  const updateDocument = useUpdateDocument()
  const { markTabDirty, updateTabTitle, theme } = useAppStore()

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initializedRef = useRef(false)
  const latestDocRef = useRef(doc)

  useEffect(() => {
    latestDocRef.current = doc
  }, [doc])

  const editor = useCreateBlockNote({
    uploadFile: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json() as { fileKey: string }
      return `/api/files/${data.fileKey}`
    },
  })

  // Load initial content once doc is fetched
  useEffect(() => {
    if (!doc || initializedRef.current) return
    initializedRef.current = true

    if (doc.contentJson) {
      try {
        const blocks = doc.contentJson as Parameters<typeof editor.replaceBlocks>[1]
        editor.replaceBlocks(editor.document, blocks)
      } catch {
        // Fallback: leave editor empty if contentJson is malformed
      }
    }
  }, [doc, editor])

  // Debounced save on editor change
  const handleChange = useCallback(() => {
    markTabDirty(tabId, true)

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        const contentJson = editor.document
        const content = await editor.blocksToMarkdownLossy(editor.document)

        await updateDocument.mutateAsync({
          id: documentId,
          content,
          contentJson,
        })

        markTabDirty(tabId, false)
      } catch (err) {
        console.error('Auto-save failed:', err)
      }
    }, 1000)
  }, [editor, documentId, tabId, markTabDirty, updateDocument])

  // Update tab title when doc title is changed externally
  useEffect(() => {
    if (doc?.title) {
      updateTabTitle(tabId, doc.title)
    }
  }, [doc?.title, tabId, updateTabTitle])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  if (isLoading) {
    return (
      <div className={cn('flex h-full items-center justify-center', theme === 'dark' ? 'bg-neutral-950' : 'bg-white')}>
        <div className="space-y-3 w-full max-w-2xl px-8">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className={cn('h-4 animate-pulse rounded', theme === 'dark' ? 'bg-neutral-800' : 'bg-neutral-100')}
              style={{ width: `${60 + i * 8}%` }}
            />
          ))}
        </div>
      </div>
    )
  }

  if (!doc) {
    return (
      <div className={cn('flex h-full items-center justify-center', theme === 'dark' ? 'bg-neutral-950 text-neutral-400' : 'bg-white text-neutral-500')}>
        <p className="text-sm">Document not found.</p>
      </div>
    )
  }

  return (
    <div className={cn('flex h-full flex-col', theme === 'dark' ? 'bg-neutral-950' : 'bg-white')}>
      {/* Document title */}
      <div className="px-4 pt-4 pb-2 md:px-8 md:pt-8">
        <input
          type="text"
          defaultValue={doc.title}
          placeholder="Untitled"
          className={cn(
            'w-full bg-transparent text-2xl font-bold outline-none placeholder-neutral-500 md:text-3xl',
            theme === 'dark' ? 'text-neutral-100' : 'text-neutral-900',
          )}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              const newTitle = e.currentTarget.value.trim() || 'Untitled'
              if (newTitle !== doc.title) {
                updateTabTitle(tabId, newTitle)
                updateDocument.mutateAsync({ id: documentId, title: newTitle }).catch((err) =>
                  console.error('Failed to update title:', err),
                )
              }
              editor.focus()
            }
          }}
          onBlur={async (e) => {
            const newTitle = e.target.value.trim() || 'Untitled'
            if (newTitle === doc.title) return
            updateTabTitle(tabId, newTitle)
            try {
              await updateDocument.mutateAsync({ id: documentId, title: newTitle })
            } catch (err) {
              console.error('Failed to update title:', err)
            }
          }}
        />
      </div>

      {/* BlockNote editor */}
      <div className="flex-1 overflow-y-auto px-1 md:px-4">
        <BlockNoteView
          editor={editor}
          onChange={handleChange}
          theme={theme}
          className="min-h-full"
        />
      </div>
    </div>
  )
}
