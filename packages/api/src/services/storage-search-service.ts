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
): Promise<RankedResult[]> {
  const db = drizzle(env.DB)
  const likeQuery = `%${query}%`

  const results = await db
    .select({
      uploadId: fileExtractions.uploadId,
      extractedText: fileExtractions.extractedText,
      filename: uploads.filename,
    })
    .from(fileExtractions)
    .innerJoin(uploads, eq(fileExtractions.uploadId, uploads.id))
    .where(
      and(
        eq(fileExtractions.tenantId, tenantId),
        sql`${fileExtractions.extractedText} LIKE ${likeQuery}`,
      ),
    )
    .limit(limit)

  return results.map((r) => ({
    id: r.uploadId,
    title: r.filename,
    slug: '',
    snippet: extractSnippet(r.extractedText, query),
    resultType: 'upload' as const,
  }))
}

/** Semantic search on Vectorize vectors with source_type=upload metadata */
export async function storageSemanticSearch(
  env: Env,
  tenantId: string,
  query: string,
  limit: number,
): Promise<RankedResult[]> {
  try {
    const queryVector = await embedQuery(env, query)

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

    // Fetch upload metadata
    const db = drizzle(env.DB)
    const uploadRows = await db
      .select({ id: uploads.id, filename: uploads.filename })
      .from(uploads)
      .where(sql`${uploads.id} IN (${sql.join(uploadIds.map((id) => sql`${id}`), sql`, `)})`)

    const uploadMap = new Map(uploadRows.map((u) => [u.id, u]))

    // Fetch extracted text for snippets
    const extractionRows = await db
      .select({ uploadId: fileExtractions.uploadId, extractedText: fileExtractions.extractedText })
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
          resultType: 'upload' as const,
        } satisfies RankedResult & { resultType: string }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  } catch (err) {
    console.error('Storage semantic search error:', err)
    return []
  }
}
