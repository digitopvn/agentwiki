/** Cloudflare Queue consumer — processes async jobs */

import { embedDocument } from '../services/embedding-service'
import { generateSummaryWithProvider } from '../ai/ai-service'
import { indexDocumentTrigrams } from '../services/trigram-service'
import { pruneOldAnalytics } from '../services/analytics-service'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { documents, uploads, fileExtractions } from '../db/schema'
import { chunkMarkdown } from '../utils/chunker'
import type { Env } from '../env'

interface QueueMessage {
  type: string
  documentId?: string
  uploadId?: string
  tenantId: string
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
  try {
    const summary = await generateSummaryWithProvider(env, tenantId, doc[0].title, truncated)
    if (summary) {
      await db.update(documents).set({ summary }).where(eq(documents.id, documentId))
      await embedDocumentJob(env, documentId, tenantId)
      return
    }
  } catch (err) {
    console.warn('AI provider summary failed, falling back to Workers AI:', err)
  }

  // Fallback: Workers AI (Llama 3.1 8B)
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

  // Also trigger embedding and trigram indexing
  await embedDocumentJob(env, documentId, tenantId)
  await indexDocumentTrigrams(env, documentId, tenantId)
}

/** Generate embeddings for a document (includes category in vector metadata) */
async function embedDocumentJob(env: Env, documentId: string, tenantId: string) {
  const db = drizzle(env.DB)
  const doc = await db
    .select({ content: documents.content, category: documents.category })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1)

  if (!doc.length || !doc[0].content) return

  await embedDocument(env, documentId, doc[0].content, tenantId, doc[0].category ?? undefined)
}

/** Generate embeddings for uploaded file's extracted text */
async function embedUploadJob(env: Env, uploadId: string, tenantId: string) {
  const db = drizzle(env.DB)
  const extraction = await db
    .select({ extractedText: fileExtractions.extractedText, vectorId: fileExtractions.vectorId })
    .from(fileExtractions)
    .where(eq(fileExtractions.uploadId, uploadId))
    .limit(1)

  if (!extraction.length || !extraction[0].extractedText) return

  const text = extraction[0].extractedText
  const vectorPrefix = extraction[0].vectorId ?? `upload-${uploadId}`
  const chunks = chunkMarkdown(text)
  if (!chunks.length) return

  // Delete existing vectors for this upload
  const existingIds = chunks.map((_, i) => `${vectorPrefix}-${i}`)
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
