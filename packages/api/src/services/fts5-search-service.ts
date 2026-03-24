/**
 * FTS5/BM25 full-text search service — alternative to trigram-based keyword search.
 *
 * Uses D1's FTS5 virtual table for BM25-ranked full-text search.
 * Supports: phrase search ("rate limiting"), prefix (perform*), negation (-deprecated).
 *
 * @see https://developers.cloudflare.com/d1/sql-api/sql-statements/
 * @see https://www.sqlite.org/fts5.html
 */

import { extractSnippet } from '../utils/extract-snippet'
import type { Env } from '../env'
import type { RankedResult } from '../utils/rrf'

/**
 * BM25-ranked full-text search using D1 FTS5.
 * Drop-in replacement for trigramSearch() with same return type.
 *
 * SCALABILITY NOTE: tenant_id is UNINDEXED in the FTS5 virtual table, meaning
 * the WHERE clause `f.tenant_id = ?` is a post-filter applied AFTER FTS5 retrieves
 * all MATCH results across all tenants. At scale (many tenants, large corpus),
 * this causes unnecessary cross-tenant scanning. Mitigations to consider:
 * - Per-tenant FTS5 tables (only viable for bounded tenant count)
 * - Prefix-token partitioning (prepend tenant_id to tokenized content)
 * - Accept scan cost at current scale (D1 handles small-to-medium corpora well)
 */
export async function fts5Search(
  env: Env,
  tenantId: string,
  query: string,
  limit: number,
  category?: string,
): Promise<RankedResult[]> {
  const sanitized = sanitizeFTS5Query(query)
  if (!sanitized) return []

  try {
    const categoryFilter = category ? 'AND d.category = ?' : ''
    const sql = `
      SELECT
        f.doc_id AS id,
        d.title,
        d.slug,
        d.content,
        d.category,
        rank AS score
      FROM documents_fts f
      JOIN documents d ON d.id = f.doc_id
      WHERE documents_fts MATCH ?
        AND f.tenant_id = ?
        ${categoryFilter}
        AND d.deleted_at IS NULL
      ORDER BY rank
      LIMIT ?
    `

    const params = category
      ? [sanitized, tenantId, category, limit]
      : [sanitized, tenantId, limit]

    const result = await env.DB.prepare(sql).bind(...params).all()

    return (result.results ?? []).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      slug: row.slug as string,
      snippet: extractSnippet((row.content as string) ?? '', query),
      score: Math.abs(row.score as number), // FTS5 rank is negative (lower = better)
      category: (row.category as string) ?? undefined,
    }))
  } catch (err) {
    console.error('FTS5 search error:', err)
    return []
  }
}

/**
 * Sanitize user query for FTS5 MATCH.
 * Strips all FTS5 special syntax except quotes and prefix wildcard (*).
 * Prevents column filter bypass (:) and boolean operator injection (AND/OR/NOT/NEAR).
 */
function sanitizeFTS5Query(query: string): string {
  let sanitized = query
    .replace(/[(){}[\]^~\\;:]/g, '')                 // strip specials INCLUDING colon
    .replace(/\b(AND|OR|NOT|NEAR)\b/gi, '')          // strip FTS5 boolean operators
    .replace(/\s+/g, ' ')
    .trim()

  // Ensure balanced quotes — unbalanced quotes cause FTS5 syntax errors
  const quoteCount = (sanitized.match(/"/g) || []).length
  if (quoteCount % 2 !== 0) sanitized = sanitized.replace(/"/g, '')

  return sanitized
}

// ── FTS5 Index Management (called from queue handler) ──

/** Insert or replace a document in the FTS5 index */
export async function indexDocumentFTS5(
  env: Env,
  documentId: string,
  tenantId: string,
  title: string,
  summary: string,
  content: string,
): Promise<void> {
  try {
    // Delete existing entry first (FTS5 doesn't support UPSERT)
    await env.DB.prepare(
      'DELETE FROM documents_fts WHERE doc_id = ?',
    ).bind(documentId).run()

    // Insert new entry
    await env.DB.prepare(`
      INSERT INTO documents_fts(doc_id, tenant_id, title, summary, content)
      VALUES (?, ?, ?, ?, ?)
    `).bind(documentId, tenantId, title, summary ?? '', content).run()
  } catch (err) {
    console.error(`FTS5 index error for ${documentId}:`, err)
  }
}

/** Remove a document from the FTS5 index */
export async function removeDocumentFTS5(
  env: Env,
  documentId: string,
): Promise<void> {
  try {
    await env.DB.prepare(
      'DELETE FROM documents_fts WHERE doc_id = ?',
    ).bind(documentId).run()
  } catch (err) {
    console.error(`FTS5 remove error for ${documentId}:`, err)
  }
}

/**
 * Backfill documents into FTS5 index.
 * Uses D1 batch API for atomicity and has a max-per-job limit
 * to stay within Cloudflare's 30s CPU time. Re-enqueue with offset for continuation.
 */
export async function backfillFTS5Index(
  env: Env,
  startOffset = 0,
  maxDocsPerJob = 500,
): Promise<{ indexed: number; nextOffset: number | null }> {
  const batchSize = 50
  let offset = startOffset
  let totalIndexed = 0

  while (totalIndexed < maxDocsPerJob) {
    const batch = await env.DB.prepare(`
      SELECT id, tenant_id, title, COALESCE(summary, '') as summary, content
      FROM documents
      WHERE deleted_at IS NULL
      ORDER BY id
      LIMIT ? OFFSET ?
    `).bind(batchSize, offset).all()

    if (!batch.results?.length) {
      return { indexed: totalIndexed, nextOffset: null } // all done
    }

    // Use D1 batch API — atomic per batch, single round-trip
    const statements = batch.results.flatMap((doc) => [
      env.DB.prepare('DELETE FROM documents_fts WHERE doc_id = ?').bind(doc.id),
      env.DB.prepare(`
        INSERT INTO documents_fts(doc_id, tenant_id, title, summary, content)
        VALUES (?, ?, ?, ?, ?)
      `).bind(doc.id, doc.tenant_id, doc.title, doc.summary, doc.content),
    ])
    await env.DB.batch(statements)

    totalIndexed += batch.results.length
    offset += batchSize

    if (batch.results.length < batchSize) {
      return { indexed: totalIndexed, nextOffset: null } // reached end
    }
  }

  // Hit max-per-job limit — return offset for re-enqueue continuation
  return { indexed: totalIndexed, nextOffset: offset }
}
