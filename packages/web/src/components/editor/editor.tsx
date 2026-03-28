/** BlockNote editor wrapper: loads content from API, auto-saves on change (debounced 2s, deferred markdown) */

import { useEffect, useRef, useCallback } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  FormattingToolbarController,
  FormattingToolbar,
  BlockTypeSelect,
  BasicTextStyleButton,
  TextAlignButton,
  ColorStyleButton,
  NestBlockButton,
  UnnestBlockButton,
  CreateLinkButton,
} from '@blocknote/react'
import { filterSuggestionItems } from '@blocknote/core'
import '@blocknote/mantine/style.css'
import { useDocument, useUpdateDocument } from '../../hooks/use-documents'
import { useAppStore } from '../../stores/app-store'
import { useAI } from '../../hooks/use-ai'
import { getAISlashMenuItems } from './ai-slash-commands'
import { AISelectionToolbar } from './ai-selection-toolbar'
import { cn } from '../../lib/utils'
import { API_BASE } from '../../lib/api-client'
import { createPasteMarkdownPlugin } from './paste-markdown-extension'

// Safari lacks requestIdleCallback — polyfill with setTimeout (module-level, evaluated once)
const rIC: typeof requestIdleCallback =
  typeof window !== 'undefined' && window.requestIdleCallback
    ? window.requestIdleCallback.bind(window)
    : (cb) => window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline), 0)
const cIC: typeof cancelIdleCallback =
  typeof window !== 'undefined' && window.cancelIdleCallback
    ? window.cancelIdleCallback.bind(window)
    : clearTimeout

interface EditorProps {
  documentId: string
  tabId: string
}

export function Editor({ documentId, tabId }: EditorProps) {
  const { data: doc, isLoading } = useDocument(documentId)
  const updateDocument = useUpdateDocument()
  const { markTabDirty, updateTabTitle, theme } = useAppStore()
  const { isGenerating, error: aiError, generate, transform } = useAI()

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const markdownIdleRef = useRef<number | null>(null)
  const isDirtyRef = useRef(false)
  const mountedRef = useRef(true)
  const initializedRef = useRef(false)

  const editor = useCreateBlockNote({
    uploadFile: async (file: File) => {
      if (!file.type.startsWith('image/')) {
        throw new Error('Only image files are supported')
      }

      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${API_BASE}/api/uploads`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error ?? `Upload failed (${res.status})`)
      }

      const data = await res.json() as { fileKey?: string }
      if (!data.fileKey) throw new Error('Upload response missing fileKey')
      return `${API_BASE}/api/files/${data.fileKey}`
    },
  })

  // Register paste-markdown plugin once (handles pasting content with code fences)
  // Placed at head of plugin list so it runs before BlockNote's default paste handler
  useEffect(() => {
    const plugin = createPasteMarkdownPlugin(editor)
    editor._tiptapEditor.registerPlugin(plugin, (p, existing) => [p, ...existing])
    return () => { editor._tiptapEditor.unregisterPlugin('pasteMarkdownWithCodeBlocks') }
  }, [editor])

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

  // Debounced auto-save: contentJson first (fast), markdown deferred via requestIdleCallback
  const handleChange = useCallback(() => {
    // Skip redundant dirty-state updates
    if (!isDirtyRef.current) {
      isDirtyRef.current = true
      markTabDirty(tabId, true)
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        const contentJson = editor.document

        // Stage 1: save contentJson immediately (near-zero cost)
        await updateDocument.mutateAsync({
          id: documentId,
          contentJson,
        })

        isDirtyRef.current = false
        markTabDirty(tabId, false)

        // Stage 2: defer expensive markdown conversion until browser is idle
        // Capture snapshot NOW (not at idle time) to avoid stale data
        const snapshotBlocks = editor.document
        if (markdownIdleRef.current) cIC(markdownIdleRef.current)
        markdownIdleRef.current = rIC(async () => {
          if (!mountedRef.current) return // guard against unmounted async work
          try {
            const content = await editor.blocksToMarkdownLossy(snapshotBlocks)
            if (!mountedRef.current) return
            await updateDocument.mutateAsync({ id: documentId, content })
          } catch (err) {
            console.error('Deferred markdown sync failed:', err)
          }
        }, { timeout: 5000 })
      } catch (err) {
        console.error('Auto-save failed:', err)
      }
    }, 2000)
  }, [editor, documentId, tabId, markTabDirty, updateDocument])

  // Update tab title when doc title is changed externally
  useEffect(() => {
    if (doc?.title) {
      updateTabTitle(tabId, doc.title)
    }
  }, [doc?.title, tabId, updateTabTitle])

  // Cleanup timers on unmount + guard async work
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (markdownIdleRef.current) cIC(markdownIdleRef.current)
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

      {/* AI error indicator */}
      {aiError && (
        <div className="mx-4 mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
          AI error: {aiError}
        </div>
      )}

      {/* BlockNote editor with AI slash commands and selection toolbar */}
      <div className="flex-1 overflow-y-auto px-1 md:px-4">
        <BlockNoteView
          editor={editor}
          onChange={handleChange}
          theme={theme}
          className="min-h-full"
          slashMenu={false}
          formattingToolbar={false}
        >
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(
                [...getDefaultReactSlashMenuItems(editor), ...getAISlashMenuItems(editor, documentId, generate)],
                query,
              )
            }
          />
          <FormattingToolbarController
            formattingToolbar={() => (
              <FormattingToolbar>
                <BlockTypeSelect key="blockTypeSelect" />
                <BasicTextStyleButton basicTextStyle="bold" key="boldStyleButton" />
                <BasicTextStyleButton basicTextStyle="italic" key="italicStyleButton" />
                <BasicTextStyleButton basicTextStyle="underline" key="underlineStyleButton" />
                <BasicTextStyleButton basicTextStyle="strike" key="strikeStyleButton" />
                <BasicTextStyleButton basicTextStyle="code" key="codeStyleButton" />
                <TextAlignButton textAlignment="left" key="textAlignLeftButton" />
                <TextAlignButton textAlignment="center" key="textAlignCenterButton" />
                <TextAlignButton textAlignment="right" key="textAlignRightButton" />
                <ColorStyleButton key="colorStyleButton" />
                <NestBlockButton key="nestBlockButton" />
                <UnnestBlockButton key="unnestBlockButton" />
                <CreateLinkButton key="createLinkButton" />
                <AISelectionToolbar
                  key="aiToolbar"
                  editor={editor}
                  documentId={documentId}
                  transform={transform}
                  isGenerating={isGenerating}
                />
              </FormattingToolbar>
            )}
          />
        </BlockNoteView>
      </div>
    </div>
  )
}
