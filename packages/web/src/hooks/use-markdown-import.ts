/** Hook for importing markdown files as new documents */

import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateDocument } from './use-documents'
import { useAppStore } from '../stores/app-store'

const MARKDOWN_EXTENSIONS = /\.(md|markdown)$/i
const MAX_MD_FILE_SIZE = 10 * 1024 * 1024 // 10MB

/** Check if a file is a markdown file by extension */
export function isMarkdownFile(file: File): boolean {
  return MARKDOWN_EXTENSIONS.test(file.name)
}

/** Split files into markdown and non-markdown groups */
export function partitionMarkdownFiles(files: File[]): { markdown: File[]; other: File[] } {
  const markdown: File[] = []
  const other: File[] = []
  for (const file of files) {
    if (isMarkdownFile(file)) markdown.push(file)
    else other.push(file)
  }
  return { markdown, other }
}

export function useMarkdownImport(): {
  importMarkdownFiles: (files: File[], folderId?: string) => Promise<number>
  isImporting: boolean
} {
  const createDocument = useCreateDocument()
  const { openTab, setActiveTab } = useAppStore()
  const navigate = useNavigate()
  const [isImporting, setIsImporting] = useState(false)

  const importMarkdownFiles = useCallback(async (files: File[], folderId?: string): Promise<number> => {
    setIsImporting(true)
    try {
      let imported = 0
      let lastDoc: { id: string; title: string; slug: string } | null = null

      for (const file of files) {
        if (file.size > MAX_MD_FILE_SIZE) {
          console.warn(`Skipping "${file.name}": exceeds 10MB limit`)
          continue
        }

        try {
          const content = await file.text()
          const title = file.name.replace(MARKDOWN_EXTENSIONS, '')

          const doc = await createDocument.mutateAsync({
            title,
            content,
            folderId,
          })

          imported++
          lastDoc = doc

          // Open each imported doc in a tab
          const tabId = `tab-${doc.id}`
          openTab({ id: tabId, documentId: doc.id, title: doc.title })
        } catch (err) {
          console.error(`Failed to import "${file.name}":`, err)
        }
      }

      // Navigate only to the last imported doc (avoids redundant history entries)
      if (lastDoc) {
        const tabId = `tab-${lastDoc.id}`
        setActiveTab(tabId)
        navigate(`/doc/${lastDoc.slug}`)
      }

      return imported
    } finally {
      setIsImporting(false)
    }
  }, [createDocument, openTab, setActiveTab, navigate])

  return { importMarkdownFiles, isImporting }
}
