/** Cloudflare Queue consumer — processes async jobs */

import { embedDocument } from '../services/embedding-service'
import { generateSummaryWithProvider } from '../ai/ai-service'
import { indexDocumentTrigrams } from '../services/trigram-service'
import { indexDocumentFTS5, backfillFTS5Index } from '../services/fts5-search-service'
import { pruneOldAnalytics } from '../services/analytics-service'
import { computeSimilarities } from '../services/similarity-service'
import { inferEdgeTypesForDoc } from '../services/graph-ai-service'
import { runImport } from '../services/import/import-engine'
import { ObsidianAdapter } from '../services/import/adapters/obsidian-adapter'
import { NotionAdapter } from '../services/import/adapters/notion-adapter'
import { LarkAdapter } from '../services/import/adapters/lark-adapter'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { documents, uploads, fileExtractions, importJobs } from '../db/schema'
import { chunkMarkdown } from '../utils/chunker'
import { computeHash } from '../utils/hash'
import type { Env } from '../env'

interface QueueMessage {
  type: string
  documentId?: string
  uploadId?: string
  jobId?: string
  tenantId: string
  offset?: number // for backfill continuation
}

/** Queue consumer entry point */
export async function handleQueueBatch(
  batch: MessageBatch<QueueMessage>,
  env: Env,
) {
  for (const message of batch.messages) {
    try {
      await processMessage(message.body, env)
      message.ack()
    } catch (err) {
      console.error(`Queue job failed [${message.body.type}]:`, err)
      message.retry()
    }
  }
}

async function processMessage(msg: QueueMessage, env: Env) {
  switch (msg.type) {
    case 'generate-summary':
      if (msg.documentId) await generateSummary(env, msg.documentId, msg.tenantId)
      break
    case 'embed':
      if (msg.documentId) await embedDocumentJob(env, msg.documentId, msg.tenantId)
      break
    case 'index-trigrams':
      if (msg.documentId) await indexDocumentTrigrams(env, msg.documentId, msg.tenantId)
      break
    case 'cleanup-analytics':
      await pruneOldAnalytics(env, msg.tenantId, 90)
      break
    case 'embed-upload':
      if (msg.uploadId) await embedUploadJob(env, msg.uploadId, msg.tenantId)
      break
    case 'summarize-upload':
      if (msg.uploadId) await summarizeUploadJob(env, msg.uploadId, msg.tenantId)
      break
    case 'compute-similarities':
      if (msg.documentId) await computeSimilarities(env, msg.documentId, msg.tenantId)
      break
    case 'infer-edge-types':
      if (msg.documentId) await inferEdgeTypesForDoc(env, msg.documentId, msg.tenantId)
      break
    case 'index-fts5':
      if (msg.documentId) await indexFTS5Job(env, msg.documentId, msg.tenantId)
      break
    case 'backfill-fts5': {
      const result = await backfillFTS5Index(env, msg.offset ?? 0)
      // Re-enqueue if more documents to process
      if (result.nextOffset !== null) {
        await env.QUEUE.send({ type: 'backfill-fts5', tenantId: msg.tenantId, offset: result.nextOffset })
      }
      break
    }
    case 'import-job':
      if (msg.jobId) await importJobHandler(env, msg.jobId, msg.tenantId)
      break
    default:
      console.warn(`Unknown queue message type: ${msg.type}`)
  }
}

/** Generate AI summary — uses tenant's configured provider, falls back to Workers AI */
async function generateSummary(env: Env, documentId: string, tenantId: string) {
  const db = drizzle(env.DB)
  const doc = await db
    .select({ content: documents.content, title: documents.title })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1)

  if (!doc.length || !doc[0].content) return

  const truncated = doc[0].content.slice(0, 3000)

  // Try tenant's configured AI provider first
  let summaryGenerated = false
  try {
    const summary = await generateSummaryWithProvider(env, tenantId, doc[0].title, truncated)
    if (summary) {
      await db.update(documents).set({ summary }).where(eq(documents.id, documentId))
      summaryGenerated = true
    }
  } catch (err) {
    console.warn('AI provider summary failed, falling back to Workers AI:', err)
  }

  // Fallback: Workers AI (Llama 3.1 8B)
  if (!summaryGenerated) {
    const result = await (env.AI as Ai).run('@cf/meta/llama-3.1-8b-instruct' as never, {
      messages: [
        {
          role: 'system',
          content: 'Summarize the following document in 1-2 concise sentences. Return only the summary.',
        },
        {
          role: 'user',
          content: `Title: ${doc[0].title}\n\n${truncated}`,
        },
      ],
      max_tokens: 150,
    } as never) as { response: string }

    if (result.response) {
      await db
        .update(documents)
        .set({ summary: result.response.trim() })
        .where(eq(documents.id, documentId))
    }
  }

  // Trigger embedding + FTS5 indexing after summary is written (so FTS5 includes summary)
  await embedDocumentJob(env, documentId, tenantId)
  await indexFTS5Job(env, documentId, tenantId)
}

/** Generate embeddings for a document — skips if content unchanged (hash check) */
async function embedDocumentJob(env: Env, documentId: string, tenantId: string) {
  const db = drizzle(env.DB)
  const doc = await db
    .select({
      content: documents.content,
      category: documents.category,
      contentHash: documents.contentHash,
    })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1)

  if (!doc.length || !doc[0].content) return

  // Content hash check — skip re-embedding if content unchanged
  const hash = await computeHash(doc[0].content)
  if (doc[0].contentHash === hash) {
    console.log(`Skip re-embed: content unchanged for ${documentId}`)
    return
  }

  await embedDocument(env, documentId, doc[0].content, tenantId, doc[0].category ?? undefined)

  // Store hash after successful embedding
  await db.update(documents).set({ contentHash: hash }).where(eq(documents.id, documentId))

  // Trigger similarity computation after embedding completes
  await env.QUEUE.send({ type: 'compute-similarities', documentId, tenantId })
}

/** Generate embeddings for uploaded file's extracted text */
async function embedUploadJob(env: Env, uploadId: string, tenantId: string) {
  const db = drizzle(env.DB)
  const extraction = await db
    .select({
      extractedText: fileExtractions.extractedText,
      vectorId: fileExtractions.vectorId,
      chunkCount: fileExtractions.chunkCount,
    })
    .from(fileExtractions)
    .where(eq(fileExtractions.uploadId, uploadId))
    .limit(1)

  if (!extraction.length || !extraction[0].extractedText) return

  const text = extraction[0].extractedText
  const vectorPrefix = extraction[0].vectorId ?? `upload-${uploadId}`
  const oldChunkCount = extraction[0].chunkCount ?? 0
  const chunks = chunkMarkdown(text)
  if (!chunks.length) return

  // Delete existing vectors — use max(old, new) to clean up orphans from previous extractions
  const deleteCount = Math.max(oldChunkCount, chunks.length)
  const existingIds = Array.from({ length: deleteCount }, (_, i) => `${vectorPrefix}-${i}`)
  try { await env.VECTORIZE.deleteByIds(existingIds) } catch { /* may not exist */ }

  // Generate embeddings in batches
  const batchSize = 5
  const vectors: VectorizeVector[] = []

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    const texts = batch.map((c) => c.text)

    const result = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: texts,
    }) as { data: number[][] }

    for (let j = 0; j < batch.length; j++) {
      vectors.push({
        id: `${vectorPrefix}-${batch[j].index}`,
        values: result.data[j],
        metadata: {
          org_id: tenantId,
          upload_id: uploadId,
          source_type: 'upload',
          chunk_index: batch[j].index,
          heading: batch[j].heading ?? '',
        },
      })
    }
  }

  if (vectors.length) {
    await env.VECTORIZE.upsert(vectors)
  }

  // Store actual chunk count for exact cleanup on re-extraction or deletion
  await db.update(fileExtractions)
    .set({ chunkCount: chunks.length })
    .where(eq(fileExtractions.uploadId, uploadId))
}

/** Generate AI summary for uploaded file's extracted text */
async function summarizeUploadJob(env: Env, uploadId: string, tenantId: string) {
  const db = drizzle(env.DB)
  const extraction = await db
    .select({ extractedText: fileExtractions.extractedText })
    .from(fileExtractions)
    .where(eq(fileExtractions.uploadId, uploadId))
    .limit(1)

  if (!extraction.length || !extraction[0].extractedText) return

  const truncated = extraction[0].extractedText.slice(0, 3000)

  // Try tenant's configured AI provider first
  try {
    const summary = await generateSummaryWithProvider(env, tenantId, 'Uploaded file', truncated)
    if (summary) {
      await db.update(uploads).set({ summary }).where(eq(uploads.id, uploadId))
      return
    }
  } catch (err) {
    console.warn('AI provider summary failed for upload, falling back to Workers AI:', err)
  }

  // Fallback: Workers AI
  const result = await (env.AI as Ai).run('@cf/meta/llama-3.1-8b-instruct' as never, {
    messages: [
      { role: 'system', content: 'Summarize the following file content in 1-2 concise sentences. Return only the summary.' },
      { role: 'user', content: truncated },
    ],
    max_tokens: 150,
  } as never) as { response: string }

  if (result.response) {
    await db.update(uploads).set({ summary: result.response.trim() }).where(eq(uploads.id, uploadId))
  }
}

/** Index a document into FTS5 virtual table for BM25 search (with content hash skip) */
async function indexFTS5Job(env: Env, documentId: string, tenantId: string) {
  const db = drizzle(env.DB)
  const rows = await db
    .select({
      title: documents.title,
      summary: documents.summary,
      content: documents.content,
      contentHash: documents.contentHash,
    })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1)

  if (!rows.length) return
  const doc = rows[0]

  // Skip re-indexing if content hasn't changed (same optimization as embedDocumentJob).
  // NOTE: contentHash is populated by embedDocumentJob, not indexFTS5Job. If embedding
  // hasn't run yet, contentHash is null and this guard won't fire (benign: just redundant work).
  const newHash = await computeHash(doc.content)
  if (doc.contentHash && doc.contentHash === newHash) return

  await indexDocumentFTS5(env, documentId, tenantId, doc.title, doc.summary ?? '', doc.content)
}

/** Process an import job — load adapter, parse source, run import engine */
async function importJobHandler(env: Env, jobId: string, tenantId: string) {
  const db = drizzle(env.DB)
  const job = await db.select().from(importJobs).where(eq(importJobs.id, jobId)).limit(1)
  if (!job.length) return

  const { source, fileKey, larkConfig, userId, targetFolderId } = job[0]

  try {
    // Select adapter based on source
    const adapters: Record<string, { adapter: InstanceType<typeof ObsidianAdapter | typeof NotionAdapter | typeof LarkAdapter>; needsZip: boolean }> = {
      obsidian: { adapter: new ObsidianAdapter(), needsZip: true },
      notion: { adapter: new NotionAdapter(), needsZip: true },
      lark: { adapter: new LarkAdapter(), needsZip: false },
    }

    const entry = adapters[source]
    if (!entry) throw new Error(`Unknown import source: ${source}`)

    // Load ZIP data from R2 if needed
    let zipData: ArrayBuffer | null = null
    if (entry.needsZip && fileKey) {
      const obj = await env.R2.get(fileKey)
      if (!obj) throw new Error('ZIP file not found in R2')
      zipData = await obj.arrayBuffer()
    }

    // Extract Lark config and immediately clear token from DB before processing
    let config: { token: string; spaceId?: string } | undefined
    if (larkConfig) {
      config = { token: larkConfig.token, spaceId: larkConfig.spaceId }
      // Clear token from DB immediately — hold in memory only during processing
      await db.update(importJobs).set({ larkConfig: null }).where(eq(importJobs.id, jobId))
    }

    // Parse source
    const { folders, documents } = await entry.adapter.parse(env, zipData, config)

    // Run import engine
    await runImport(env, jobId, tenantId, userId, folders, documents, targetFolderId)

    // Cleanup: delete temp ZIP from R2
    if (fileKey) {
      try { await env.R2.delete(fileKey) } catch { /* non-fatal */ }
    }
  } catch (err) {
    // Always clear Lark token on failure for security
    await db.update(importJobs).set({
      status: 'failed',
      errors: [{ path: '', message: (err as Error).message }],
      errorCount: 1,
      larkConfig: null,
    }).where(eq(importJobs.id, jobId))

    // Write error to KV for SSE
    try {
      await env.KV.put(`import:${jobId}`, JSON.stringify({
        type: 'error',
        message: (err as Error).message,
      }), { expirationTtl: 3600 })
    } catch { /* KV error non-fatal */ }
  }
}
