/** Hybrid search — trigram fuzzy keyword + Vectorize semantic + RRF fusion + faceted filtering */

import { eq, and, isNull, sql, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { documents, documentTags } from '../db/schema'
import { embedQuery } from './embedding-service'
import { trigramSearch } from './trigram-service'
import { reciprocalRankFusion, type RankedResult } from '../utils/rrf'
import { extractSnippet } from '../utils/extract-snippet'
import type { Env } from '../env'
import type { SearchFilters, SearchFacets, FacetBucket } from '@agentwiki/shared'

interface SearchOptions {
  tenantId: string
  query: string
  type?: 'hybrid' | 'keyword' | 'semantic'
  limit?: number
  category?: string
  filters?: SearchFilters
}

/** Execute hybrid search with optional faceted filtering */
export async function searchDocuments(env: Env, options: SearchOptions) {
  const { tenantId, query, type = 'hybrid', limit = 10, filters } = options
  // Merge top-level category with filters for backward compat
  const category = filters?.category ?? options.category
  const results: RankedResult[][] = []

  // Fuzzy keyword search via trigram index
  if (type === 'hybrid' || type === 'keyword') {
    const keywordResults = await trigramSearch(env, tenantId, query, limit * 2, category)
    results.push(keywordResults)
  }

  // Semantic search via Vectorize
  if (type === 'hybrid' || type === 'semantic') {
    const semanticResults = await semanticSearch(env, tenantId, query, limit * 2, filters)
    results.push(semanticResults)
  }

  // Fuse results
  let fused = results.length > 1 ? reciprocalRankFusion(...results) : results[0] ?? []

  // Post-filter by tags and date range (applies to all search types)
  if (filters?.tags?.length || filters?.dateFrom || filters?.dateTo) {
    fused = await postFilterResults(env, fused, tenantId, filters)
  }

  return fused.slice(0, limit)
}

/** Get facet counts for the current tenant (categories, tags, date ranges) */
export async function getFacetCounts(
  env: Env,
  tenantId: string,
): Promise<SearchFacets> {
  const db = drizzle(env.DB)
  const now = Date.now()
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000
  const quarterAgo = now - 90 * 24 * 60 * 60 * 1000

  const [categoryRows, tagRows, dateRows] = await Promise.all([
    // Category counts
    db
      .select({
        name: documents.category,
        count: sql<number>`COUNT(*)`,
      })
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, tenantId),
          isNull(documents.deletedAt),
          sql`${documents.category} IS NOT NULL`,
        ),
      )
      .groupBy(documents.category)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(10),

    // Tag counts
    db
      .select({
        name: documentTags.tag,
        count: sql<number>`COUNT(DISTINCT ${documentTags.documentId})`,
      })
      .from(documentTags)
      .innerJoin(documents, eq(documentTags.documentId, documents.id))
      .where(
        and(
          eq(documents.tenantId, tenantId),
          isNull(documents.deletedAt),
        ),
      )
      .groupBy(documentTags.tag)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(15),

    // Date range buckets
    db
      .select({
        thisWeek: sql<number>`SUM(CASE WHEN ${documents.createdAt} >= ${weekAgo} THEN 1 ELSE 0 END)`,
        thisMonth: sql<number>`SUM(CASE WHEN ${documents.createdAt} >= ${monthAgo} AND ${documents.createdAt} < ${weekAgo} THEN 1 ELSE 0 END)`,
        thisQuarter: sql<number>`SUM(CASE WHEN ${documents.createdAt} >= ${quarterAgo} AND ${documents.createdAt} < ${monthAgo} THEN 1 ELSE 0 END)`,
        older: sql<number>`SUM(CASE WHEN ${documents.createdAt} < ${quarterAgo} THEN 1 ELSE 0 END)`,
      })
      .from(documents)
      .where(and(eq(documents.tenantId, tenantId), isNull(documents.deletedAt))),
  ])

  return {
    categories: categoryRows.filter((r) => r.name) as FacetBucket[],
    tags: tagRows as FacetBucket[],
    dateRanges: dateRows[0] ?? { thisWeek: 0, thisMonth: 0, thisQuarter: 0, older: 0 },
  }
}

/** Post-filter search results by tags and date range */
async function postFilterResults(
  env: Env,
  results: RankedResult[],
  tenantId: string,
  filters: SearchFilters,
): Promise<RankedResult[]> {
  if (!results.length) return results

  const db = drizzle(env.DB)
  const docIds = results.map((r) => r.id)

  // Build filter conditions
  const conditions = [
    inArray(documents.id, docIds),
    eq(documents.tenantId, tenantId),
    isNull(documents.deletedAt),
  ]

  if (filters.dateFrom) {
    conditions.push(sql`${documents.createdAt} >= ${new Date(filters.dateFrom).getTime()}`)
  }
  if (filters.dateTo) {
    conditions.push(sql`${documents.createdAt} <= ${new Date(filters.dateTo).getTime()}`)
  }

  let filteredIds: Set<string>

  if (filters.tags?.length) {
    // Find docs that have ALL specified tags
    const taggedRows = await db
      .select({ documentId: documentTags.documentId })
      .from(documentTags)
      .innerJoin(documents, eq(documentTags.documentId, documents.id))
      .where(
        and(
          ...conditions,
          inArray(documentTags.tag, filters.tags),
        ),
      )
      .groupBy(documentTags.documentId)
      .having(sql`COUNT(DISTINCT ${documentTags.tag}) >= ${filters.tags.length}`)

    filteredIds = new Set(taggedRows.map((r) => r.documentId))
  } else {
    // Just date filter
    const rows = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(...conditions))

    filteredIds = new Set(rows.map((r) => r.id))
  }

  return results.filter((r) => filteredIds.has(r.id))
}

/** Vectorize semantic search with optional filter post-processing */
async function semanticSearch(
  env: Env,
  tenantId: string,
  query: string,
  limit: number,
  filters?: SearchFilters,
): Promise<RankedResult[]> {
  try {
    const queryVector = await embedQuery(env, query)

    // Build Vectorize filter — only supports flat metadata fields
    const vectorFilter: Record<string, string> = { org_id: tenantId }
    if (filters?.category) {
      vectorFilter.category = filters.category
    }

    const vectorResults = await env.VECTORIZE.query(queryVector, {
      topK: limit,
      filter: vectorFilter,
      returnMetadata: 'all',
    })

    if (!vectorResults.matches?.length) return []

    const docIds = [
      ...new Set(
        vectorResults.matches
          .map((m) => (m.metadata as Record<string, string>)?.doc_id)
          .filter(Boolean),
      ),
    ]

    const db = drizzle(env.DB)
    const docs = await db
      .select({
        id: documents.id,
        title: documents.title,
        slug: documents.slug,
        content: documents.content,
        category: documents.category,
      })
      .from(documents)
      .where(
        and(
          sql`${documents.id} IN (${sql.join(docIds.map((id) => sql`${id}`), sql`, `)})`,
          isNull(documents.deletedAt),
        ),
      )

    const docMap = new Map(docs.map((d) => [d.id, d]))

    return vectorResults.matches
      .map((m) => {
        const docId = (m.metadata as Record<string, string>)?.doc_id
        const doc = docMap.get(docId)
        if (!doc) return null
        return {
          id: doc.id,
          title: doc.title,
          slug: doc.slug,
          snippet: extractSnippet(doc.content, query),
          score: m.score,
          category: doc.category ?? undefined,
        } satisfies RankedResult
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  } catch (err) {
    console.error('Semantic search error:', err)
    return []
  }
}
