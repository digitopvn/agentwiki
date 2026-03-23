/** Embedding generation + Vectorize storage */

import { chunkMarkdown } from '../utils/chunker'
import type { Env } from '../env'

/** Generate embeddings for a document and store in Vectorize */
export async function embedDocument(env: Env, docId: string, content: string, tenantId: string, category?: string) {
  const chunks = chunkMarkdown(content)
  if (!chunks.length) return

  // Delete existing vectors for this document
  const existingIds = chunks.map((_, i) => `${docId}-${i}`)
  try {
    await env.VECTORIZE.deleteByIds(existingIds)
  } catch {
    // May not exist yet
  }

  // Generate embeddings in batches (Workers AI)
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
        id: `${docId}-${batch[j].index}`,
        values: result.data[j],
        metadata: {
          org_id: tenantId,
          doc_id: docId,
          chunk_index: batch[j].index,
          heading: batch[j].heading ?? '',
          heading_chain: batch[j].headingChain ?? '',
          category: category ?? '',
        },
      })
    }
  }

  // Upsert to Vectorize
  if (vectors.length) {
    await env.VECTORIZE.upsert(vectors)
  }

  return { chunksProcessed: chunks.length, vectorsStored: vectors.length }
}

/** Generate embedding for a search query */
export async function embedQuery(env: Env, query: string): Promise<number[]> {
  const result = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: [query],
  }) as { data: number[][] }
  return result.data[0]
}

/** Delete all vectors for a document */
export async function deleteDocumentVectors(env: Env, docId: string, maxChunks = 50) {
  const ids = Array.from({ length: maxChunks }, (_, i) => `${docId}-${i}`)
  try {
    await env.VECTORIZE.deleteByIds(ids)
  } catch {
    // Ignore if not found
  }
}
