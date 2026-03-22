# Code Review: Dual-Layer Knowledge Graph (Issue #34)

## Scope
- **Files**: 10 new, 11 modified (across shared, api, mcp, web packages)
- **LOC**: ~1,400 new lines
- **Focus**: Full feature review (security, performance, types, edge cases)
- **TypeScript**: All 4 packages compile cleanly (tsc --noEmit passes)
- **Migration**: 0004_far_slipstream.sql present and correct

## Overall Assessment

Well-structured implementation. Clean separation: graph-service (traversal), similarity-service (Vectorize), graph-ai-service (inference). Types are properly shared via `@agentwiki/shared`. Frontend is minimal and focused. **No critical blocking issues found.**

---

## Critical Issues

None.

---

## High Priority

### H1. In-Memory BFS Loads Entire Tenant Graph (Performance)

**File**: `packages/api/src/services/graph-service.ts` lines 312-315, 360-362

`getNeighbors()` and `findPath()` both call `fetchTenantDocs()` + `fetchLinks()` for ALL tenant docs to build the adjacency list. For a tenant with 5K docs and 20K links, this means:
- 2 unbounded D1 queries per request
- Full adjacency list built in Worker memory
- Workers have 128MB memory limit

**Impact**: At scale, this will hit D1 row limits (500K rows per query) and Worker memory pressure.

**Recommendation**: For v1 this is acceptable with the `maxNodes: 200` cap. For v2, consider:
- Iterative BFS with per-hop queries (fetch only neighbors of frontier)
- Or pre-compute adjacency in a KV cache, invalidated on link changes
- Add a guard: if `allDocs.length > 5000`, return 413 or degrade gracefully

### H2. `inArray()` with Large Arrays (D1 SQL Limit)

**File**: `packages/api/src/services/graph-service.ts` lines 245, 228, 260

SQLite `IN (...)` clauses have a limit of ~999 parameters. `fetchLinks()`, `fetchTagMap()`, and `fetchSimilarities()` pass `docIds` arrays directly to `inArray()`. With 5K docs, this will fail.

**Impact**: Query will error for large tenants.

**Recommendation**: Batch `inArray` calls in chunks of 500:
```typescript
async function batchedInArray<T>(ids: string[], batchSize = 500, queryFn: (batch: string[]) => Promise<T[]>): Promise<T[]> {
  const results: T[] = []
  for (let i = 0; i < ids.length; i += batchSize) {
    results.push(...await queryFn(ids.slice(i, i + batchSize)))
  }
  return results
}
```

### H3. `fetchLinks` Post-Filter is O(n*m) (Performance)

**File**: `packages/api/src/services/graph-service.ts` line 247

```typescript
let filtered = links.filter((l) => docIds.includes(l.targetDocId))
```

`Array.includes()` is O(n) per call, making this O(links * docIds). Convert `docIds` to a `Set` first:

```typescript
const docIdSet = new Set(docIds)
let filtered = links.filter((l) => docIdSet.has(l.targetDocId))
```

### H4. Similarity Service N+1 Query Pattern

**File**: `packages/api/src/services/similarity-service.ts` lines 66-84

`computeSimilarities()` runs a separate DB query per match to verify tenant membership (up to 5 queries). These should be batched:

```typescript
const targetIds = similar.map(m => extractDocId(m.id))
const existing = await db.select({ id: documents.id })
  .from(documents)
  .where(and(inArray(documents.id, targetIds), eq(documents.tenantId, tenantId)))
const validIds = new Set(existing.map(e => e.id))
// Then filter + batch insert
```

---

## Medium Priority

### M1. Missing Tenant Isolation Check on Graph Traversal Start Node

**File**: `packages/api/src/services/graph-service.ts` lines 295-332

`getNeighbors()` accepts `docId` as a starting node but does not verify the doc belongs to `tenantId` before traversal. The BFS will simply return an empty result if the docId is not in `allDocs`, so there is no data leak, but the full graph is still loaded. Consider early validation.

### M2. `querySimilarDocs` Fetches All Tenant Docs

**File**: `packages/api/src/services/similarity-service.ts` lines 136-146

Fetches ALL tenant documents to resolve metadata for the similarity results. Should fetch only the matched doc IDs:

```typescript
const matchedIds = [...scoreMap.keys()]
const docs = await db.select(...)
  .from(documents)
  .where(and(eq(documents.tenantId, tenantId), inArray(documents.id, matchedIds)))
```

### M3. Wikilink Type Annotation Parsing Edge Case

**File**: `packages/api/src/utils/wikilink-extractor.ts` line 13

The regex `|type:([a-z-]+)$` is anchored at end of inner text. A link like `[[display|target|type:depends-on]]` would match correctly, but `[[target|type:depends-on|extra]]` would not. This is fine for the defined syntax, but document the expected format in a code comment.

### M4. No Debounce on Graph Filter Changes

**File**: `packages/web/src/routes/graph.tsx`

Every filter toggle in `GraphToolbar` triggers a new API call immediately via `useGraphData`. Consider debouncing filter changes by 300ms to avoid rapid-fire requests when toggling multiple edge types.

### M5. `graph_explain_connection` Makes 4 Queries

**File**: `packages/mcp/src/tools/graph-traversal-tools.ts` lines 128-160

The explain tool issues: 2 directLink queries + findPath (which loads full graph) + querySimilarDocs. This is heavy for a single MCP tool call. Not blocking, but document the cost in the tool description or add a note about caching.

### M6. Edge Type Inference Silently Skips Links After 10

**File**: `packages/api/src/services/graph-ai-service.ts` line 77

`links.slice(0, 10)` silently drops remaining untyped links. If a doc has 20 links, 10 will never get inferred. Consider: re-enqueue the job if more remain, or document this as intentional quota management.

### M7. Self-Loop Prevention Missing

**File**: `packages/api/src/services/document-service.ts` lines 476-501

`syncWikilinks()` does not check if `target[0].id === docId` (self-referencing wikilink). A document linking to itself would create a self-loop edge. Add a guard:

```typescript
if (target.length && target[0].id !== docId) {
  // insert link
}
```

---

## Low Priority

### L1. GraphCanvas Recreated on Every Data Change

**File**: `packages/web/src/components/graph/graph-canvas.tsx` line 180

The `useEffect` dependency array `[data, onNodeSelect, onNodeNavigate]` means the entire Cytoscape instance is destroyed and recreated on every data refetch. For smoother UX, consider diffing elements and using `cy.add()`/`cy.remove()` instead of full recreation.

### L2. `onNodeSelect` Shift-Click Not Actually Detected

**File**: `packages/web/src/routes/graph.tsx` lines 16-20

The `handleNodeSelect` always adds to selection if prev.length === 1, regardless of whether Shift was pressed. The Cytoscape `tap` event does not pass the keyboard modifier. Either: always allow multi-select (current behavior, which is fine), or use `evt.originalEvent.shiftKey` in the Cytoscape handler.

### L3. `parseEdgeTypes` Duplicates EDGE_TYPES Array

**File**: `packages/api/src/routes/graph.ts` lines 20-25

The valid types are hardcoded as a string array instead of importing `EDGE_TYPES` from shared. Use the shared constant:

```typescript
import { EDGE_TYPES } from '@agentwiki/shared'
function parseEdgeTypes(param?: string): EdgeType[] | undefined {
  if (!param) return undefined
  return param.split(',').filter((t) => (EDGE_TYPES as readonly string[]).includes(t)) as EdgeType[]
}
```

### L4. `direction` Query Param Not Validated

**File**: `packages/api/src/routes/graph.ts` line 50

```typescript
const direction = (c.req.query('direction') ?? 'both') as 'outbound' | 'inbound' | 'both'
```

Unsafe cast - any string is accepted. Add validation:
```typescript
const raw = c.req.query('direction')
const direction = ['outbound', 'inbound', 'both'].includes(raw ?? '') ? raw as ... : 'both'
```

### L5. `Number()` Parsing Without NaN Guard

**File**: `packages/api/src/routes/graph.ts` lines 48, 52, 76, etc.

`Number(c.req.query('depth') ?? 1)` will produce `NaN` if the param is a non-numeric string like `"abc"`. `Math.min(NaN, 3)` returns `NaN`. Add `|| defaultValue` fallback:

```typescript
const depth = Math.min(Number(c.req.query('depth')) || 1, 3)
```

---

## Positive Observations

1. **Clean type sharing** - `@agentwiki/shared` graph types are well-defined with `as const` for edge types
2. **Tenant isolation** - All DB queries filter by `tenantId`; Vectorize queries filter by `org_id`
3. **Sensible defaults and caps** - depth max 3, maxNodes max 200, maxHops max 10
4. **Queue-based async processing** - Similarity computation and edge inference are enqueued, not inline
5. **Migration present** - Schema changes have a proper Drizzle migration (0004)
6. **MCP tools are read-only** - All graph tools have `readOnlyHint: true` annotation
7. **Graceful AI fallback** - `inferEdgeType` returns `'relates-to'` on any error
8. **Good separation of concerns** - graph-service, similarity-service, graph-ai-service each own their domain

---

## Metrics

| Metric | Value |
|--------|-------|
| TypeScript | All 4 packages pass `tsc --noEmit` |
| Critical Issues | 0 |
| High Priority | 4 |
| Medium Priority | 7 |
| Low Priority | 5 |
| Migration | Present (0004_far_slipstream.sql) |

---

## Recommended Actions (Prioritized)

1. **Fix H3 immediately** (Array.includes -> Set.has) - trivial, significant perf impact
2. **Fix M7** (self-loop prevention) - one-line guard
3. **Fix L3, L4, L5** (input validation in routes) - low effort, good hygiene
4. **Plan H1, H2 for v2** (batched queries, iterative BFS) - needed before scaling past 1K docs
5. **Fix H4** (N+1 in similarity service) - batch the tenant check query
6. **Consider M4** (debounce filters) - improves UX

---

## Unresolved Questions

1. Is there a plan to add indexes on `document_links.source_doc_id` and `document_links.target_doc_id`? The migration adds them for `document_similarities` but not for `document_links`. At scale, the `fetchLinks` query will need these.
2. Should deleted docs' links and similarities be cleaned up? `deleteDocument()` soft-deletes but does not remove `documentLinks` or `documentSimilarities` rows. The graph service filters by `isNull(documents.deletedAt)` but stale link rows accumulate.
3. Edge type inference re-enqueue: should a doc with >10 untyped links get a follow-up queue message?
