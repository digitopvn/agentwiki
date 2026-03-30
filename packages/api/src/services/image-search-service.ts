/** Image-specific search — wraps storage search with content type filtering + metadata enrichment */

import { eq, and, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { uploads, fileExtractions } from '../db/schema'
import { storageKeywordSearch, storageSemanticSearch } from './storage-search-service'
import { reciprocalRankFusion } from '../utils/rrf'
import { IMAGE_CONTENT_TYPES } from '@agentwiki/shared'
import type { ImageSearchResult, ImageSearchFilters } from '@agentwiki/shared'
import type { Env } from '../env'

interface ImageSearchOptions {
  tenantId: string
  query: string
  type?: 'hybrid' | 'keyword' | 'semantic'
  limit?: number
  filters?: ImageSearchFilters
}

/** Search uploaded images by text query with hybrid ranking */
export async function searchImages(env: Env, options: ImageSearchOptions): Promise<ImageSearchResult[]> {
  const { tenantId, query, type = 'hybrid', limit = 10, filters } = options

  // Use provided content types or default to all image types
  const contentTypes = filters?.contentTypes?.length
    ? filters.contentTypes
    : [...IMAGE_CONTENT_TYPES]

  // Run keyword + semantic search in parallel (all filters applied upstream for accurate limiting)
  const fetchLimit = limit * 2
  const { dateFrom, dateTo, documentId } = filters ?? {}
  const [keywordResults, semanticResults] = await Promise.all([
    (type === 'hybrid' || type === 'keyword')
      ? storageKeywordSearch(env, tenantId, query, fetchLimit, contentTypes, dateFrom, dateTo, documentId)
      : Promise.resolve([]),
    (type === 'hybrid' || type === 'semantic')
      ? storageSemanticSearch(env, tenantId, query, fetchLimit, contentTypes, dateFrom, dateTo, documentId)
      : Promise.resolve([]),
  ])

  // Fuse results via RRF
  const fused = keywordResults.length && semanticResults.length
    ? reciprocalRankFusion(
        { list: keywordResults, signal: 'keyword' },
        { list: semanticResults, signal: 'semantic' },
      )
    : keywordResults.length ? keywordResults : semanticResults

  const ranked = fused.slice(0, limit)
  if (!ranked.length) return []

  // Enrich with upload metadata
  return enrichImageResults(env, tenantId, ranked)
}

/** Fetch full upload metadata and build ImageSearchResult objects */
async function enrichImageResults(
  env: Env,
  tenantId: string,
  ranked: Array<{ id: string; snippet: string; score?: number; accuracy?: number }>,
): Promise<ImageSearchResult[]> {
  const db = drizzle(env.DB)
  const uploadIds = ranked.map((r) => r.id)

  // Build filter conditions
  const conditions = [
    eq(uploads.tenantId, tenantId),
    sql`${uploads.id} IN (${sql.join(uploadIds.map((id) => sql`${id}`), sql`, `)})`,
  ]
  // Fetch upload metadata + extraction description in parallel
  const [uploadRows, extractionRows] = await Promise.all([
    db.select({
      id: uploads.id,
      filename: uploads.filename,
      contentType: uploads.contentType,
      sizeBytes: uploads.sizeBytes,
      fileKey: uploads.fileKey,
      documentId: uploads.documentId,
      summary: uploads.summary,
      createdAt: uploads.createdAt,
    })
      .from(uploads)
      .where(and(...conditions)),
    db.select({
      uploadId: fileExtractions.uploadId,
      extractedText: sql<string>`SUBSTR(${fileExtractions.extractedText}, 1, 500)`.as('description'),
    })
      .from(fileExtractions)
      .where(and(
        eq(fileExtractions.tenantId, tenantId),
        sql`${fileExtractions.uploadId} IN (${sql.join(uploadIds.map((id) => sql`${id}`), sql`, `)})`,
      )),
  ])

  const uploadMap = new Map(uploadRows.map((u) => [u.id, u]))
  const descriptionMap = new Map(extractionRows.map((e) => [e.uploadId, e.extractedText]))

  // Merge ranked results with metadata, preserving rank order
  const results: ImageSearchResult[] = []
  for (const r of ranked) {
    const upload = uploadMap.get(r.id)
    if (!upload) continue
    results.push({
      id: upload.id,
      filename: upload.filename,
      contentType: upload.contentType,
      sizeBytes: upload.sizeBytes,
      description: descriptionMap.get(upload.id) ?? null,
      summary: upload.summary ?? null,
      snippet: r.snippet,
      score: r.score,
      accuracy: r.accuracy,
      fileUrl: `/api/files/${upload.fileKey}`,
      documentId: upload.documentId ?? null,
      createdAt: new Date(upload.createdAt as unknown as number).toISOString(),
    })
  }
  return results
}
