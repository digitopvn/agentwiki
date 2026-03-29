/** Similarity computation + caching — implicit graph edges from Vectorize */

import { eq, and, or, desc, inArray, isNull, not, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { documentSimilarities, documentLinks, documents } from '../db/schema'
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

  if (!similar.length) {
    // No similar docs found — don't wipe existing cache
    return
  }

  // Batch-verify all target docs exist in same tenant and are not soft-deleted
  const targetIds = similar.map((m) => extractDocId(m.id))
  const existing = await db.select({ id: documents.id })
    .from(documents)
    .where(and(inArray(documents.id, targetIds), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))
  const validIds = new Set(existing.map((e) => e.id))

  // Insert new similarities for valid targets first, THEN delete stale ones
  // (avoids data loss if Vectorize query fails mid-way)
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
    }).onConflictDoUpdate({
      target: [documentSimilarities.sourceDocId, documentSimilarities.targetDocId],
      set: { score: match.score, computedAt: now },
    })
  }

  // Now remove stale entries that are no longer in the top-K
  const freshTargetIds = similar.map((m) => extractDocId(m.id)).filter((id) => validIds.has(id))
  if (freshTargetIds.length > 0) {
    await db.delete(documentSimilarities)
      .where(and(
        eq(documentSimilarities.sourceDocId, documentId),
        not(inArray(documentSimilarities.targetDocId, freshTargetIds)),
      ))
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
    .where(and(eq(documents.tenantId, tenantId), inArray(documents.id, uniqueIds), isNull(documents.deletedAt)))

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

/** Auto-create document_links from cached similarities (Queue job) */
export async function autoLinkFromSimilarities(
  env: Env,
  documentId: string,
  tenantId: string,
): Promise<number> {
  const db = drizzle(env.DB)

  // Tenant ownership check — prevent cross-tenant mutation
  const owner = await db.select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))
    .limit(1)
  if (!owner.length) return 0

  // 1. Get cached similarities with threshold filter
  const similarities = await db.select({
    targetDocId: documentSimilarities.targetDocId,
    score: documentSimilarities.score,
  })
    .from(documentSimilarities)
    .where(and(
      eq(documentSimilarities.sourceDocId, documentId),
      sql`${documentSimilarities.score} >= ${SIMILARITY_THRESHOLD}`,
    ))
    .orderBy(desc(documentSimilarities.score))

  if (!similarities.length) {
    // No similarities — remove all auto-links from/to this doc
    await db.delete(documentLinks).where(and(
      eq(documentLinks.sourceDocId, documentId),
      eq(documentLinks.inferred, 1),
    ))
    await db.delete(documentLinks).where(and(
      eq(documentLinks.targetDocId, documentId),
      eq(documentLinks.inferred, 1),
    ))
    return 0
  }

  const targetIds = similarities.map((s) => s.targetDocId)

  // 2. Batch-fetch all existing links for this doc (both directions) to avoid N+1
  const existingLinks = await db.select({
    sourceDocId: documentLinks.sourceDocId,
    targetDocId: documentLinks.targetDocId,
    inferred: documentLinks.inferred,
  })
    .from(documentLinks)
    .where(or(
      eq(documentLinks.sourceDocId, documentId),
      eq(documentLinks.targetDocId, documentId),
    ))

  const explicitFwd = new Set(existingLinks.filter((l) => l.sourceDocId === documentId && l.inferred === 0).map((l) => l.targetDocId))
  const existingFwd = new Set(existingLinks.filter((l) => l.sourceDocId === documentId).map((l) => l.targetDocId))
  const existingRev = new Set(existingLinks.filter((l) => l.targetDocId === documentId).map((l) => l.sourceDocId))

  // 3. Insert auto-links for similar docs not already linked
  const now = new Date()
  const autoLinkedTargets: string[] = []
  let created = 0

  for (const sim of similarities) {
    if (explicitFwd.has(sim.targetDocId)) continue
    autoLinkedTargets.push(sim.targetDocId)

    if (!existingFwd.has(sim.targetDocId)) {
      await db.insert(documentLinks).values({
        id: generateId(),
        sourceDocId: documentId,
        targetDocId: sim.targetDocId,
        type: 'relates-to',
        weight: sim.score,
        inferred: 1,
        context: null,
        createdAt: now,
      })
      created++
    }

    if (!existingRev.has(sim.targetDocId)) {
      await db.insert(documentLinks).values({
        id: generateId(),
        sourceDocId: sim.targetDocId,
        targetDocId: documentId,
        type: 'relates-to',
        weight: sim.score,
        inferred: 1,
        context: null,
        createdAt: now,
      })
      created++
    }
  }

  // 4. Clean stale auto-links (both forward and reverse directions)
  if (autoLinkedTargets.length > 0) {
    await db.delete(documentLinks).where(and(
      eq(documentLinks.sourceDocId, documentId),
      eq(documentLinks.inferred, 1),
      not(inArray(documentLinks.targetDocId, autoLinkedTargets)),
    ))
    await db.delete(documentLinks).where(and(
      eq(documentLinks.targetDocId, documentId),
      eq(documentLinks.inferred, 1),
      not(inArray(documentLinks.sourceDocId, autoLinkedTargets)),
    ))
  }

  return created
}
