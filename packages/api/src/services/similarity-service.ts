/** Similarity computation + caching — implicit graph edges from Vectorize */

import { eq, and, desc, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { documentSimilarities, documents } from '../db/schema'
import { generateId } from '../utils/crypto'
import type { Env } from '../env'
import type { SimilarDoc } from '@agentwiki/shared'

const SIMILARITY_THRESHOLD = 0.7
const TOP_K = 6 // query 6, filter self → keep top 5

/** Extract doc ID from vector ID format "{docId}-{chunkIndex}" */
function extractDocId(vectorId: string): string {
  const lastDash = vectorId.lastIndexOf('-')
  return lastDash >= 0 ? vectorId.slice(0, lastDash) : vectorId
}

/** Fetch the embedding vector for a document's primary chunk (chunk 0) */
async function getDocumentVector(env: Env, documentId: string): Promise<number[] | null> {
  const vectorId = `${documentId}-0`
  try {
    const result = await env.VECTORIZE.getByIds([vectorId])
    if (result.length && result[0].values) {
      return Array.from(result[0].values)
    }
  } catch {
    // Vector may not exist yet
  }
  return null
}

/** Compute and cache top-5 similar docs for a document (async Queue job) */
export async function computeSimilarities(
  env: Env,
  documentId: string,
  tenantId: string,
) {
  const db = drizzle(env.DB)

  const vector = await getDocumentVector(env, documentId)
  if (!vector) return

  const queryResult = await env.VECTORIZE.query(vector, {
    topK: TOP_K,
    filter: { org_id: tenantId },
    returnValues: false,
    returnMetadata: 'indexed',
  })

  if (!queryResult.matches?.length) return

  // Filter: remove self (any chunk of same doc), apply threshold
  const similar = queryResult.matches
    .filter((m) => extractDocId(m.id) !== documentId && m.score >= SIMILARITY_THRESHOLD)
    .slice(0, 5)

  // Clear old cached similarities
  await db.delete(documentSimilarities)
    .where(eq(documentSimilarities.sourceDocId, documentId))

  if (!similar.length) return

  // Batch-verify all target docs exist in same tenant (avoid N+1)
  const targetIds = similar.map((m) => extractDocId(m.id))
  const existing = await db.select({ id: documents.id })
    .from(documents)
    .where(and(inArray(documents.id, targetIds), eq(documents.tenantId, tenantId)))
  const validIds = new Set(existing.map((e) => e.id))

  // Insert new similarities for valid targets
  const now = new Date()
  for (const match of similar) {
    const targetDocId = extractDocId(match.id)
    if (!validIds.has(targetDocId)) continue

    await db.insert(documentSimilarities).values({
      id: generateId(),
      sourceDocId: documentId,
      targetDocId,
      score: match.score,
      computedAt: now,
    })
  }
}

/** Get cached similar docs for a document */
export async function getCachedSimilarities(env: Env, documentId: string) {
  const db = drizzle(env.DB)
  return db.select({
    targetDocId: documentSimilarities.targetDocId,
    score: documentSimilarities.score,
    title: documents.title,
    slug: documents.slug,
    category: documents.category,
  })
    .from(documentSimilarities)
    .innerJoin(documents, eq(documentSimilarities.targetDocId, documents.id))
    .where(eq(documentSimilarities.sourceDocId, documentId))
    .orderBy(desc(documentSimilarities.score))
}

/** On-demand Vectorize similarity query (fresh, not cached) */
export async function querySimilarDocs(
  env: Env,
  documentId: string,
  tenantId: string,
  limit = 10,
  minScore = 0.5,
): Promise<SimilarDoc[]> {
  const vector = await getDocumentVector(env, documentId)
  if (!vector) return []

  const queryResult = await env.VECTORIZE.query(vector, {
    topK: limit + 5, // extra to account for self-chunks + filtering
    filter: { org_id: tenantId },
    returnValues: false,
    returnMetadata: 'indexed',
  })

  if (!queryResult.matches?.length) return []

  // Filter self + apply min score, deduplicate by doc ID (keep highest score)
  const scoreMap = new Map<string, number>()
  for (const m of queryResult.matches) {
    const docId = extractDocId(m.id)
    if (docId === documentId || m.score < minScore) continue
    if (!scoreMap.has(docId) || m.score > scoreMap.get(docId)!) {
      scoreMap.set(docId, m.score)
    }
  }

  if (!scoreMap.size) return []

  const uniqueIds = [...scoreMap.keys()]

  // Resolve doc metadata — fetch only matched IDs, not all tenant docs
  const db = drizzle(env.DB)
  const allDocs = await db.select({
    id: documents.id,
    title: documents.title,
    slug: documents.slug,
    category: documents.category,
  })
    .from(documents)
    .where(and(eq(documents.tenantId, tenantId), inArray(documents.id, uniqueIds)))

  const docMap = new Map(allDocs.map((d) => [d.id, d]))

  const results: SimilarDoc[] = []
  for (const [docId, score] of scoreMap) {
    const doc = docMap.get(docId)
    if (doc) {
      results.push({
        id: doc.id,
        title: doc.title,
        slug: doc.slug,
        category: doc.category,
        score,
      })
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
