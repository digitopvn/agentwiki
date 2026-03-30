/** Autocomplete suggestions — title prefix + search history + trigram fuzzy */

import { eq, and, isNull, sql, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { documents, searchHistory, searchTrigrams } from '../db/schema'
import { extractTrigrams } from '../utils/trigram'
import type { Env } from '../env'
import type { SuggestItem } from '@agentwiki/shared'

/** Get autocomplete suggestions from 3 sources, merged and deduplicated */
export async function getSuggestions(
  env: Env,
  tenantId: string,
  query: string,
  limit = 7,
): Promise<SuggestItem[]> {
  const normalized = query.toLowerCase().trim()
  if (!normalized) return []

  // Escape LIKE wildcards to prevent pattern injection
  const escaped = normalized.replace(/%/g, '\\%').replace(/_/g, '\\_')

  // Check KV cache first
  const cacheKey = `suggest:${tenantId}:${normalized}`
  try {
    const cached = await env.KV.get(cacheKey, 'json')
    if (cached) return cached as SuggestItem[]
  } catch {
    // KV may not be available in dev
  }

  const db = drizzle(env.DB)
  const suggestions: SuggestItem[] = []
  const seenTexts = new Set<string>()

  // Source 1: Title match — prefix for single word, contains-all-words for multi-word
  const words = escaped.split(/\s+/).filter((w) => w.length >= 2)
  const isMultiWord = words.length > 1

  // Multi-word: title must contain ALL words (any order), Single-word: title starts with query
  const titleCondition = isMultiWord
    ? and(...words.map((w) => like(documents.title, `%${w}%`)))
    : like(documents.title, `${escaped}%`)

  const titleRows = await db
    .select({ id: documents.id, title: documents.title, slug: documents.slug })
    .from(documents)
    .where(
      and(
        eq(documents.tenantId, tenantId),
        isNull(documents.deletedAt),
        titleCondition,
      ),
    )
    .orderBy(documents.updatedAt)
    .limit(3)

  for (const row of titleRows) {
    const key = row.title.toLowerCase()
    if (!seenTexts.has(key)) {
      seenTexts.add(key)
      suggestions.push({
        text: row.title,
        source: 'title',
        documentId: row.id,
        slug: row.slug,
        accuracy: 100,
      })
    }
  }

  // Source 2: Search history (up to 2)
  // Multi-word: history must contain ALL words, Single-word: prefix match
  const historyCondition = isMultiWord
    ? and(...words.map((w) => like(searchHistory.query, `%${w}%`)))
    : like(searchHistory.query, `${escaped}%`)

  const historyRows = await db
    .select({ query: searchHistory.query })
    .from(searchHistory)
    .where(
      and(
        eq(searchHistory.tenantId, tenantId),
        historyCondition,
        sql`${searchHistory.resultCount} > 0`,
      ),
    )
    .orderBy(sql`${searchHistory.searchCount} DESC`)
    .limit(2)

  for (const row of historyRows) {
    const key = row.query.toLowerCase()
    if (!seenTexts.has(key)) {
      seenTexts.add(key)
      suggestions.push({ text: row.query, source: 'history' })
    }
  }

  // Source 3: Trigram fuzzy title match (only if < 5 results so far)
  if (suggestions.length < 5) {
    const queryTrigrams = extractTrigrams(normalized)
    const trigramKeys = [...queryTrigrams.keys()]

    if (trigramKeys.length > 0) {
      const fuzzyRows = await db
        .select({
          documentId: searchTrigrams.documentId,
          matchCount: sql<number>`COUNT(DISTINCT ${searchTrigrams.trigram})`,
        })
        .from(searchTrigrams)
        .where(
          and(
            sql`${searchTrigrams.trigram} IN (${sql.join(trigramKeys.map((t) => sql`${t}`), sql`, `)})`,
            eq(searchTrigrams.tenantId, tenantId),
            eq(searchTrigrams.field, 'title'),
          ),
        )
        .groupBy(searchTrigrams.documentId)
        .orderBy(sql`COUNT(DISTINCT ${searchTrigrams.trigram}) DESC`)
        .limit(4)

      if (fuzzyRows.length) {
        const docIds = fuzzyRows.map((r) => r.documentId)
        const fuzzyDocs = await db
          .select({ id: documents.id, title: documents.title, slug: documents.slug })
          .from(documents)
          .where(
            and(
              sql`${documents.id} IN (${sql.join(docIds.map((id) => sql`${id}`), sql`, `)})`,
              isNull(documents.deletedAt),
            ),
          )

        const docMap = new Map(fuzzyDocs.map((d) => [d.id, d]))
        const totalTrigrams = trigramKeys.length
        for (const row of fuzzyRows) {
          if (suggestions.length >= limit) break
          const doc = docMap.get(row.documentId)
          if (!doc) continue
          const key = doc.title.toLowerCase()
          if (seenTexts.has(key)) continue
          seenTexts.add(key)
          suggestions.push({
            text: doc.title,
            source: 'fuzzy',
            documentId: doc.id,
            slug: doc.slug,
            accuracy: Math.round((row.matchCount / totalTrigrams) * 100),
          })
        }
      }
    }
  }

  const result = suggestions.slice(0, limit)

  // Cache in KV (TTL 5 minutes)
  try {
    await env.KV.put(cacheKey, JSON.stringify(result), { expirationTtl: 300 })
  } catch {
    // KV may not be available in dev
  }

  return result
}

/** Record a search query in history (upsert: increment count or insert new) */
export async function recordSearchHistory(
  env: Env,
  tenantId: string,
  query: string,
  resultCount: number,
) {
  const normalized = query.toLowerCase().trim()
  if (!normalized || normalized.length < 2) return

  const db = drizzle(env.DB)
  const now = Date.now()

  // Try upsert — increment search_count if exists, else insert
  await db
    .insert(searchHistory)
    .values({
      id: crypto.randomUUID(),
      tenantId,
      query: normalized,
      resultCount,
      searchCount: 1,
      lastSearchedAt: new Date(now),
    })
    .onConflictDoUpdate({
      target: [searchHistory.tenantId, searchHistory.query],
      set: {
        searchCount: sql`${searchHistory.searchCount} + 1`,
        resultCount,
        lastSearchedAt: new Date(now),
      },
    })
}
