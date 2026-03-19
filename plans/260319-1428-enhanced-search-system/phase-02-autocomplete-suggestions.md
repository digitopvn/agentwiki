# Phase 2: Autocomplete & Suggestions

## Context
- [Plan overview](./plan.md) | [Phase 1: Trigram Fuzzy](./phase-01-trigram-fuzzy-search.md)
- Command palette: `packages/web/src/components/command-palette/command-palette.tsx`
- Search hook: `packages/web/src/hooks/use-search.ts`
- Search routes: `packages/api/src/routes/search.ts`
- Env bindings: `packages/api/src/env.ts` (KV already bound)

## Overview
- **Priority:** P2
- **Status:** Pending
- **Dependencies:** Phase 1 (trigram infrastructure for fuzzy title matching)
- **Description:** Real-time autocomplete suggestions from 3 sources: title prefix match, search history, and trigram fuzzy titles. KV cache for hot prefixes.

## Key Insights
- KV namespace already bound (`env.KV`) — no infra changes needed
- Command palette already debounces at 250ms — good for autocomplete
- 3-tier suggestion strategy: exact prefix (fast) → history (popular) → trigram fuzzy (fallback)
- Search history tracks popular queries per tenant for trending suggestions

## Requirements

### Functional
- Suggestions appear after 1+ characters typed (lower threshold than full search)
- Max 7 suggestions returned (3 title prefix + 2 history + 2 fuzzy fallback)
- Search history recorded on every successful search (>0 results)
- Popular queries surfaced as suggestions when query prefix matches
- Deduplication across all 3 sources

### Non-Functional
- Suggest latency < 100ms (KV cache hit) / < 200ms (cache miss)
- KV cache TTL: 5 minutes
- History table cleanup: auto-prune queries with `search_count = 1` older than 30 days

## Architecture

```
User types "rea..."
       │
       ▼ (debounce 150ms)
GET /api/search/suggest?q=rea&limit=7
       │
       ▼
┌──────────────────────────────┐
│    KV Cache Check            │
│    key: suggest:{tenantId}:{prefix} │
│    hit → return cached       │
│    miss ↓                    │
├──────────────────────────────┤
│ Source 1: Title Prefix       │
│ WHERE title LIKE 'rea%'      │
│ → up to 3 results            │
├──────────────────────────────┤
│ Source 2: Search History     │
│ WHERE query LIKE 'rea%'      │
│ ORDER BY search_count DESC   │
│ → up to 2 results            │
├──────────────────────────────┤
│ Source 3: Trigram Fuzzy Title │ (if < 5 results so far)
│ trigram match on title field  │
│ → up to 2 results            │
├──────────────────────────────┤
│    Deduplicate + Merge       │
│    Cache in KV (TTL 5min)    │
│    Return suggestions        │
└──────────────────────────────┘
```

## Related Code Files

### Modify
| File | Changes |
|------|---------|
| `packages/api/src/db/schema.ts` | Add `searchHistory` table |
| `packages/api/src/routes/search.ts` | Add `GET /suggest` endpoint, record history on search |
| `packages/api/src/services/search-service.ts` | Call `recordSearchHistory()` after search |
| `packages/web/src/hooks/use-search.ts` | Add `useSuggest()` hook |
| `packages/web/src/components/command-palette/command-palette.tsx` | Integrate autocomplete UI |
| `packages/shared/src/constants.ts` | Add `RATE_LIMITS.suggest` |

### Create
| File | Purpose |
|------|---------|
| `packages/api/src/services/suggest-service.ts` | Suggestion logic: prefix, history, fuzzy merge |
| `packages/shared/src/types/search.ts` | Shared search & suggest type definitions |

## Implementation Steps

### Step 1: Add shared search types
Create `packages/shared/src/types/search.ts`:
```ts
export interface SearchResult {
  id: string
  title: string
  slug: string
  snippet?: string
  score?: number
  category?: string
}

export interface SearchResponse {
  results: SearchResult[]
  query: string
  type: string
}

export interface SuggestItem {
  text: string           // suggestion text
  source: 'title' | 'history' | 'fuzzy'
  documentId?: string    // if from title match
  slug?: string          // if from title match
}

export interface SuggestResponse {
  suggestions: SuggestItem[]
  query: string
}
```

### Step 2: Add search_history table to schema
Add to `packages/api/src/db/schema.ts`:
```ts
export const searchHistory = sqliteTable('search_history', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  query: text('query').notNull(),
  resultCount: integer('result_count').notNull(),
  searchCount: integer('search_count').notNull().default(1),
  lastSearchedAt: integer('last_searched_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => ({
  tenantQueryIdx: uniqueIndex('idx_history_tenant_query').on(table.tenantId, table.query),
}))
```
Generate + apply migration.

### Step 3: Add suggest rate limit
In `packages/shared/src/constants.ts`:
```ts
suggest: { limit: 100, windowSec: 60 },
```

### Step 4: Create suggest service
Create `packages/api/src/services/suggest-service.ts`:

**`getSuggestions(env, tenantId, query, limit = 7)`:**
1. Normalize query: lowercase, trim
2. Check KV cache: `suggest:{tenantId}:{query}`
3. If cache hit → return parsed suggestions
4. Source 1 — title prefix (limit 3):
   ```sql
   SELECT id, title, slug FROM documents
   WHERE tenant_id = ? AND title LIKE ? AND deleted_at IS NULL
   ORDER BY updated_at DESC LIMIT 3
   ```
5. Source 2 — search history (limit 2):
   ```sql
   SELECT query FROM search_history
   WHERE tenant_id = ? AND query LIKE ? AND result_count > 0
   ORDER BY search_count DESC LIMIT 2
   ```
6. Source 3 — trigram fuzzy titles (only if total < 5):
   - Query `search_trigrams` WHERE field = 'title' with query trigrams
   - Return up to 2 doc titles not already in results
7. Deduplicate by text (case-insensitive)
8. Cache result in KV with TTL 300s
9. Return merged `SuggestItem[]`

**`recordSearchHistory(env, tenantId, query, resultCount)`:**
1. Normalize query: lowercase, trim
2. UPSERT into `search_history`:
   - If exists: `search_count += 1`, update `last_searched_at`
   - If not: INSERT new row
3. Invalidate related KV cache keys (optional, KV TTL handles staleness)

### Step 5: Add suggest endpoint
In `packages/api/src/routes/search.ts`:
```ts
// Autocomplete suggestions
searchRouter.get('/suggest', async (c) => {
  const { tenantId } = c.get('auth')
  const query = c.req.query('q')
  if (!query || query.length < 1) {
    return c.json({ suggestions: [], query: '' })
  }
  const limit = Math.min(10, parseInt(c.req.query('limit') ?? '7', 10))
  const suggestions = await getSuggestions(c.env, tenantId, query, limit)
  return c.json({ suggestions, query })
})
```
Apply `rateLimiter(RATE_LIMITS.suggest)` middleware.

### Step 6: Record history on search
In `searchRouter.get('/')` handler, after getting results:
```ts
// Record search history async (don't await — fire and forget)
c.executionCtx.waitUntil(
  recordSearchHistory(c.env, tenantId, query, results.length)
)
```

### Step 7: Create useSuggest hook
In `packages/web/src/hooks/use-search.ts`:
```ts
export function useSuggest(query: string) {
  return useQuery<SuggestResponse>({
    queryKey: ['suggest', query],
    queryFn: () =>
      apiClient.get<SuggestResponse>(
        `/api/search/suggest?q=${encodeURIComponent(query)}&limit=7`,
      ),
    enabled: query.length >= 1,
    staleTime: 60_000,  // 1 min client cache
  })
}
```

### Step 8: Update command palette UI
In `packages/web/src/components/command-palette/command-palette.tsx`:
- Add `useSuggest(debouncedQuery)` call (with shorter debounce ~150ms)
- Show suggestion items above search results when query is 1-2 chars
- Clicking a title suggestion navigates to doc
- Clicking a history suggestion fills the search input and triggers full search
- Visual distinction: title suggestions show doc icon, history shows clock icon

### Step 9: Add cleanup cron (optional)
Add to queue handler or scheduled worker:
```sql
DELETE FROM search_history
WHERE search_count = 1 AND last_searched_at < ?  -- 30 days ago
```

## Todo List
- [ ] Create `packages/shared/src/types/search.ts` with shared types
- [ ] Add `searchHistory` table to schema + generate migration
- [ ] Add `RATE_LIMITS.suggest` to constants
- [ ] Create `packages/api/src/services/suggest-service.ts`
- [ ] Add `GET /api/search/suggest` endpoint
- [ ] Record search history in existing search endpoint
- [ ] Create `useSuggest()` hook in web package
- [ ] Update command palette with autocomplete UI
- [ ] Test KV caching behavior (hit/miss/TTL)
- [ ] Test suggestion quality with various query lengths

## Success Criteria
- Typing "rea" shows "React Hooks", "React Components" as title suggestions
- Popular past searches appear as history suggestions
- Fuzzy suggestions catch typos in document titles
- Suggest response < 100ms on KV cache hit
- No duplicate suggestions across sources

## Risk Assessment
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| KV cache pollution | Low | Low | Short TTL (5min), normalized keys |
| History table bloat | Low | Low | Prune single-use queries after 30 days |
| Suggest too slow without KV | Medium | Medium | KV is primary path; D1 fallback still < 200ms |

## Security Considerations
- Suggest endpoint requires same auth as search
- History queries normalized to prevent injection
- KV keys scoped by tenantId — no cross-tenant leakage

## Next Steps
- Phase 3: Faceted filtering can reuse suggest endpoint for tag/category autocomplete
