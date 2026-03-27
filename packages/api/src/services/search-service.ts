/** Hybrid search — trigram fuzzy keyword + Vectorize semantic + RRF fusion + faceted filtering */

import { eq, and, isNull, sql, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { documents, documentTags } from '../db/schema'
import { embedQuery } from './embedding-service'
import { trigramSearch } from './trigram-service'
import { fts5Search } from './fts5-search-service'
import { storageKeywordSearch, storageSemanticSearch } from './storage-search-service'
import { reciprocalRankFusion, type RankedResult, type RRFListOptions } from '../utils/rrf'
import { extractSnippet } from '../utils/extract-snippet'
import { buildFolderContext } from '../utils/folder-context'
import { computeHash } from '../utils/hash'
import { expandQuery, type ExpandedQuery } from './query-expansion-service'
import type { Env } from '../env'
import type { SearchFilters, SearchFacets, FacetBucket } from '@agentwiki/shared'

export type SearchSource = 'docs' | 'storage' | 'all'

interface SearchOptions {
  tenantId: string
  query: string
  type?: 'hybrid' | 'keyword' | 'semantic'
  limit?: number
  category?: string
  filters?: SearchFilters
  source?: SearchSource
  debug?: boolean
  expand?: boolean // query expansion (default: false for UI, true for MCP)
  keywordSource?: 'trigram' | 'fts5' // override USE_FTS5 env var per-request (for eval benchmarking)
}

/** Debug info returned when debug=true */
export interface SearchDebugInfo {
  timings: { keyword_ms: number; semantic_ms: number; parallel_ms?: number; fusion_ms: number; total_ms: number }
  counts: { keyword_candidates: number; semantic_candidates: number; expansion_candidates: number; fused_total: number; filtered_total: number; returned: number }
  cache: { hit: boolean; key: string }
  expansion?: { original: string; expansions: string[]; cached: boolean; latency_ms: number }
}

export interface HybridSearchResult {
  results: RankedResult[]
  debug?: SearchDebugInfo
}

/** Execute hybrid search with optional faceted filtering and source selection */
export async function searchDocuments(env: Env, options: SearchOptions): Promise<HybridSearchResult> {
  const {
    tenantId, query, type = 'hybrid', limit = 10,
    filters, source = 'docs', debug = false, expand = false, keywordSource,
  } = options
  const category = filters?.category ?? options.category
  const t0 = Date.now()

  // Resolve shouldExpand early for cache key accuracy (only hybrid runs expansion)
  const shouldExpand = expand && type === 'hybrid'

  // KV cache check — skip when debugging
  const cacheKey = await buildSearchCacheKey(tenantId, query, type, limit, source, shouldExpand, keywordSource, filters)
  if (!debug) {
    try {
      const cached = await env.KV.get(cacheKey, 'json')
      if (cached) return { results: cached as RankedResult[] }
    } catch { /* cache miss */ }
  }

  // ── PARALLEL: expansion + original keyword + original semantic ──
  // Feature flag: per-request keywordSource overrides USE_FTS5 env var (for eval benchmarking)
  const useFts5 = keywordSource ? keywordSource === 'fts5' : env.USE_FTS5 === 'true'
  const keywordSearch = useFts5 ? fts5Search : trigramSearch

  const [expansionResult, keywordResults, semanticResults] = await Promise.all([
    shouldExpand
      ? expandQuery(env, tenantId, query)
      : Promise.resolve<ExpandedQuery>({ original: query, expansions: [], cached: false, latencyMs: 0 }),
    (source === 'docs' || source === 'all') && (type === 'hybrid' || type === 'keyword')
      ? keywordSearch(env, tenantId, query, limit * 2, category)
      : Promise.resolve<RankedResult[]>([]),
    (source === 'docs' || source === 'all') && (type === 'hybrid' || type === 'semantic')
      ? semanticSearch(env, tenantId, query, limit * 2, filters)
      : Promise.resolve<RankedResult[]>([]),
  ])
  const tParallel = Date.now()

  const rrfInputs: RRFListOptions[] = []

  // Original results — signal-weighted
  if (keywordResults.length) rrfInputs.push({ list: keywordResults, signal: 'keyword' })
  if (semanticResults.length) rrfInputs.push({ list: semanticResults, signal: 'semantic' })

  // Storage search (default signal)
  if (source === 'storage' || source === 'all') {
    const [storageKw, storageSem] = await Promise.all([
      (type === 'hybrid' || type === 'keyword')
        ? storageKeywordSearch(env, tenantId, query, limit * 2) : Promise.resolve([]),
      (type === 'hybrid' || type === 'semantic')
        ? storageSemanticSearch(env, tenantId, query, limit * 2) : Promise.resolve([]),
    ])
    if (storageKw.length) rrfInputs.push({ list: storageKw, signal: 'default' })
    if (storageSem.length) rrfInputs.push({ list: storageSem, signal: 'default' })
  }

  // Expanded query results — run in parallel, add as default-weight
  let expansionCandidates = 0
  if (expansionResult.expansions.length) {
    const expandedSearches = expansionResult.expansions.flatMap((term) => [
      keywordSearch(env, tenantId, term, limit, category),
      semanticSearch(env, tenantId, term, limit, filters),
    ])
    const expandedResults = await Promise.all(expandedSearches)
    for (const list of expandedResults) {
      expansionCandidates += list.length
      if (list.length) rrfInputs.push({ list, signal: 'default' })
    }
  }

  // Fuse with position-aware signal weighting
  const tFuse0 = Date.now()
  let fused = rrfInputs.length > 1
    ? reciprocalRankFusion(...rrfInputs)
    : (rrfInputs[0]?.list ?? []).map((r) => ({
        ...r,
        accuracy: Math.round(Math.max(r.keywordScore ?? 0, r.semanticScore ?? 0) * 100),
      }))
  const tFuse1 = Date.now()
  const fusedTotal = fused.length // capture pre-filter count for debug

  // Post-filter by tags and date range
  if (filters?.tags?.length || filters?.dateFrom || filters?.dateTo) {
    if (source === 'docs') {
      fused = await postFilterResults(env, fused, tenantId, filters)
    } else if (source === 'all') {
      const uploadResults = fused.filter((r) => !r.slug)
      const docResults = fused.filter((r) => r.slug)
      const filteredDocs = await postFilterResults(env, docResults, tenantId, filters)
      fused = [...filteredDocs, ...uploadResults].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    }
  }

  let finalResults = fused.slice(0, limit)

  // Enrich with folder context (batch-fetch folderIds, resolve contexts)
  finalResults = await enrichWithFolderContext(env, tenantId, finalResults)

  // Cache results (5-min TTL) — skip when debugging
  if (!debug) {
    try {
      await env.KV.put(cacheKey, JSON.stringify(finalResults), { expirationTtl: 300 })
    } catch { /* non-critical */ }
  }

  const result: HybridSearchResult = { results: finalResults }

  if (debug) {
    result.debug = {
      timings: {
        keyword_ms: 0,          // individual timing unavailable in parallel mode
        semantic_ms: 0,         // individual timing unavailable in parallel mode
        parallel_ms: tParallel - t0, // combined keyword + semantic + expansion
        fusion_ms: tFuse1 - tFuse0,
        total_ms: Date.now() - t0,
      },
      counts: {
        keyword_candidates: keywordResults.length,
        semantic_candidates: semanticResults.length,
        expansion_candidates: expansionCandidates,
        fused_total: fusedTotal,
        filtered_total: fused.length,
        returned: finalResults.length,
      },
      cache: { hit: false, key: cacheKey },
      expansion: shouldExpand ? {
        original: expansionResult.original,
        expansions: expansionResult.expansions,
        cached: expansionResult.cached,
        latency_ms: expansionResult.latencyMs,
      } : undefined,
    }
  }

  return result
}

/** Enrich search results with folder hierarchy context */
async function enrichWithFolderContext(env: Env, tenantId: string, results: RankedResult[]): Promise<RankedResult[]> {
  if (!results.length) return results

  const db = drizzle(env.DB)
  const docIds = results.map((r) => r.id)

  // Batch-fetch folderIds — defensive tenant isolation consistent with rest of codebase
  const docs = await db
    .select({ id: documents.id, folderId: documents.folderId })
    .from(documents)
    .where(and(inArray(documents.id, docIds), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))

  const folderIdMap = new Map(docs.map((d) => [d.id, d.folderId]))

  // Resolve folder contexts (with KV caching per folder)
  const uniqueFolderIds = [...new Set(docs.map((d) => d.folderId).filter(Boolean))] as string[]
  const contextMap = new Map<string, string | null>()

  await Promise.all(
    uniqueFolderIds.map(async (fid) => {
      const ctx = await buildFolderContext(env, fid)
      contextMap.set(fid, ctx)
    }),
  )

  return results.map((r) => {
    const folderId = folderIdMap.get(r.id)
    const context = folderId ? contextMap.get(folderId) ?? null : null
    return { ...r, context }
  })
}

/**
 * Build deterministic KV cache key for search results.
 * KV keys have a 512-byte limit — hash filters when they'd exceed it.
 */
async function buildSearchCacheKey(
  tenantId: string,
  query: string,
  type: string,
  limit: number,
  source: string,
  expand: boolean,
  keywordSource?: 'trigram' | 'fts5',
  filters?: SearchFilters,
): Promise<string> {
  const normalized = query.toLowerCase().trim()
  const expandSuffix = expand ? ':expand' : ''
  const kwSuffix = keywordSource ? `:kw:${keywordSource}` : ''
  const filterStr = filters ? JSON.stringify(filters, Object.keys(filters).sort()) : ''
  const base = `search:${tenantId}:${type}:${source}:${limit}:${normalized}${expandSuffix}${kwSuffix}`

  // KV key max: 512 bytes. If key would be too long, hash the variable parts.
  if (base.length + filterStr.length + 1 > 480) {
    const hashed = await computeHash(`${normalized}${expandSuffix}${kwSuffix}:${filterStr}`)
    return `search:${tenantId}:${type}:${source}:${limit}:${hashed.slice(0, 32)}`
  }

  return filterStr ? `${base}:${filterStr}` : base
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
          semanticScore: m.score,
          category: doc.category ?? undefined,
        } satisfies RankedResult
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  } catch (err) {
    console.error('Semantic search error:', err)
    return []
  }
}
