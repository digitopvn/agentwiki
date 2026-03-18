/** Hybrid search — FTS5 keyword + Vectorize semantic + RRF fusion */

import { eq, and, isNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { documents } from '../db/schema'
import { embedQuery } from './embedding-service'
import { reciprocalRankFusion, type RankedResult } from '../utils/rrf'
import type { Env } from '../env'

interface SearchOptions {
  tenantId: string
  query: string
  type?: 'hybrid' | 'keyword' | 'semantic'
  limit?: number
  category?: string
}

/** Execute hybrid search */
export async function searchDocuments(env: Env, options: SearchOptions) {
  const { tenantId, query, type = 'hybrid', limit = 10, category } = options
  const results: RankedResult[][] = []

  // Keyword search via FTS5
  if (type === 'hybrid' || type === 'keyword') {
    const keywordResults = await keywordSearch(env, tenantId, query, limit * 2, category)
    results.push(keywordResults)
  }

  // Semantic search via Vectorize
  if (type === 'hybrid' || type === 'semantic') {
    const semanticResults = await semanticSearch(env, tenantId, query, limit * 2)
    results.push(semanticResults)
  }

  // Fuse results
  const fused = results.length > 1 ? reciprocalRankFusion(...results) : results[0] ?? []

  return fused.slice(0, limit)
}

/** FTS5 keyword search using LIKE (D1 doesn't always have FTS5 enabled) */
async function keywordSearch(
  env: Env,
  tenantId: string,
  query: string,
  limit: number,
  category?: string,
): Promise<RankedResult[]> {
  const db = drizzle(env.DB)
  const searchPattern = `%${query}%`

  const conditions = [
    eq(documents.tenantId, tenantId),
    isNull(documents.deletedAt),
    sql`(${documents.title} LIKE ${searchPattern} OR ${documents.content} LIKE ${searchPattern})`,
  ]

  if (category) {
    conditions.push(eq(documents.category, category))
  }

  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      slug: documents.slug,
      content: documents.content,
    })
    .from(documents)
    .where(and(...conditions))
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    snippet: extractSnippet(row.content, query),
  }))
}

/** Vectorize semantic search */
async function semanticSearch(
  env: Env,
  tenantId: string,
  query: string,
  limit: number,
): Promise<RankedResult[]> {
  try {
    const queryVector = await embedQuery(env, query)

    const vectorResults = await env.VECTORIZE.query(queryVector, {
      topK: limit,
      filter: { org_id: tenantId },
      returnMetadata: 'all',
    })

    if (!vectorResults.matches?.length) return []

    // Fetch document details for matched doc IDs
    const docIds = [...new Set(vectorResults.matches.map((m) => (m.metadata as Record<string, string>)?.doc_id).filter(Boolean))]

    const db = drizzle(env.DB)
    const docs = await db
      .select({ id: documents.id, title: documents.title, slug: documents.slug, content: documents.content })
      .from(documents)
      .where(and(
        sql`${documents.id} IN (${sql.join(docIds.map(id => sql`${id}`), sql`, `)})`,
        isNull(documents.deletedAt),
      ))

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
        } satisfies RankedResult
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  } catch (err) {
    console.error('Semantic search error:', err)
    return []
  }
}

/** Extract a snippet around the query match */
function extractSnippet(content: string, query: string, length = 150): string {
  const lower = content.toLowerCase()
  const queryLower = query.toLowerCase()
  const idx = lower.indexOf(queryLower)

  if (idx === -1) return content.slice(0, length) + (content.length > length ? '...' : '')

  const start = Math.max(0, idx - 60)
  const end = Math.min(content.length, idx + query.length + 60)
  let snippet = content.slice(start, end).replace(/\n/g, ' ').trim()

  if (start > 0) snippet = '...' + snippet
  if (end < content.length) snippet += '...'

  return snippet
}
