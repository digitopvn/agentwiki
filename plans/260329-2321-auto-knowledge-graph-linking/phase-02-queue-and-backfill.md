---
phase: 2
status: pending
priority: high
---

# Phase 2: Queue Handler Chain + Backfill Endpoint

## Overview

Wire `autoLinkFromSimilarities` into the queue pipeline and add admin backfill endpoint.

## Context Links

- Queue handler: `packages/api/src/queue/handler.ts`
- Graph routes: `packages/api/src/routes/graph.ts:174-207`

## Change 1: Queue Handler — New Job Type

### File: `packages/api/src/queue/handler.ts`

Add import:
```ts
import { autoLinkFromSimilarities } from '../services/similarity-service'
```

Add case in `processMessage` switch:
```ts
case 'auto-link-similarities':
  if (msg.documentId) {
    await autoLinkFromSimilarities(env, msg.documentId, msg.tenantId)
    // Chain: infer edge types for newly created auto-links
    await env.QUEUE.send({ type: 'infer-edge-types', documentId: msg.documentId, tenantId: msg.tenantId })
  }
  break
```

### Steps

1. Import `autoLinkFromSimilarities` from similarity-service
2. Add `auto-link-similarities` case after `compute-similarities` case
3. Chain `infer-edge-types` after auto-link completes

## Change 2: Chain from compute-similarities

### File: `packages/api/src/queue/handler.ts`

In `embedDocumentJob()` (line 171), after `compute-similarities` is enqueued, the chain already exists:
```
embed → compute-similarities (line 171)
```

But `compute-similarities` case (line 67) just calls `computeSimilarities()` and stops. Need to chain:

```ts
case 'compute-similarities':
  if (msg.documentId) {
    await computeSimilarities(env, msg.documentId, msg.tenantId)
    // Chain: auto-link from computed similarities
    await env.QUEUE.send({ type: 'auto-link-similarities', documentId: msg.documentId, tenantId: msg.tenantId })
  }
  break
```

### Steps

1. Modify existing `compute-similarities` case to enqueue `auto-link-similarities` after completion

## Change 3: Backfill Endpoint

### File: `packages/api/src/routes/graph.ts`

Add new route before the `export { graphRouter }` line:

```ts
/** Backfill auto-links for existing documents via queue (admin) */
graphRouter.post('/backfill-auto-links', requirePermission('tenant:manage'), async (c) => {
  try {
    const { tenantId } = c.get('auth')
    const db = drizzle(c.env.DB)
    const BATCH_SIZE = 50
    const offset = parseNum(c.req.query('offset'), 0)

    // Get docs that have embeddings (document_similarities exist)
    const batch = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))
      .limit(BATCH_SIZE)
      .offset(offset)

    let enqueued = 0
    for (const doc of batch) {
      await c.env.QUEUE.send({
        type: 'auto-link-similarities',
        documentId: doc.id,
        tenantId,
      })
      enqueued++
    }

    const hasMore = batch.length === BATCH_SIZE
    return c.json({
      ok: true,
      enqueued,
      offset,
      nextOffset: hasMore ? offset + BATCH_SIZE : null,
      hasMore,
    })
  } catch (err) {
    console.error('Backfill auto-links error:', err)
    return c.json({ error: 'Failed to backfill auto-links' }, 500)
  }
})
```

### Steps

1. Add route `POST /backfill-auto-links` with `tenant:manage` permission
2. Batch 50 docs at a time, enqueue `auto-link-similarities` for each
3. Return offset-based pagination for client to continue

## Todo

- [ ] Import `autoLinkFromSimilarities` in handler.ts
- [ ] Add `auto-link-similarities` case in queue handler
- [ ] Chain `auto-link-similarities` after `compute-similarities`
- [ ] Add `POST /backfill-auto-links` endpoint in graph.ts

## Success Criteria

- `compute-similarities` → `auto-link-similarities` → `infer-edge-types` chain works
- Backfill endpoint enqueues jobs for all existing docs
- Backfill supports offset pagination for large datasets
- Admin-only access (tenant:manage permission)
