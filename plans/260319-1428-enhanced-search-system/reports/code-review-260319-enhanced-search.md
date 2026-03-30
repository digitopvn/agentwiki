# Code Review: Enhanced Search System

**Date:** 2026-03-19
**Scope:** 17 files (11 new, 6 modified) across `packages/api`, `packages/web`, `packages/shared`
**Focus:** Trigram fuzzy search, autocomplete suggestions, search analytics, faceted filtering

---

## Overall Assessment

Solid implementation. Clean separation of concerns, good use of parallel queries, proper tenant isolation in all DB queries, and well-typed shared interfaces. The architecture (trigram index + Vectorize semantic + RRF fusion) is sound. A few critical issues around click tracking correctness and input sanitization need fixing before merge.

---

## Critical Issues

### C1. searchId mismatch breaks click-through tracking

**File:** `packages/api/src/routes/search.ts:46-54`

The route generates `searchId` via `crypto.randomUUID()` (line 46) and returns it in the response (line 54). But `recordSearch()` (line 50) generates its *own* UUID internally (`analytics-service.ts:17`). The `searchId` returned to the client never matches the row in `search_analytics`, so `recordClick()` updates zero rows.

**Fix:** Pass the pre-generated searchId into `recordSearch()`:
```ts
// analytics-service.ts: accept optional id param
export async function recordSearch(env, tenantId, query, searchType, resultCount, id?: string) {
  const searchId = id ?? crypto.randomUUID()
  // ...
}

// search.ts route:
const searchId = crypto.randomUUID()
c.executionCtx.waitUntil(
  Promise.all([
    recordSearchHistory(c.env, tenantId, query, results.length),
    recordSearch(c.env, tenantId, query, type, results.length, searchId),
  ]),
)
```

### C2. LIKE injection in suggest-service prefix pattern

**File:** `packages/api/src/services/suggest-service.ts:34`

```ts
const prefixPattern = `${normalized}%`
```

User input containing SQL LIKE wildcards (`%`, `_`) is interpolated directly into the pattern. A query like `%admin%` would match all titles. Drizzle's `like()` parameterizes the value, but the wildcards are interpreted by SQLite.

**Same issue in:** `packages/api/src/services/document-service.ts:189` (pre-existing, not new code).

**Fix:** Escape LIKE metacharacters before building the pattern:
```ts
function escapeLike(s: string): string {
  return s.replace(/[%_]/g, '\\$&')
}
const prefixPattern = `${escapeLike(normalized)}%`
// use: like(documents.title, prefixPattern) — SQLite will handle the escape char
```

### C3. recordClick has no tenant isolation or ownership check

**File:** `packages/api/src/services/analytics-service.ts:33-44`

`recordClick()` updates `search_analytics` by `id` alone. Any authenticated user can overwrite click data for any tenant's search analytics row if they guess/enumerate the UUID.

**Fix:** Add tenantId condition:
```ts
export async function recordClick(env, tenantId, searchId, documentId, position) {
  await db.update(searchAnalytics)
    .set({ clickedDocId: documentId, clickPosition: position })
    .where(and(eq(searchAnalytics.id, searchId), eq(searchAnalytics.tenantId, tenantId)))
}
```

And pass `tenantId` from the route handler.

---

## High Priority

### H1. Empty trigram array causes `IN ()` SQL error

**File:** `packages/api/src/services/trigram-service.ts:118`

If `extractTrigrams` returns an empty map (already guarded at line 98), the guard is fine here. But in `suggest-service.ts:97`, `trigramKeys` could be empty if the query yields no trigrams after tokenization (e.g., query is all stop words like "the and but"). The `sql.join()` with an empty array produces `IN ()` which is a SQL syntax error.

**Fix:** Guard before the DB query:
```ts
if (trigramKeys.length === 0) { /* skip fuzzy source */ }
```

This guard exists at line 88 but only checks `trigramKeys.length > 0`. Confirmed this is correct. **Downgrading -- already handled.** No action needed.

### H2. analytics-service date comparison: timestamp_ms vs epoch millis

**File:** `packages/api/src/services/analytics-service.ts:54-58`

`since` is computed as `Date.now() - days * 86400000` (epoch millis). The schema uses `mode: 'timestamp_ms'` which stores as integer milliseconds. However, `createdAt` in `recordSearch` (line 26) is set to `new Date()` -- with drizzle `timestamp_ms` mode this stores correctly as epoch millis. The comparison `${searchAnalytics.createdAt} >= ${since}` works since both are millis.

**Verified correct.** But `pruneOldAnalytics` uses the same pattern -- confirmed consistent.

### H3. Large trigram index: `IN (...)` clause with many trigrams

**File:** `packages/api/src/services/trigram-service.ts:118`

For a long query, `extractTrigrams` can produce 50-100+ trigrams. SQLite's `SQLITE_MAX_VARIABLE_NUMBER` defaults to 999 in D1. If a query produces close to that many trigrams, the `inArray()` call could fail.

**Mitigation:** Cap trigram count or batch the query. Given typical search queries are short (2-5 words), this is unlikely but should have a defensive cap:
```ts
const trigramKeys = [...queryTrigrams.keys()].slice(0, 200)
```

### H4. suggest-service: LIKE prefix on unindexed column

**File:** `packages/api/src/services/suggest-service.ts:42`

`like(documents.title, prefixPattern)` performs a LIKE prefix search on `documents.title`. There is no index on `title`. For small tables this is fine, but for large tenants it becomes a full table scan. Consider adding an index on `(tenant_id, title)` if autocomplete latency becomes an issue.

### H5. analytics prune endpoint: no validation on `days` param

**File:** `packages/api/src/routes/analytics.ts:36`

```ts
const days = parseInt(c.req.query('days') ?? '90', 10)
```

No bounds checking. `days=0` or `days=-1` would delete all analytics or cause unexpected behavior. Negative values would create a future cutoff, deleting nothing (harmless but confusing). `days=0` deletes everything.

**Fix:** Clamp to reasonable bounds:
```ts
const days = Math.max(7, Math.min(365, parseInt(c.req.query('days') ?? '90', 10)))
```

---

## Medium Priority

### M1. Search route returns hardcoded searchId before analytics writes

**File:** `packages/api/src/routes/search.ts:46-54`

The `searchId` is returned to the client, but analytics recording happens async via `waitUntil`. The client could attempt click tracking before the analytics row exists. `recordClick` would update zero rows silently.

**Fix:** This is acceptable for fire-and-forget analytics, but consider documenting that click tracking is eventually consistent, or use an INSERT instead of UPDATE for clicks.

### M2. Facet counts not scoped to current query results

**File:** `packages/api/src/services/search-service.ts:53-117`

`getFacetCounts` returns counts for ALL documents in the tenant, not filtered by the current search query. This is a UX issue: facet counts won't change when users type different queries. Standard search UIs show facet counts relative to the current result set.

**Note:** This is a design choice. Global facets are simpler and avoid an extra query. Acceptable for V1, but consider scoped facets in V2.

### M3. Suggest cache key not scoped to KV namespace isolation

**File:** `packages/api/src/services/suggest-service.ts:22`

Cache key `suggest:${tenantId}:${normalized}` is fine -- properly namespaced by tenant. However, cache invalidation is missing: when a document is created/updated/deleted, cached suggestions may become stale. The 5-minute TTL mitigates this acceptably.

### M4. wordTrigrams returns the word itself for short words

**File:** `packages/api/src/utils/trigram.ts:16`

```ts
if (word.length < 3) return [word]
```

But `tokenize` already filters words with `w.length >= 3`. So this branch is unreachable from `extractTrigrams`. If `wordTrigrams` is used directly elsewhere, 1-2 char "trigrams" could pollute the index. Consider returning an empty array instead, or documenting the function's contract.

### M5. Missing `type` validation on search route

**File:** `packages/api/src/routes/search.ts:27`

```ts
const type = (c.req.query('type') ?? 'hybrid') as 'hybrid' | 'keyword' | 'semantic'
```

Unsafe cast -- any string passes through. If `type=invalid`, neither keyword nor semantic search runs, returning empty results silently.

**Fix:** Validate with allowlist:
```ts
const validTypes = ['hybrid', 'keyword', 'semantic'] as const
const rawType = c.req.query('type') ?? 'hybrid'
const type = validTypes.includes(rawType as any) ? (rawType as typeof validTypes[number]) : 'hybrid'
```

### M6. period parameter in analytics route is unsafely cast

**File:** `packages/api/src/routes/analytics.ts:24`

```ts
const period = (c.req.query('period') ?? '7d') as '7d' | '30d'
```

Same pattern as M5. Invalid values silently become `7d` in the analytics service (since `days` would be 7 as default), but the cast hides the issue.

---

## Low Priority

### L1. extractSnippet only matches exact substring

**File:** `packages/api/src/utils/extract-snippet.ts:5`

`lower.indexOf(queryLower)` only finds exact substring matches. Trigram search may return documents that don't contain the exact query string (that's the point of fuzzy search). In those cases, the snippet defaults to the first 150 chars, which may not be the most relevant excerpt.

**Enhancement for V2:** Use trigram overlap to find the best matching window, or use the first matching word from the query.

### L2. analytics dashboard: `toLocaleString()` format varies by locale

**File:** `packages/web/src/routes/search-analytics.tsx:74`

Minor -- `data.totalSearches.toLocaleString()` will format differently per browser locale. Acceptable for internal admin dashboard.

### L3. `daysDiff` helper uses naive day calculation

**File:** `packages/web/src/components/search/search-filters.tsx:121-123`

`Math.ceil` division may be off by one around DST transitions. Acceptable for UI active-state highlighting.

---

## Positive Observations

1. **Tenant isolation is thorough** -- Every DB query in search, suggest, analytics, and trigram services filters by `tenantId`. No cross-tenant data leakage paths found.
2. **Parameterized queries throughout** -- Drizzle ORM's `eq()`, `inArray()`, `sql` template literals all properly parameterize values. No raw string interpolation into SQL.
3. **Good async patterns** -- `waitUntil` for fire-and-forget analytics, `Promise.all` for parallel facet queries, proper error handling in queue jobs with ack/retry.
4. **Clean type sharing** -- `@agentwiki/shared` types ensure API contract consistency between frontend and backend.
5. **Batch insert with size limit** -- Trigram indexing batches at 100 rows to stay within D1 limits.
6. **Rate limiting on all new endpoints** -- Search, suggest, analytics all have rate limiters.
7. **KV caching with graceful fallback** -- Suggest service degrades cleanly when KV is unavailable.
8. **Migration file exists** -- `0002_volatile_terrax.sql` creates all 3 new tables with proper indexes.

---

## Recommended Actions (Prioritized)

1. **[CRITICAL] Fix searchId mismatch** -- C1. Click tracking is completely broken without this.
2. **[CRITICAL] Add tenant check to recordClick** -- C3. Prevents cross-tenant analytics manipulation.
3. **[CRITICAL] Escape LIKE wildcards in suggest prefix** -- C2. Prevents search pattern injection.
4. **[HIGH] Cap trigram array size** -- H3. Defensive measure against edge case SQL failures.
5. **[HIGH] Validate days param in prune endpoint** -- H5. Prevents accidental data deletion.
6. **[MED] Validate search type param** -- M5. Prevents silent empty results.
7. **[MED] Validate analytics period param** -- M6. Consistency with type safety.
8. **[LOW] Consider scoped facet counts** -- M2. UX improvement for V2.

---

## Unresolved Questions

1. Is there a scheduled cron trigger for `cleanup-analytics` queue messages, or is it manual-only via the prune endpoint?
2. Should `recordClick` use INSERT (separate click events table) instead of UPDATE (one click per search)? Current design only tracks the last click per search.
3. Should trigram indexing be triggered on document update as well? Currently only triggered via `generate-summary` cascade in the queue handler, not directly from `updateDocument`.
