# Phase 3: Faceted Filtering

## Context
- [Plan overview](./plan.md) | [Phase 1](./phase-01-trigram-fuzzy-search.md) | [Phase 2](./phase-02-autocomplete-suggestions.md)
- Search routes: `packages/api/src/routes/search.ts`
- Search service: `packages/api/src/services/search-service.ts`
- Schema: `packages/api/src/db/schema.ts` — `documents`, `documentTags` tables
- Embedding service: `packages/api/src/services/embedding-service.ts` — Vectorize metadata
- Search hook: `packages/web/src/hooks/use-search.ts`
- Command palette: `packages/web/src/components/command-palette/command-palette.tsx`

## Overview
- **Priority:** P2
- **Status:** Pending
- **Dependencies:** None (independent of P1/P2, but benefits from them)
- **Description:** Extend search API with tag, date range, and category filters. Return facet counts alongside results. Extend Vectorize metadata for semantic faceted search.

## Key Insights
- `category` filter already exists in keyword search but not exposed in semantic search
- `documentTags` table exists — just needs JOIN in search queries
- Vectorize metadata currently stores `org_id`, `doc_id`, `chunk_index`, `heading` — can add `category` and `tags`
- Facet counts require separate COUNT queries (D1) — aggregate in application layer
- Frontend needs filter UI in command palette or dedicated search page

## Requirements

### Functional
- Filter search results by: tags (multi-select), category, date range (from/to)
- Return facet counts: top categories with doc counts, top tags with doc counts, date range buckets
- Filters apply to both trigram and semantic search results
- Facet counts reflect filtered state (if filtering by tag X, show category counts for docs with tag X)

### Non-Functional
- Facet calculation adds < 50ms to search latency
- No additional tables needed (use existing `documents` + `documentTags`)

## Architecture

```
GET /api/search?q=react&tags[]=api&dateFrom=2026-01-01&category=guide
       │
       ├──→ Trigram Search (with SQL WHERE filters)
       │         WHERE tag IN ('api') AND category = 'guide'
       │         AND created_at >= '2026-01-01'
       │
       ├──→ Semantic Search (with Vectorize metadata filter)
       │         filter: { org_id, category: 'guide' }
       │         + post-filter by tags/date in app layer
       │
       ├──→ Facet Count Queries (parallel)
       │         COUNT by category, COUNT by tag, COUNT by date bucket
       │
       └──→ RRF Fusion + Facet Aggregation
                    │
                    ▼
              { results: [...], facets: { categories, tags, dateRanges } }
```

## Related Code Files

### Modify
| File | Changes |
|------|---------|
| `packages/api/src/services/search-service.ts` | Add filter params to `searchDocuments()`, `trigramSearch()`, `semanticSearch()`; add `getFacetCounts()` |
| `packages/api/src/routes/search.ts` | Parse filter query params, return facets in response |
| `packages/api/src/services/embedding-service.ts` | Add `category` to Vectorize vector metadata |
| `packages/api/src/utils/rrf.ts` | No changes (filters applied before fusion) |
| `packages/web/src/hooks/use-search.ts` | Extend `useSearch()` with filter params |
| `packages/web/src/components/command-palette/command-palette.tsx` | Add filter chips/dropdown UI |
| `packages/shared/src/types/search.ts` | Add filter & facet types |

### Create
| File | Purpose |
|------|---------|
| `packages/web/src/components/search/search-filters.tsx` | Filter UI component (chips, dropdowns) |

## Implementation Steps

### Step 1: Extend shared types
In `packages/shared/src/types/search.ts`, add:
```ts
export interface SearchFilters {
  tags?: string[]
  category?: string
  dateFrom?: string   // ISO date string
  dateTo?: string     // ISO date string
}

export interface FacetBucket {
  name: string
  count: number
}

export interface SearchFacets {
  categories: FacetBucket[]
  tags: FacetBucket[]
  dateRanges: {
    thisWeek: number
    thisMonth: number
    thisQuarter: number
    older: number
  }
}

export interface SearchResponse {
  results: SearchResult[]
  facets?: SearchFacets
  query: string
  type: string
}
```

### Step 2: Parse filter params in search route
In `packages/api/src/routes/search.ts`:
```ts
searchRouter.get('/', async (c) => {
  const { tenantId } = c.get('auth')
  const query = c.req.query('q')
  if (!query) return c.json({ error: 'Query "q" required' }, 400)

  const type = (c.req.query('type') ?? 'hybrid') as 'hybrid' | 'keyword' | 'semantic'
  const limit = Math.min(50, parseInt(c.req.query('limit') ?? '10', 10))

  const filters: SearchFilters = {
    category: c.req.query('category') || undefined,
    tags: c.req.queries('tags[]') || undefined,
    dateFrom: c.req.query('dateFrom') || undefined,
    dateTo: c.req.query('dateTo') || undefined,
  }

  const [results, facets] = await Promise.all([
    searchDocuments(c.env, { tenantId, query, type, limit, filters }),
    getFacetCounts(c.env, tenantId, query, filters),
  ])

  return c.json({ results, facets, query, type })
})
```

### Step 3: Add filters to trigramSearch
In `packages/api/src/services/search-service.ts`, modify the SQL query in `trigramSearch()`:
- JOIN `documentTags` when `filters.tags` is set
- Add `WHERE category = ?` when `filters.category` is set
- Add `WHERE created_at >= ? AND created_at <= ?` for date range
- All conditions use parameterized queries

### Step 4: Add filters to semanticSearch
In `semanticSearch()`:
- Vectorize metadata filter: add `category` if set (requires vectors to have category in metadata)
- Post-filter results in app layer for tags and date range (Vectorize doesn't support array metadata filtering well)
- Filter after fetching doc details from D1

### Step 5: Update embedding metadata
In `packages/api/src/services/embedding-service.ts`, when creating vectors:
```ts
metadata: {
  org_id: tenantId,
  doc_id: docId,
  chunk_index: batch[j].index,
  heading: batch[j].heading ?? '',
  category: docCategory ?? '',  // NEW
}
```
Note: Existing vectors need re-embedding to include category. Add migration note.

### Step 6: Implement getFacetCounts
In `packages/api/src/services/search-service.ts`:

```ts
export async function getFacetCounts(
  env: Env, tenantId: string, query: string, filters: SearchFilters
): Promise<SearchFacets> {
  const db = drizzle(env.DB)
  const now = Date.now()
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000
  const quarterAgo = now - 90 * 24 * 60 * 60 * 1000

  // Run all 3 facet queries in parallel
  const [categoryRows, tagRows, dateRows] = await Promise.all([
    // Category counts
    db.select({
      name: documents.category,
      count: sql<number>`COUNT(*)`,
    })
    .from(documents)
    .where(and(
      eq(documents.tenantId, tenantId),
      isNull(documents.deletedAt),
      sql`${documents.category} IS NOT NULL`,
    ))
    .groupBy(documents.category)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(10),

    // Tag counts
    db.select({
      name: documentTags.tag,
      count: sql<number>`COUNT(DISTINCT ${documentTags.documentId})`,
    })
    .from(documentTags)
    .innerJoin(documents, eq(documentTags.documentId, documents.id))
    .where(and(
      eq(documents.tenantId, tenantId),
      isNull(documents.deletedAt),
    ))
    .groupBy(documentTags.tag)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(15),

    // Date range buckets
    db.select({
      thisWeek: sql<number>`SUM(CASE WHEN created_at >= ${weekAgo} THEN 1 ELSE 0 END)`,
      thisMonth: sql<number>`SUM(CASE WHEN created_at >= ${monthAgo} AND created_at < ${weekAgo} THEN 1 ELSE 0 END)`,
      thisQuarter: sql<number>`SUM(CASE WHEN created_at >= ${quarterAgo} AND created_at < ${monthAgo} THEN 1 ELSE 0 END)`,
      older: sql<number>`SUM(CASE WHEN created_at < ${quarterAgo} THEN 1 ELSE 0 END)`,
    })
    .from(documents)
    .where(and(eq(documents.tenantId, tenantId), isNull(documents.deletedAt))),
  ])

  return {
    categories: categoryRows.filter(r => r.name) as FacetBucket[],
    tags: tagRows as FacetBucket[],
    dateRanges: dateRows[0] ?? { thisWeek: 0, thisMonth: 0, thisQuarter: 0, older: 0 },
  }
}
```

### Step 7: Create search filters UI component
Create `packages/web/src/components/search/search-filters.tsx`:
- Horizontal row of filter chips below search input
- Category dropdown (populated from facets.categories)
- Tag multi-select chips (populated from facets.tags)
- Date range preset buttons (This week / This month / This quarter / All time)
- Active filters shown as removable chips
- Clearing all filters resets to unfiltered search

### Step 8: Update useSearch hook
In `packages/web/src/hooks/use-search.ts`:
```ts
export function useSearch(query: string, filters?: SearchFilters) {
  const params = new URLSearchParams()
  params.set('q', query)
  params.set('type', 'hybrid')
  params.set('limit', '10')
  if (filters?.category) params.set('category', filters.category)
  if (filters?.tags?.length) filters.tags.forEach(t => params.append('tags[]', t))
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom)
  if (filters?.dateTo) params.set('dateTo', filters.dateTo)

  return useQuery<SearchResponse>({
    queryKey: ['search', query, filters],
    queryFn: () => apiClient.get<SearchResponse>(`/api/search?${params}`),
    enabled: query.length >= 2,
    staleTime: 30_000,
  })
}
```

### Step 9: Integrate filters in command palette
- Add filter state management in command palette
- Show filter chips when search results are displayed
- Facets update reactively as filters change
- Keep filters simple in palette; full filter UI for dedicated search page (future)

## Todo List
- [ ] Extend shared search types with `SearchFilters`, `SearchFacets`
- [ ] Parse filter query params in search route
- [ ] Add filter conditions to `trigramSearch()` SQL
- [ ] Add post-filter to `semanticSearch()` results
- [ ] Update Vectorize metadata with `category` field
- [ ] Implement `getFacetCounts()` with parallel D1 queries
- [ ] Create `search-filters.tsx` component
- [ ] Update `useSearch()` hook with filter params
- [ ] Integrate filters in command palette
- [ ] Test facet counts accuracy
- [ ] Test filter + search combination results

## Success Criteria
- Filtering by tag "react" shows only react-tagged documents
- Date range filter correctly limits results
- Facet counts update when filters applied
- No performance regression (facets add < 50ms)
- Filters work with both keyword and semantic search types

## Risk Assessment
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Facet queries slow on large datasets | Low | Medium | Parallel execution, LIMIT on facets |
| Vectorize metadata size limit | Low | Low | Only add category (small string) |
| Complex filter combinations | Medium | Low | Test common combos, keep SQL simple |

## Security Considerations
- All filter params sanitized and parameterized
- Tag values validated against existing tags (no arbitrary SQL)
- Date params validated as ISO date strings
- Tenant isolation in all facet queries
