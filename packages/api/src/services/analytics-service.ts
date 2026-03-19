/** Search analytics — record queries/clicks, generate summary metrics */

import { eq, and, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { searchAnalytics } from '../db/schema'
import type { Env } from '../env'
import type { AnalyticsSummary } from '@agentwiki/shared'

/** Record a search query event (async, non-blocking) */
export async function recordSearch(
  env: Env,
  id: string,
  tenantId: string,
  query: string,
  searchType: string,
  resultCount: number,
): Promise<void> {
  const db = drizzle(env.DB)

  await db.insert(searchAnalytics).values({
    id,
    tenantId,
    query: query.toLowerCase().trim(),
    searchType,
    resultCount,
    createdAt: new Date(),
  })
}

/** Record a click on a search result (tenant-scoped for isolation) */
export async function recordClick(
  env: Env,
  tenantId: string,
  searchId: string,
  documentId: string,
  position: number,
) {
  const db = drizzle(env.DB)
  await db
    .update(searchAnalytics)
    .set({ clickedDocId: documentId, clickPosition: position })
    .where(and(eq(searchAnalytics.id, searchId), eq(searchAnalytics.tenantId, tenantId)))
}

/** Get analytics summary for a tenant */
export async function getAnalyticsSummary(
  env: Env,
  tenantId: string,
  period: '7d' | '30d' = '7d',
): Promise<AnalyticsSummary> {
  const db = drizzle(env.DB)
  const days = period === '7d' ? 7 : 30
  const since = Date.now() - days * 24 * 60 * 60 * 1000

  const baseCondition = and(
    eq(searchAnalytics.tenantId, tenantId),
    sql`${searchAnalytics.createdAt} >= ${since}`,
  )

  const [topQueries, zeroResults, ctrRow, typeDistribution, totalRow] = await Promise.all([
    // Top queries by frequency
    db
      .select({
        query: searchAnalytics.query,
        count: sql<number>`COUNT(*)`,
        avgResults: sql<number>`ROUND(AVG(${searchAnalytics.resultCount}), 1)`,
      })
      .from(searchAnalytics)
      .where(baseCondition)
      .groupBy(searchAnalytics.query)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(20),

    // Zero-result queries
    db
      .select({
        query: searchAnalytics.query,
        count: sql<number>`COUNT(*)`,
        lastSearched: sql<string>`MAX(${searchAnalytics.createdAt})`,
      })
      .from(searchAnalytics)
      .where(and(baseCondition, eq(searchAnalytics.resultCount, 0)))
      .groupBy(searchAnalytics.query)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(20),

    // Click-through rate
    db
      .select({
        ctr: sql<number>`ROUND(
          COUNT(CASE WHEN ${searchAnalytics.clickedDocId} IS NOT NULL THEN 1 END) * 100.0
          / NULLIF(COUNT(*), 0), 1
        )`,
      })
      .from(searchAnalytics)
      .where(baseCondition),

    // Search type distribution
    db
      .select({
        type: searchAnalytics.searchType,
        count: sql<number>`COUNT(*)`,
      })
      .from(searchAnalytics)
      .where(baseCondition)
      .groupBy(searchAnalytics.searchType),

    // Total searches
    db
      .select({ total: sql<number>`COUNT(*)` })
      .from(searchAnalytics)
      .where(baseCondition),
  ])

  return {
    topQueries,
    zeroResultQueries: zeroResults,
    clickThroughRate: ctrRow[0]?.ctr ?? 0,
    searchTypeDistribution: typeDistribution,
    totalSearches: totalRow[0]?.total ?? 0,
    period,
  }
}

/** Prune analytics older than retention period */
export async function pruneOldAnalytics(env: Env, tenantId: string, retentionDays = 90) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const db = drizzle(env.DB)
  await db
    .delete(searchAnalytics)
    .where(
      and(
        eq(searchAnalytics.tenantId, tenantId),
        sql`${searchAnalytics.createdAt} < ${cutoff}`,
      ),
    )
}
