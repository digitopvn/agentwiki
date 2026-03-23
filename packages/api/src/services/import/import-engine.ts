/** Core import engine — processes normalized documents into AgentWiki */

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { importJobs, documentLinks, documents } from '../../db/schema'
import { createDocument } from '../document-service'
import { createFolder } from '../folder-service'
import { generateId } from '../../utils/crypto'
import { rewriteImageLinks, rewriteObsidianEmbeds, rewriteWikilinks } from './utils/markdown-rewriter'
import { sanitizeFilename, getMimeType } from './utils/zip-parser'
import type { ImportFolder, ImportDocument, ImportProgressEvent, ImportSummary, ImportError } from '@agentwiki/shared'
import type { ImportMappings } from './import-types'
import type { Env } from '../../env'

/** Run the full import pipeline */
export async function runImport(
  env: Env,
  jobId: string,
  tenantId: string,
  userId: string,
  folders: ImportFolder[],
  documents: ImportDocument[],
  targetFolderId?: string | null,
): Promise<ImportSummary> {
  const db = drizzle(env.DB)
  const startTime = Date.now()
  const errors: ImportError[] = []
  const mappings: ImportMappings = {
    folderMap: new Map(),
    documentMap: new Map(),
    slugMap: new Map(),
    attachmentMap: new Map(),
  }

  // Update job status to processing
  await db.update(importJobs).set({
    status: 'processing',
    totalDocs: documents.length,
    totalAttachments: documents.reduce((sum, d) => sum + d.attachments.length, 0),
  }).where(eq(importJobs.id, jobId))

  await emitProgress(env, jobId, { type: 'start', total: documents.length })

  // Step 1: Create folder hierarchy
  let foldersCreated = 0
  for (const folder of folders) {
    try {
      const parentId = folder.parentPath
        ? mappings.folderMap.get(folder.parentPath) ?? targetFolderId
        : targetFolderId
      const result = await createFolder(env, tenantId, userId, folder.name, parentId)
      mappings.folderMap.set(folder.sourcePath, result.id)
      foldersCreated++
      await emitProgress(env, jobId, { type: 'folder', name: folder.name, current: foldersCreated })
    } catch (err) {
      errors.push({ path: folder.sourcePath, message: `Folder creation failed: ${(err as Error).message}` })
    }
  }

  // Step 2: Process documents one by one
  let docsCreated = 0
  let attachmentsUploaded = 0

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i]
    try {
      // Upload attachments to R2
      for (const att of doc.attachments) {
        try {
          const uploadId = generateId()
          const safeName = sanitizeFilename(att.filename)
          const fileKey = `${tenantId}/media/${uploadId}/${safeName}`
          await env.R2.put(fileKey, att.data, {
            httpMetadata: { contentType: att.contentType || getMimeType(att.filename) },
            customMetadata: { tenantId, uploadedBy: userId },
          })
          const fileUrl = `/api/files/${fileKey}`
          mappings.attachmentMap.set(att.sourcePath, fileUrl)
          // Also map by just filename for Obsidian ![[filename]] lookups
          mappings.attachmentMap.set(att.filename, fileUrl)
          attachmentsUploaded++
          await emitProgress(env, jobId, { type: 'attachment', name: att.filename })
        } catch (err) {
          errors.push({ path: att.sourcePath, message: `Attachment upload failed: ${(err as Error).message}` })
        }
      }

      // Rewrite image links in markdown content (wikilinks resolved in Step 3 after all docs exist)
      let content = rewriteImageLinks(doc.content, mappings.attachmentMap)
      content = rewriteObsidianEmbeds(content, mappings.attachmentMap)

      // Determine target folder
      const dirPath = doc.sourcePath.includes('/')
        ? doc.sourcePath.substring(0, doc.sourcePath.lastIndexOf('/'))
        : undefined
      const folderId = dirPath
        ? mappings.folderMap.get(dirPath) ?? targetFolderId
        : targetFolderId

      // Create document
      const result = await createDocument(env, tenantId, userId, {
        title: doc.title,
        content,
        folderId: folderId ?? undefined,
        tags: doc.tags?.slice(0, 20),
      })

      mappings.documentMap.set(doc.sourcePath, result.id)
      mappings.slugMap.set(doc.sourcePath, result.slug)
      // Also map by title and filename-without-ext for wikilink resolution
      const baseName = doc.sourcePath.replace(/\.md$/i, '')
      mappings.slugMap.set(baseName, result.slug)
      mappings.slugMap.set(doc.title, result.slug)
      mappings.slugMap.set(doc.title.toLowerCase(), result.slug)

      docsCreated++

      // Update progress
      await db.update(importJobs).set({ processedDocs: docsCreated, processedAttachments: attachmentsUploaded }).where(eq(importJobs.id, jobId))
      await emitProgress(env, jobId, { type: 'document', name: doc.title, current: docsCreated, total: documents.length })
    } catch (err) {
      errors.push({ path: doc.sourcePath, message: `Document import failed: ${(err as Error).message}` })
    }
  }

  // Step 3: Rewrite wikilinks now that all documents are created and slugMap is complete
  for (const doc of documents) {
    const docId = mappings.documentMap.get(doc.sourcePath)
    if (!docId) continue
    // Only rewrite if document has wikilink syntax
    if (!doc.content.includes('[[')) continue

    try {
      const rewritten = rewriteWikilinks(doc.content, mappings.slugMap)
      if (rewritten !== doc.content) {
        await db.update(documents).set({ content: rewritten }).where(eq(documents.id, docId))
      }
    } catch {
      // Non-fatal: wikilink rewriting failure doesn't block import
    }
  }

  // Step 4: Resolve internal links (insert document_links rows)
  let linksResolved = 0
  for (const doc of documents) {
    const sourceDocId = mappings.documentMap.get(doc.sourcePath)
    if (!sourceDocId || !doc.internalLinks.length) continue

    for (const link of doc.internalLinks) {
      const targetDocId = mappings.documentMap.get(link.targetSourcePath)
        ?? mappings.documentMap.get(link.targetSourcePath.replace(/\.md$/i, ''))
      if (targetDocId && targetDocId !== sourceDocId) {
        try {
          await db.insert(documentLinks).values({
            id: generateId(),
            sourceDocId,
            targetDocId,
            context: link.ref,
            createdAt: new Date(),
          })
          linksResolved++
        } catch {
          // Duplicate link or FK error — skip silently
        }
      }
    }
  }

  if (linksResolved > 0) {
    await emitProgress(env, jobId, { type: 'link-resolve', current: linksResolved })
  }

  // Finalize
  const summary: ImportSummary = {
    foldersCreated,
    documentsCreated: docsCreated,
    attachmentsUploaded,
    linksResolved,
    errors,
    durationMs: Date.now() - startTime,
  }

  await db.update(importJobs).set({
    status: errors.length && !docsCreated ? 'failed' : 'completed',
    processedDocs: docsCreated,
    processedAttachments: attachmentsUploaded,
    errorCount: errors.length,
    errors: errors.length ? errors : null,
    completedAt: new Date(),
  }).where(eq(importJobs.id, jobId))

  await emitProgress(env, jobId, { type: 'complete', summary })

  return summary
}

/** Sequence counter for progress events — ensures SSE clients detect every event */
const progressSeqMap = new Map<string, number>()

/** Write progress event to KV for SSE streaming with sequence counter */
async function emitProgress(env: Env, jobId: string, event: ImportProgressEvent): Promise<void> {
  try {
    const seq = (progressSeqMap.get(jobId) ?? 0) + 1
    progressSeqMap.set(jobId, seq)
    const eventWithSeq = { ...event, seq }
    await env.KV.put(`import:${jobId}`, JSON.stringify(eventWithSeq), { expirationTtl: 3600 })
    // Clean up seq map when import completes
    if (event.type === 'complete' || event.type === 'error') {
      progressSeqMap.delete(jobId)
    }
  } catch {
    // KV write failure is non-fatal
  }
}
