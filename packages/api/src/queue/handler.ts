/** Cloudflare Queue consumer — processes async jobs */

import { embedDocument } from '../services/embedding-service'
import { generateSummaryWithProvider } from '../ai/ai-service'
import { indexDocumentTrigrams } from '../services/trigram-service'
import { pruneOldAnalytics } from '../services/analytics-service'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { documents } from '../db/schema'
import type { Env } from '../env'

interface QueueMessage {
  type: string
  documentId: string
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
      await generateSummary(env, msg.documentId, msg.tenantId)
      break
    case 'embed':
      await embedDocumentJob(env, msg.documentId, msg.tenantId)
      break
    case 'index-trigrams':
      await indexDocumentTrigrams(env, msg.documentId, msg.tenantId)
      break
    case 'cleanup-analytics':
      await pruneOldAnalytics(env, msg.tenantId, 90)
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
