# Phase 4: Search Analytics

## Context
- [Plan overview](./plan.md) | [Phase 1](./phase-01-trigram-fuzzy-search.md) | [Phase 2](./phase-02-autocomplete-suggestions.md) | [Phase 3](./phase-03-faceted-filtering.md)
- Search routes: `packages/api/src/routes/search.ts`
- Schema: `packages/api/src/db/schema.ts`
- Constants: `packages/shared/src/constants.ts`

## Overview
- **Priority:** P3
- **Status:** Pending
- **Dependencies:** None (independent, but best after P1-P3 so all search types tracked)
- **Description:** Track search queries, clicks, and zero-result queries. Dashboard for admins to see popular searches, content gaps, and search quality metrics.

## Key Insights
- Analytics recording must be async/non-blocking (use `waitUntil()`)
- Click tracking requires a separate `POST /api/search/track` endpoint (called when user clicks a result)
- Zero-result queries reveal content gaps — most actionable insight for wiki admins
- Keep analytics table lean — prune old raw data, keep aggregates
- Dashboard is admin-only; read from same D1 database

## Requirements

### Functional
- Record: every search query, result count, search type, timestamp
- Record: clicked result (doc ID, position in results) when user navigates to a result from search
- Dashboard metrics: top queries (7d/30d), zero-result queries, click-through rate, search type distribution
- Admin can view dashboard at `/settings/search-analytics` (or admin panel)
- Export analytics as CSV (optional, future)

### Non-Functional
- Recording adds 0ms to search response time (async via `waitUntil`)
- Analytics table auto-cleanup: raw events older than 90 days pruned
- Dashboard queries < 500ms

## Architecture

```
Search Request ──→ Return results ──→ waitUntil(recordSearch())
                                              │
                                              ▼
                                     search_analytics (D1)
                                              │
User clicks result ──→ POST /api/search/track │
                              │               │
                              ▼               │
                     UPDATE search_analytics   │
                     SET clicked_doc_id, position │
                                              │
Admin Dashboard  ◀────────────────────────────┘
  /settings/search-analytics
  - Top queries (7d / 30d)
  - Zero-result queries
  - CTR per query
  - Search type pie chart
```

## Related Code Files

### Modify
| File | Changes |
|------|---------|
| `packages/api/src/db/schema.ts` | Add `searchAnalytics` table |
| `packages/api/src/routes/search.ts` | Add `POST /track` endpoint, record analytics in search handler |
| `packages/shared/src/types/search.ts` | Add analytics types |

### Create
| File | Purpose |
|------|---------|
| `packages/api/src/services/analytics-service.ts` | Record + query analytics data |
| `packages/api/src/routes/analytics.ts` | Admin dashboard API endpoints |
| `packages/web/src/routes/search-analytics.tsx` | Analytics dashboard page |
| `packages/web/src/hooks/use-search-analytics.ts` | React Query hooks for analytics API |

## Implementation Steps

### Step 1: Add analytics table to schema
In `packages/api/src/db/schema.ts`:
```ts
export const searchAnalytics = sqliteTable('search_analytics', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  query: text('query').notNull(),
  searchType: text('search_type').notNull(), // 'hybrid' | 'keyword' | 'semantic'
  resultCount: integer('result_count').notNull(),
  clickedDocId: text('clicked_doc_id'),
  clickPosition: integer('click_position'),   // 1-indexed position of clicked result
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => ({
  tenantDateIdx: index('idx_analytics_tenant_date').on(table.tenantId, table.createdAt),
  tenantQueryIdx: index('idx_analytics_tenant_query').on(table.tenantId, table.query),
}))
```
Generate + apply migration.

### Step 2: Add shared analytics types
In `packages/shared/src/types/search.ts`:
```ts
export interface SearchAnalyticsEvent {
  query: string
  searchType: string
  resultCount: number
}

export interface SearchClickEvent {
  searchId: string       // analytics row ID to update
  documentId: string
  position: number
}

export interface AnalyticsSummary {
  topQueries: { query: string; count: number; avgResults: number }[]
  zeroResultQueries: { query: string; count: number; lastSearched: string }[]
  clickThroughRate: number  // percentage
  searchTypeDistribution: { type: string; count: number }[]
  totalSearches: number
  period: '7d' | '30d'
}
```

### Step 3: Create analytics service
Create `packages/api/src/services/analytics-service.ts`:

**`recordSearch(env, tenantId, query, searchType, resultCount)`:**
1. Generate UUID for analytics row
2. INSERT into `search_analytics`
3. Return the row ID (for click tracking reference)

**`recordClick(env, searchId, documentId, position)`:**
1. UPDATE `search_analytics` SET `clicked_doc_id`, `click_position` WHERE id = searchId

**`getAnalyticsSummary(env, tenantId, period: '7d' | '30d')`:**
```sql
-- Top queries
SELECT query, COUNT(*) as count, AVG(result_count) as avg_results
FROM search_analytics
WHERE tenant_id = ? AND created_at >= ?
GROUP BY query ORDER BY count DESC LIMIT 20

-- Zero-result queries
SELECT query, COUNT(*) as count, MAX(created_at) as last_searched
FROM search_analytics
WHERE tenant_id = ? AND result_count = 0 AND created_at >= ?
GROUP BY query ORDER BY count DESC LIMIT 20

-- CTR
SELECT
  COUNT(CASE WHEN clicked_doc_id IS NOT NULL THEN 1 END) * 100.0 / COUNT(*) as ctr
FROM search_analytics
WHERE tenant_id = ? AND created_at >= ?

-- Type distribution
SELECT search_type, COUNT(*) as count
FROM search_analytics
WHERE tenant_id = ? AND created_at >= ?
GROUP BY search_type

-- Total
SELECT COUNT(*) as total FROM search_analytics
WHERE tenant_id = ? AND created_at >= ?
```
Run all queries in `Promise.all()`.

**`pruneOldAnalytics(env, tenantId, retentionDays = 90)`:**
```sql
DELETE FROM search_analytics
WHERE tenant_id = ? AND created_at < ?
```

### Step 4: Record analytics in search route
In `packages/api/src/routes/search.ts`, after returning results:
```ts
// Record search event (async, non-blocking)
const analyticsId = crypto.randomUUID()
c.executionCtx.waitUntil(
  recordSearch(c.env, tenantId, query, type, results.length)
)
// Include analyticsId in response for click tracking
return c.json({ results, facets, query, type, searchId: analyticsId })
```

### Step 5: Add click tracking endpoint
In `packages/api/src/routes/search.ts`:
```ts
// Record search result click
searchRouter.post('/track', async (c) => {
  const { tenantId } = c.get('auth')
  const body = await c.req.json<SearchClickEvent>()

  if (!body.searchId || !body.documentId) {
    return c.json({ error: 'searchId and documentId required' }, 400)
  }

  c.executionCtx.waitUntil(
    recordClick(c.env, body.searchId, body.documentId, body.position)
  )
  return c.json({ ok: true })
})
```

### Step 6: Create analytics API routes
Create `packages/api/src/routes/analytics.ts`:
```ts
// Admin-only analytics endpoints
analyticsRouter.get('/search', async (c) => {
  const { tenantId } = c.get('auth')
  const period = (c.req.query('period') ?? '7d') as '7d' | '30d'
  const summary = await getAnalyticsSummary(c.env, tenantId, period)
  return c.json(summary)
})
```
Protect with admin role check middleware.

### Step 7: Frontend click tracking
In command palette and search results, when user clicks a result:
```ts
const trackClick = (searchId: string, docId: string, position: number) => {
  // Fire-and-forget, no await needed
  apiClient.post('/api/search/track', {
    searchId, documentId: docId, position,
  }).catch(() => {}) // swallow errors silently
}
```

### Step 8: Create analytics hooks
Create `packages/web/src/hooks/use-search-analytics.ts`:
```ts
export function useSearchAnalytics(period: '7d' | '30d' = '7d') {
  return useQuery<AnalyticsSummary>({
    queryKey: ['search-analytics', period],
    queryFn: () => apiClient.get(`/api/analytics/search?period=${period}`),
    staleTime: 5 * 60_000, // 5 min
  })
}
```

### Step 9: Create analytics dashboard page
Create `packages/web/src/routes/search-analytics.tsx`:
- Period toggle: 7 days / 30 days
- **Top Queries card:** Table with query, count, avg results, CTR
- **Zero-Result Queries card:** Table with query, count, last searched — highlight content gaps
- **Search Quality card:** Overall CTR percentage, total searches
- **Type Distribution card:** Simple bar/pie showing hybrid vs keyword vs semantic usage
- Use existing UI patterns from settings pages
- Admin-only access (redirect non-admins)

### Step 10: Add route and navigation
- Add route `/settings/search-analytics` in router config
- Add nav link in admin settings sidebar
- Protect with admin role check

### Step 11: Add analytics cleanup to scheduled worker
In queue handler or a Cloudflare Cron Trigger:
```ts
// Run weekly: prune analytics older than 90 days
case 'cleanup-analytics':
  await pruneOldAnalytics(env, msg.tenantId, 90)
  break
```

## Todo List
- [ ] Add `searchAnalytics` table to schema + generate migration
- [ ] Add analytics types to shared types
- [ ] Create `packages/api/src/services/analytics-service.ts`
- [ ] Record search events in search handler (async)
- [ ] Add `POST /api/search/track` click tracking endpoint
- [ ] Create `packages/api/src/routes/analytics.ts` admin endpoints
- [ ] Add click tracking to frontend search UI
- [ ] Create `packages/web/src/hooks/use-search-analytics.ts`
- [ ] Create `packages/web/src/routes/search-analytics.tsx` dashboard
- [ ] Add route + nav link for analytics page
- [ ] Add analytics cleanup cron job
- [ ] Test async recording doesn't affect search latency
- [ ] Test dashboard with sample data

## Success Criteria
- Every search query recorded with 0ms impact on response time
- Click tracking captures which result was clicked and its position
- Dashboard shows meaningful top queries and zero-result queries
- Admin can toggle between 7d and 30d views
- Old analytics auto-pruned after 90 days

## Risk Assessment
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Analytics table grows large | Medium | Low | 90-day auto-prune, indexed queries |
| waitUntil failures | Low | Low | Analytics are best-effort, no user impact |
| Dashboard slow on large datasets | Low | Medium | Indexed queries, time-bounded, LIMIT |

## Security Considerations
- Analytics dashboard admin-only (role check middleware)
- No PII in analytics (only query text, doc IDs, timestamps)
- Click tracking validates searchId exists before updating
- Rate limit on /track endpoint to prevent abuse
