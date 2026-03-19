/** Trigram indexing and fuzzy search — replaces LIKE-based keyword search */

import { eq, and, sql, isNull, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { searchTrigrams, documents } from '../db/schema'
import { extractTrigrams } from '../utils/trigram'
import { extractSnippet } from '../utils/extract-snippet'
import type { Env } from '../env'
import type { RankedResult } from '../utils/rrf'

type IndexableField = 'title' | 'summary' | 'content'

/** Index a document's trigrams into D1 (called via queue) */
export async function indexDocumentTrigrams(
  env: Env,
  documentId: string,
  tenantId: string,
) {
  const db = drizzle(env.DB)

  // Fetch document fields
  const rows = await db
    .select({
      title: documents.title,
      summary: documents.summary,
      content: documents.content,
    })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1)

  if (!rows.length) return

  const doc = rows[0]

  // Delete existing trigrams for this document
  await deleteDocumentTrigrams(env, documentId)

  // Extract trigrams per field and batch insert
  const fieldsToIndex: { field: IndexableField; text: string }[] = [
    { field: 'title', text: doc.title },
    { field: 'summary', text: doc.summary ?? '' },
    { field: 'content', text: doc.content },
  ]

  const insertRows: {
    trigram: string
    documentId: string
    tenantId: string
    field: string
    frequency: number
  }[] = []

  for (const { field, text } of fieldsToIndex) {
    if (!text) continue
    const trigrams = extractTrigrams(text)
    for (const [tri, freq] of trigrams) {
      insertRows.push({
        trigram: tri,
        documentId,
        tenantId,
        field,
        frequency: freq,
      })
    }
  }

  if (!insertRows.length) return

  // Batch insert (100 rows per statement to stay within D1 limits)
  const batchSize = 100
  for (let i = 0; i < insertRows.length; i += batchSize) {
    const batch = insertRows.slice(i, i + batchSize)
    await db.insert(searchTrigrams).values(batch).onConflictDoUpdate({
      target: [searchTrigrams.trigram, searchTrigrams.documentId, searchTrigrams.field],
      set: { frequency: sql`excluded.frequency` },
    })
  }

  return { trigramsIndexed: insertRows.length }
}

/** Delete all trigrams for a document */
export async function deleteDocumentTrigrams(env: Env, documentId: string) {
  const db = drizzle(env.DB)
  await db.delete(searchTrigrams).where(eq(searchTrigrams.documentId, documentId))
}

/** Fuzzy search using trigram overlap scoring — replaces LIKE keyword search */
export async function trigramSearch(
  env: Env,
  tenantId: string,
  query: string,
  limit: number,
  category?: string,
): Promise<RankedResult[]> {
  const queryTrigrams = extractTrigrams(query)
  if (queryTrigrams.size === 0) return []

  const trigramKeys = [...queryTrigrams.keys()]
  const db = drizzle(env.DB)

  // Find documents matching query trigrams, scored by overlap
  // Title matches get a 2x boost via CASE expression
  const matchRows = await db
    .select({
      documentId: searchTrigrams.documentId,
      matchedTrigrams: sql<number>`COUNT(DISTINCT ${searchTrigrams.trigram})`,
      rawScore: sql<number>`SUM(
        CASE WHEN ${searchTrigrams.field} = 'title' THEN ${searchTrigrams.frequency} * 2
             ELSE ${searchTrigrams.frequency}
        END
      )`,
    })
    .from(searchTrigrams)
    .where(
      and(
        inArray(searchTrigrams.trigram, trigramKeys),
        eq(searchTrigrams.tenantId, tenantId),
      ),
    )
    .groupBy(searchTrigrams.documentId)
    .orderBy(sql`COUNT(DISTINCT ${searchTrigrams.trigram}) DESC, rawScore DESC`)
    .limit(limit)

  if (!matchRows.length) return []

  // Fetch document details
  const docIds = matchRows.map((r) => r.documentId)
  const conditions = [
    inArray(documents.id, docIds),
    isNull(documents.deletedAt),
  ]
  if (category) {
    conditions.push(eq(documents.category, category))
  }

  const docs = await db
    .select({
      id: documents.id,
      title: documents.title,
      slug: documents.slug,
      content: documents.content,
      category: documents.category,
    })
    .from(documents)
    .where(and(...conditions))

  const docMap = new Map(docs.map((d) => [d.id, d]))

  // Build ranked results preserving trigram score order
  return matchRows
    .map((match) => {
      const doc = docMap.get(match.documentId)
      if (!doc) return null
      return {
        id: doc.id,
        title: doc.title,
        slug: doc.slug,
        snippet: extractSnippet(doc.content, query),
        score: match.matchedTrigrams / trigramKeys.length, // overlap ratio
        category: doc.category ?? undefined,
      } satisfies RankedResult
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
}
