/** Search within uploaded files' extracted text — keyword + semantic */

import { eq, and, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { fileExtractions, uploads } from '../db/schema'
import { embedQuery } from './embedding-service'
import { extractSnippet } from '../utils/extract-snippet'
import type { RankedResult } from '../utils/rrf'
import type { Env } from '../env'

/** Keyword search on file_extractions.extracted_text */
export async function storageKeywordSearch(
  env: Env,
  tenantId: string,
  query: string,
  limit: number,
  contentTypes?: string[],
  dateFrom?: string,
  dateTo?: string,
  documentId?: string,
): Promise<RankedResult[]> {
  const db = drizzle(env.DB)
  // Escape LIKE meta-characters to prevent wildcard injection
  const escapedQuery = query.replace(/[%_\\]/g, '\\$&')
  const likeQuery = `%${escapedQuery}%`

  const conditions = [
    eq(fileExtractions.tenantId, tenantId),
    sql`${fileExtractions.extractedText} LIKE ${likeQuery} ESCAPE '\\'`,
  ]
  if (contentTypes?.length) {
    conditions.push(sql`${uploads.contentType} IN (${sql.join(contentTypes.map((ct) => sql`${ct}`), sql`, `)})`)
  }
  if (dateFrom) {
    const ts = new Date(dateFrom).getTime()
    if (!isNaN(ts)) conditions.push(sql`${uploads.createdAt} >= ${ts}`)
  }
  if (dateTo) {
    const ts = new Date(dateTo).getTime()
    if (!isNaN(ts)) conditions.push(sql`${uploads.createdAt} <= ${ts}`)
  }
  if (documentId) {
    conditions.push(eq(uploads.documentId, documentId))
  }

  const results = await db
    .select({
      uploadId: fileExtractions.uploadId,
      extractedText: sql<string>`SUBSTR(${fileExtractions.extractedText}, 1, 2000)`.as('extracted_text'),
      filename: uploads.filename,
    })
    .from(fileExtractions)
    .innerJoin(uploads, eq(fileExtractions.uploadId, uploads.id))
    .where(and(...conditions))
    .limit(limit)

  return results.map((r) => ({
    id: r.uploadId,
    title: r.filename,
    slug: '',
    snippet: extractSnippet(r.extractedText, query),
    // LIKE is binary — omit keywordScore so accuracy badge doesn't render for storage keyword results
    resultType: 'upload' as const,
  }))
}

/** Semantic search on Vectorize vectors with source_type=upload metadata */
export async function storageSemanticSearch(
  env: Env,
  tenantId: string,
  query: string,
  limit: number,
  contentTypes?: string[],
  dateFrom?: string,
  dateTo?: string,
  documentId?: string,
): Promise<RankedResult[]> {
  try {
    const queryVector = await embedQuery(env, query)

    // topK fetches broadly; document_id is not in Vectorize filter metadata,
    // so documentId filtering happens in the DB step below — results bounded by topK
    const vectorResults = await env.VECTORIZE.query(queryVector, {
      topK: limit,
      filter: { org_id: tenantId, source_type: 'upload' },
      returnMetadata: 'all',
    })

    if (!vectorResults.matches?.length) return []

    // Get unique upload IDs from vector metadata
    const uploadIds = [
      ...new Set(
        vectorResults.matches
          .map((m) => (m.metadata as Record<string, string>)?.upload_id)
          .filter(Boolean),
      ),
    ]

    if (!uploadIds.length) return []

    // Fetch upload metadata (with tenant isolation + optional contentType filter)
    const db = drizzle(env.DB)
    const uploadConditions = [
      eq(uploads.tenantId, tenantId),
      sql`${uploads.id} IN (${sql.join(uploadIds.map((id) => sql`${id}`), sql`, `)})`,
    ]
    if (contentTypes?.length) {
      uploadConditions.push(sql`${uploads.contentType} IN (${sql.join(contentTypes.map((ct) => sql`${ct}`), sql`, `)})`)
    }
    if (dateFrom) {
      const ts = new Date(dateFrom).getTime()
      if (!isNaN(ts)) uploadConditions.push(sql`${uploads.createdAt} >= ${ts}`)
    }
    if (dateTo) {
      const ts = new Date(dateTo).getTime()
      if (!isNaN(ts)) uploadConditions.push(sql`${uploads.createdAt} <= ${ts}`)
    }
    if (documentId) {
      uploadConditions.push(eq(uploads.documentId, documentId))
    }
    const uploadRows = await db
      .select({ id: uploads.id, filename: uploads.filename })
      .from(uploads)
      .where(and(...uploadConditions))

    const uploadMap = new Map(uploadRows.map((u) => [u.id, u]))

    // Fetch truncated extracted text for snippets (avoid loading full 5MB)
    const extractionRows = await db
      .select({ uploadId: fileExtractions.uploadId, extractedText: sql<string>`SUBSTR(${fileExtractions.extractedText}, 1, 2000)`.as('extracted_text') })
      .from(fileExtractions)
      .where(sql`${fileExtractions.uploadId} IN (${sql.join(uploadIds.map((id) => sql`${id}`), sql`, `)})`)

    const textMap = new Map(extractionRows.map((e) => [e.uploadId, e.extractedText]))

    return vectorResults.matches
      .map((m) => {
        const uploadId = (m.metadata as Record<string, string>)?.upload_id
        const upload = uploadMap.get(uploadId)
        if (!upload) return null
        return {
          id: upload.id,
          title: upload.filename,
          slug: '',
          snippet: extractSnippet(textMap.get(uploadId) ?? '', query),
          score: m.score,
          semanticScore: m.score,
          resultType: 'upload' as const,
        } satisfies RankedResult & { resultType: string }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  } catch (err) {
    console.error('Storage semantic search error:', err)
    return []
  }
}
