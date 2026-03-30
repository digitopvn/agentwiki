---
phase: 1
status: pending
priority: high
---

# Phase 1: Fix syncWikilinks + Add autoLinkFromSimilarities

## Overview

Two changes: (1) fix `syncWikilinks` to preserve auto-links, (2) add new function to create auto-links from similarities.

## Context Links

- Schema: `packages/api/src/db/schema.ts:115-136`
- Similarity service: `packages/api/src/services/similarity-service.ts`
- Document service: `packages/api/src/services/document-service.ts:511-555`

## Critical Bug Fix: syncWikilinks

`syncWikilinks()` line 521 does:
```ts
await db.delete(documentLinks).where(eq(documentLinks.sourceDocId, docId))
```

This deletes ALL links including `inferred=1` auto-links. Must scope to explicit only:
```ts
await db.delete(documentLinks).where(
  and(eq(documentLinks.sourceDocId, docId), eq(documentLinks.inferred, 0))
)
```

### Files to Modify

- `packages/api/src/services/document-service.ts` — line 521

### Steps

1. In `syncWikilinks()`, change delete to only target `inferred=0` links
2. Import `and` if not already imported (already imported at line 1)

## New Function: autoLinkFromSimilarities

Add to `packages/api/src/services/similarity-service.ts`.

### Logic

```
1. Read document_similarities for documentId (already cached by compute-similarities)
2. Read existing document_links for documentId where inferred=0 (explicit links)
3. For each similar doc NOT already explicitly linked:
   a. Upsert document_links: sourceDocId=documentId, targetDocId=similarDoc, inferred=1, type='relates-to', weight=similarity_score
   b. Upsert reverse: sourceDocId=similarDoc, targetDocId=documentId, inferred=1, type='relates-to', weight=similarity_score
4. Clean up stale auto-links: delete inferred=1 links from this doc that are NO LONGER in top similarities
```

### Pseudocode

```ts
export async function autoLinkFromSimilarities(
  env: Env,
  documentId: string,
  tenantId: string,
) {
  const db = drizzle(env.DB)

  // 1. Get cached similarities (already computed)
  const similarities = await db.select({
    targetDocId: documentSimilarities.targetDocId,
    score: documentSimilarities.score,
  })
    .from(documentSimilarities)
    .where(eq(documentSimilarities.sourceDocId, documentId))
    .orderBy(desc(documentSimilarities.score))

  if (!similarities.length) return

  // 2. Get existing explicit links (inferred=0) to skip
  const explicitLinks = await db.select({ targetDocId: documentLinks.targetDocId })
    .from(documentLinks)
    .where(and(
      eq(documentLinks.sourceDocId, documentId),
      eq(documentLinks.inferred, 0),
    ))
  const explicitTargets = new Set(explicitLinks.map(l => l.targetDocId))

  // 3. Upsert auto-links for similar docs not explicitly linked
  const now = new Date()
  const autoLinkedTargets: string[] = []

  for (const sim of similarities) {
    if (explicitTargets.has(sim.targetDocId)) continue
    autoLinkedTargets.push(sim.targetDocId)

    // Forward: documentId → targetDoc
    await db.insert(documentLinks).values({
      id: generateId(),
      sourceDocId: documentId,
      targetDocId: sim.targetDocId,
      type: 'relates-to',
      weight: sim.score,
      inferred: 1,
      context: null,
      createdAt: now,
    }).onConflictDoNothing() // skip if explicit link exists in reverse direction

    // Reverse: targetDoc → documentId
    await db.insert(documentLinks).values({
      id: generateId(),
      sourceDocId: sim.targetDocId,
      targetDocId: documentId,
      type: 'relates-to',
      weight: sim.score,
      inferred: 1,
      context: null,
      createdAt: now,
    }).onConflictDoNothing()
  }

  // 4. Clean stale auto-links: remove inferred=1 links no longer in similarities
  if (autoLinkedTargets.length > 0) {
    await db.delete(documentLinks).where(and(
      eq(documentLinks.sourceDocId, documentId),
      eq(documentLinks.inferred, 1),
      not(inArray(documentLinks.targetDocId, autoLinkedTargets)),
    ))
  } else {
    // No similarities → remove all auto-links from this doc
    await db.delete(documentLinks).where(and(
      eq(documentLinks.sourceDocId, documentId),
      eq(documentLinks.inferred, 1),
    ))
  }
}
```

### Conflict Handling

`document_links` has no unique index on `(sourceDocId, targetDocId)` — need to check for existing links before insert. Use a query-then-insert pattern:
- Query existing links (both explicit and inferred) for the pair
- Skip insert if any link already exists between the pair in same direction

### Imports Needed

In `similarity-service.ts`, add: `documentLinks` from schema, `generateId` from utils, `not`, `inArray` from drizzle-orm.

## Todo

- [ ] Fix `syncWikilinks` delete scope to `inferred=0` only
- [ ] Add `autoLinkFromSimilarities()` to `similarity-service.ts`
- [ ] Export the new function

## Success Criteria

- `syncWikilinks` no longer deletes auto-links
- `autoLinkFromSimilarities` creates bidirectional `inferred=1` links
- Stale auto-links cleaned up when similarities change
- No duplicate links created

## Risk

- `document_links` lacks unique index on `(sourceDocId, targetDocId)` — must handle dedup in app layer
- D1 write limits — max 5 similarities = max 10 inserts per call (acceptable)
