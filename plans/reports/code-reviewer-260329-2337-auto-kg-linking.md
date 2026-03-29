# Code Review: Auto KG Linking (Issue #68)

**Date:** 2026-03-29
**Branch:** claude/great-curie
**Files reviewed:** 4 changed files, ~140 LOC added

---

## Scope

- `packages/api/src/services/similarity-service.ts` — `autoLinkFromSimilarities()` + import
- `packages/api/src/services/document-service.ts` — `syncWikilinks()` delete guard fix
- `packages/api/src/queue/handler.ts` — new queue case + chain
- `packages/api/src/routes/graph.ts` — `POST /backfill-auto-links` admin endpoint

---

## Overall Assessment

The feature is logically sound and the `syncWikilinks` fix is correct and necessary. However there are two bugs — one a data-integrity issue and one a correctness gap — plus N+1 query patterns that will degrade under volume, and a dead parameter that suggests incomplete tenant isolation.

---

## Critical Issues

### 1. Stale cleanup only covers forward direction — reverse auto-links leak

In `autoLinkFromSimilarities`, step 4 deletes stale auto-links only where `sourceDocId = documentId`. The reverse links inserted in step 3 (where `sourceDocId = sim.targetDocId`) are **never cleaned up** when those similarities are later dropped.

If doc A was similar to doc B last run, a reverse link `B → A (inferred=1)` was created. Next run, if B is no longer in A's similarities, the forward `A → B` is deleted but `B → A` stays forever.

**Fix:** After the forward cleanup, also clean reverse stale links:

```ts
// Clean stale reverse auto-links from this doc's similarity set
await db.delete(documentLinks).where(and(
  eq(documentLinks.targetDocId, documentId),
  eq(documentLinks.inferred, 1),
  autoLinkedTargets.length > 0
    ? not(inArray(documentLinks.sourceDocId, autoLinkedTargets))
    : undefined,
))
```

Or track reverse links in `autoLinkedTargets` symmetrically and delete both directions.

---

### 2. `tenantId` parameter accepted but never used — cross-tenant data access risk

`autoLinkFromSimilarities(env, documentId, tenantId)` accepts `tenantId` but the function body never filters by it. All DB queries operate on `documentId` alone, relying on `documentSimilarities.sourceDocId` and `documentLinks.sourceDocId` as the sole filter.

This means:
- If `documentId` is ever passed from an untrusted source (or via the backfill endpoint), there is no tenant ownership check before reading or writing links.
- A crafted queue message with a foreign tenant's `documentId` would still process and mutate links.

The backfill endpoint does enforce `requirePermission('tenant:manage')` and uses `tenantId` from the auth context correctly, but the queue handler has no such guard — it trusts the message payload.

**Fix:** Add a tenant ownership check at the top of `autoLinkFromSimilarities`:

```ts
const doc = await db.select({ id: documents.id })
  .from(documents)
  .where(and(eq(documents.id, documentId), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))
  .limit(1)
if (!doc.length) return
```

This also defends against processing deleted documents.

---

## High Priority

### 3. N+1 queries in the main similarity loop

For each of up to 5 similarities, the code fires 2 SELECT queries (`existingFwd`, `existingRev`) and up to 2 INSERTs — totalling up to 20 round-trips per document. In D1 (HTTP-based SQLite), each round-trip is a network call.

**Fix:** Batch-fetch all existing links in both directions before the loop:

```ts
const targetIds = similarities.map(s => s.targetDocId)

const existingLinks = await db.select({
  sourceDocId: documentLinks.sourceDocId,
  targetDocId: documentLinks.targetDocId,
})
  .from(documentLinks)
  .where(and(
    or(
      and(eq(documentLinks.sourceDocId, documentId), inArray(documentLinks.targetDocId, targetIds)),
      and(inArray(documentLinks.sourceDocId, targetIds), eq(documentLinks.targetDocId, documentId)),
    ),
  ))

const fwdSet = new Set(existingLinks.filter(l => l.sourceDocId === documentId).map(l => l.targetDocId))
const revSet = new Set(existingLinks.filter(l => l.targetDocId === documentId).map(l => l.sourceDocId))
```

Then check `fwdSet.has(...)` / `revSet.has(...)` inside the loop instead of querying. Reduces from up to 10 SELECTs to 1.

---

### 4. No similarity score threshold in `autoLinkFromSimilarities`

`computeSimilarities` enforces `SIMILARITY_THRESHOLD = 0.7` during the Vectorize query, but `autoLinkFromSimilarities` reads all cached similarities without any score filter. If stale low-score entries remain in the cache (race between cleanup and auto-link job), they will generate spurious links.

**Fix:** Add a threshold guard:

```ts
const LINK_THRESHOLD = 0.7
const similarities = await db.select(...)
  ...
  .where(and(
    eq(documentSimilarities.sourceDocId, documentId),
    gte(documentSimilarities.score, LINK_THRESHOLD),
  ))
```

Or import and reuse `SIMILARITY_THRESHOLD` from the same file (it's already defined above).

---

## Medium Priority

### 5. Queue chain fires `infer-edge-types` even if `autoLinkFromSimilarities` creates no links

In `handler.ts`, the chain `auto-link-similarities → infer-edge-types` is unconditional. When no similarities exist and the function returns early, the `infer-edge-types` job still fires. This wastes a queue invocation per document on every save cycle if embeddings are not yet available.

Minor cost in current volumes; becomes noise at scale. Return value or flag from `autoLinkFromSimilarities` could gate the chain, but requires a small refactor of the void return type.

---

### 6. Backfill endpoint has no pagination guard — could queue thousands of jobs in a single request

The endpoint uses `BATCH_SIZE = 50` to page documents, but the caller must increment `offset` manually across HTTP calls. There's no rate limiting or concurrency cap. A caller who loops this endpoint rapidly can flood the queue with thousands of `auto-link-similarities` messages simultaneously.

Acceptable for an internal admin endpoint today, but worth noting if this ever becomes automatable or exposed more broadly.

---

### 7. `syncWikilinks` — `and()` call with new second argument requires `and` import in scope

The diff adds `eq(documentLinks.inferred, 0)` inside an `and()`. The `and` import was already present in `document-service.ts` (used elsewhere), so this is not a bug — just confirming it's fine.

---

## Positive Observations

- `syncWikilinks` fix is correct and minimal — preserving `inferred=1` links on explicit-link sync is exactly right.
- `requirePermission('tenant:manage')` on the backfill endpoint is appropriate gating.
- Queue chaining pattern is clean and consistent with existing handler style.
- `computeSimilarities` existing insert-before-delete ordering (avoids data loss on partial failure) is a good pattern; `autoLinkFromSimilarities` should adopt the same ordering for its own writes vs. the stale cleanup.
- Bidirectional link creation intent is correct for an undirected similarity graph.

---

## Recommended Actions

1. **[Critical]** Fix stale reverse-link cleanup — add a matching delete for `targetDocId = documentId, inferred = 1` at end of step 4.
2. **[Critical]** Add tenant ownership guard at top of `autoLinkFromSimilarities` using the `tenantId` param that is currently unused.
3. **[High]** Batch the `existingFwd`/`existingRev` SELECT queries into one query before the loop.
4. **[High]** Apply `SIMILARITY_THRESHOLD` filter when reading cached similarities (already defined in the same file).
5. **[Medium]** Gate `infer-edge-types` queue dispatch on whether any links were actually created.

---

## Unresolved Questions

- Should `weight` on a reverse auto-link be the same score as the forward link? Currently it is — is this intentional or should it be asymmetric based on reverse-direction similarity?
- When a user manually creates a link that was previously auto-inferred (`inferred=1`), is there a promotion path to `inferred=0`? Currently `syncWikilinks` only manages `inferred=0` links, but if a wikilink and an auto-link target the same doc, both records may coexist as separate rows (forward check only guards against exact `sourceDocId+targetDocId` duplication, not cross-`inferred` dedup).
