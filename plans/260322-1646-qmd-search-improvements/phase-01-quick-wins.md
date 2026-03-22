---
phase: 1
title: "Quick Wins: Position-Aware RRF + Content Hash + Search Cache"
status: pending
priority: HIGH
effort: 5h
---

# Phase 1: Quick Wins

3 independent improvements requiring minimal code changes, zero new infrastructure.

## Context Links
- [Brainstorm Report](../reports/brainstorm-260322-1646-qmd-learnings-adoption.md)
- [QMD RRF Implementation](https://github.com/tobi/qmd) — position-aware blending logic
- Current RRF: `packages/api/src/utils/rrf.ts` (44 LOC)
- Current embedding: `packages/api/src/services/embedding-service.ts` (70 LOC)
- Current search: `packages/api/src/services/search-service.ts` (271 LOC)

## 1A: Position-Aware RRF Blending

**Effort:** 1.5h | **Files:** `rrf.ts`

### Current Behavior
All ranked lists get equal weight. RRF formula: `score = Σ 1/(60 + rank)`. No differentiation between keyword and semantic signals at different rank positions.

### New Behavior
Weight keyword (trigram) vs semantic differently based on final rank position:
- Top 3: 75% keyword / 25% semantic (trust exact matches for high-confidence results)
- Rank 4-10: 60% / 40% (balanced)
- Rank 11+: 40% / 60% (trust semantic understanding for tail results)
- Top-rank bonus: +0.05 for #1, +0.02 for #2-3 from keyword list

### Implementation Steps

1. **Modify `reciprocalRankFusion` signature** to accept list labels:
   ```typescript
   export interface RRFListOptions {
     list: RankedResult[]
     signal: 'keyword' | 'semantic' | 'default'
   }

   export function reciprocalRankFusion(
     ...inputs: (RankedResult[] | RRFListOptions)[]
   ): RankedResult[]
   ```
   Backward compatible: bare arrays treated as `signal: 'default'` (no weighting).

2. **Apply position-aware weight multiplier** after standard RRF accumulation:
   ```typescript
   // After computing base RRF scores, apply signal-specific multipliers
   function getSignalWeight(signal: string, rank: number): number {
     if (signal === 'default') return 1.0
     if (signal === 'keyword') {
       if (rank <= 3) return 0.75
       if (rank <= 10) return 0.60
       return 0.40
     }
     // semantic
     if (rank <= 3) return 0.25
     if (rank <= 10) return 0.40
     return 0.60
   }
   ```

3. **Add top-rank bonus** for keyword results:
   ```typescript
   // Bonus for keyword top results (exact match confidence)
   if (signal === 'keyword') {
     if (rank === 0) rrfScore += 0.05
     else if (rank <= 2) rrfScore += 0.02
   }
   ```

4. **Update callers** in `search-service.ts`:
   ```typescript
   // Before
   reciprocalRankFusion(keywordResults, semanticResults)

   // After
   reciprocalRankFusion(
     { list: keywordResults, signal: 'keyword' },
     { list: semanticResults, signal: 'semantic' },
   )
   ```
   Storage search results use `signal: 'default'` (no weighting change).

### Success Criteria
- [ ] Exact keyword matches rank higher for top positions
- [ ] Semantic-only matches still appear but ranked lower in top 3
- [ ] Backward compatible: existing callers with bare arrays still work
- [ ] No latency impact (pure math, no new I/O)

---

## 1B: Content Hash Skip Re-Embedding

**Effort:** 1.5h | **Files:** `schema.ts`, migration, `embedding-service.ts`, `queue/handler.ts`

### Current Behavior
Every document update triggers full re-embedding (delete all vectors + regenerate). Even whitespace or formatting-only changes cause expensive Workers AI calls.

### Key Insight
`document-service.ts` already has a `contentHash()` function using SHA-256. Reuse this pattern for embedding skip.

### Implementation Steps

1. **Add `contentHash` column** to `documents` table:
   ```typescript
   // schema.ts - documents table
   contentHash: text('content_hash'), // SHA-256 of content, null = never embedded
   ```

2. **Generate migration:**
   ```bash
   pnpm -F @agentwiki/api db:generate
   ```

3. **Modify `embedDocumentJob` in queue handler** to check hash:
   ```typescript
   async function embedDocumentJob(env: Env, documentId: string, tenantId: string) {
     const db = drizzle(env.DB)
     const [doc] = await db.select().from(documents).where(eq(documents.id, documentId))
     if (!doc) return

     // Compute hash of current content
     const hash = await computeHash(doc.content)

     // Skip if content unchanged since last embedding
     if (doc.contentHash === hash) {
       console.log(`Skip re-embed: content unchanged for ${documentId}`)
       return
     }

     // Embed as usual
     await embedDocument(env, documentId, doc.content, tenantId, doc.category ?? undefined)

     // Store hash after successful embedding
     await db.update(documents)
       .set({ contentHash: hash })
       .where(eq(documents.id, documentId))
   }

   async function computeHash(content: string): Promise<string> {
     const data = new TextEncoder().encode(content)
     const buf = await crypto.subtle.digest('SHA-256', data)
     return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
   }
   ```

4. **Extract `computeHash` to shared utility** (`packages/api/src/utils/hash.ts`) since `document-service.ts` already has similar code.

### Success Criteria
- [ ] Whitespace-only doc updates skip re-embedding
- [ ] First-time documents still get embedded (hash is null)
- [ ] Hash updated after successful embedding
- [ ] Workers AI call count reduced on doc update spikes

---

## 1C: Search Result Caching in KV

**Effort:** 2h | **Files:** `search-service.ts`

### Current Behavior
Only suggestions are cached in KV (5-min TTL). Full search results are computed fresh every time — semantic search alone costs ~200ms for embedding generation.

### Implementation Steps

1. **Add cache check at top of `searchDocuments()`:**
   ```typescript
   export async function searchDocuments(env: Env, options: SearchOptions) {
     const { tenantId, query, type = 'hybrid', limit = 10, filters, source = 'docs' } = options

     // Check cache first
     const cacheKey = buildSearchCacheKey(tenantId, query, type, limit, source, filters)
     const cached = await env.KV.get(cacheKey, 'json')
     if (cached) return cached as RankedResult[]

     // ... existing search logic ...

     const finalResults = fused.slice(0, limit)

     // Cache results (5-min TTL)
     await env.KV.put(cacheKey, JSON.stringify(finalResults), { expirationTtl: 300 })

     return finalResults
   }
   ```

2. **Build deterministic cache key:**
   ```typescript
   function buildSearchCacheKey(
     tenantId: string,
     query: string,
     type: string,
     limit: number,
     source: string,
     filters?: SearchFilters,
   ): string {
     const normalized = query.toLowerCase().trim()
     const filterStr = filters ? JSON.stringify(filters) : ''
     return `search:${tenantId}:${type}:${source}:${limit}:${normalized}:${filterStr}`
   }
   ```

3. **Add cache invalidation on document mutations.** In document create/update/delete routes, bust search cache:
   ```typescript
   // In document routes after mutation
   await invalidateSearchCache(env, tenantId)

   // Helper: delete all search keys for tenant
   // KV doesn't support prefix delete, so use short TTL (5 min) as natural expiry
   // For explicit invalidation: store a generation counter
   async function invalidateSearchCache(env: Env, tenantId: string): Promise<void> {
     // Increment generation counter — cached results with old generation are stale
     const genKey = `search-gen:${tenantId}`
     const gen = parseInt(await env.KV.get(genKey) ?? '0') + 1
     await env.KV.put(genKey, gen.toString(), { expirationTtl: 3600 })
   }
   ```
   Include generation in cache key so mutations auto-invalidate.

4. **Don't cache if `debug=true`** (Phase 2 addition — prepare for it now by skipping cache when debug param present).

### Success Criteria
- [ ] Identical search queries within 5 min return cached results
- [ ] Document mutations invalidate cache via generation counter
- [ ] Cache miss = normal search path (no behavior change)
- [ ] KV read adds <5ms latency on cache hit

---

## Todo List

- [ ] 1A: Modify `rrf.ts` with position-aware weighting
- [ ] 1A: Update `search-service.ts` callers with signal labels
- [ ] 1A: Update `storage-search-service.ts` callers
- [ ] 1B: Add `contentHash` column to schema + migration
- [ ] 1B: Extract `computeHash` to `utils/hash.ts`
- [ ] 1B: Add hash check in `embedDocumentJob` queue handler
- [ ] 1C: Add KV cache layer in `searchDocuments()`
- [ ] 1C: Add generation counter for cache invalidation
- [ ] Run `pnpm type-check && pnpm lint`
- [ ] Run `pnpm test`

## Security Considerations
- Cache keys include `tenantId` → no cross-tenant data leakage
- Content hash is SHA-256 (crypto-grade)
- KV TTL ensures stale data naturally expires
