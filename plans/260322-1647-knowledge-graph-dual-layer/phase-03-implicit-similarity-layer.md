---
phase: 3
title: "Implicit Similarity Layer"
status: completed
priority: P1
effort: 14h
dependencies: [phase-01]
---

# Phase 3: Implicit Similarity Layer

Cache Vectorize similarity edges in D1. Runs parallel with Phase 2.

## Context Links
- [plan.md](plan.md) | [Phase 1](phase-01-schema-edge-types.md)
- Queue handler: `packages/api/src/queue/handler.ts`
- Embedding service: `packages/api/src/services/embedding-service.ts`
- Env bindings: `packages/api/src/env.ts`

## Overview

After document embedding (existing pipeline), compute top-5 nearest neighbors via Vectorize and cache in `document_similarities` table. Add on-demand similarity endpoint.

## Requirements

### Functional
- After embedding, queue `compute-similarities` job
- Job queries Vectorize for top-5 neighbors (score > 0.7), stores in `document_similarities`
- `GET /api/graph/similar/:id` — on-demand Vectorize query (fresh, not cached)
- `include_implicit=true` on graph endpoints merges cached similarities as dotted edges
- Re-compute similarities when document content changes (piggyback on existing embed flow)

### Non-functional
- Similarity computation runs async (Queue) — no user-facing latency
- On-demand query <500ms (single Vectorize call)
- Cache invalidation: delete old similarities before inserting new ones

## Architecture

```
Doc created/updated
  → Queue: 'embed' job (existing)
  → After embedding: Queue: 'compute-similarities' job (new)
    → Vectorize.query(docVector, topK=6) → filter self → top 5
    → DELETE FROM document_similarities WHERE source_doc_id = ?
    → INSERT top-5 with score > 0.7
```

## Related Code Files

### Modify
- `packages/api/src/queue/handler.ts` — Add `compute-similarities` job type
- `packages/api/src/services/graph-service.ts` — Add similarity merging logic (from Phase 2)
- `packages/api/src/routes/graph.ts` — Add `/similar/:id` endpoint

### Create
- `packages/api/src/services/similarity-service.ts` — Similarity computation + caching

## Implementation Steps

### Step 1: Create similarity-service.ts

`packages/api/src/services/similarity-service.ts`:

```typescript
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc } from 'drizzle-orm'
import { documentSimilarities, documents } from '../db/schema'
import { generateId } from '../utils/id'
import type { Env } from '../env'

const SIMILARITY_THRESHOLD = 0.7
const TOP_K = 6 // query 6, filter self, keep top 5

/** Compute and cache top-5 similar docs for a document */
export async function computeSimilarities(
  env: Env,
  documentId: string,
  tenantId: string,
) {
  const db = drizzle(env.DB)

  // Get the document's primary vector (chunk 0)
  const vectorId = `doc-${documentId}-0`
  const queryResult = await env.VECTORIZE.query(vectorId, {
    topK: TOP_K,
    filter: { org_id: tenantId, source_type: 'document' },
    returnValues: false,
    returnMetadata: 'indexed',
  })

  if (!queryResult.matches?.length) return

  // Filter: remove self, apply threshold
  const similar = queryResult.matches
    .filter((m) => {
      const docId = m.id.replace(/^doc-/, '').replace(/-\d+$/, '')
      return docId !== documentId && m.score >= SIMILARITY_THRESHOLD
    })
    .slice(0, 5)

  // Delete old cached similarities for this source
  await db.delete(documentSimilarities)
    .where(eq(documentSimilarities.sourceDocId, documentId))

  // Insert new similarities
  const now = new Date()
  for (const match of similar) {
    const targetDocId = match.id.replace(/^doc-/, '').replace(/-\d+$/, '')

    // Verify target doc exists and belongs to tenant
    const exists = await db.select({ id: documents.id })
      .from(documents).where(and(
        eq(documents.id, targetDocId),
        eq(documents.tenantId, tenantId),
      )).limit(1)

    if (exists.length) {
      await db.insert(documentSimilarities).values({
        id: generateId(),
        sourceDocId: documentId,
        targetDocId: targetDocId,
        score: match.score,
        computedAt: now,
      }).onConflictDoUpdate({
        target: [documentSimilarities.sourceDocId, documentSimilarities.targetDocId],
        set: { score: match.score, computedAt: now },
      })
    }
  }
}

/** Get cached similar docs for a document */
export async function getCachedSimilarities(
  env: Env,
  documentId: string,
) {
  const db = drizzle(env.DB)
  return db.select({
    targetDocId: documentSimilarities.targetDocId,
    score: documentSimilarities.score,
    title: documents.title,
    slug: documents.slug,
  })
    .from(documentSimilarities)
    .innerJoin(documents, eq(documentSimilarities.targetDocId, documents.id))
    .where(eq(documentSimilarities.sourceDocId, documentId))
    .orderBy(desc(documentSimilarities.score))
}

/** On-demand Vectorize query (fresh, not cached) */
export async function querySimilarDocs(
  env: Env,
  documentId: string,
  tenantId: string,
  limit = 10,
  minScore = 0.5,
) {
  const vectorId = `doc-${documentId}-0`
  const result = await env.VECTORIZE.query(vectorId, {
    topK: limit + 1,
    filter: { org_id: tenantId, source_type: 'document' },
    returnValues: false,
    returnMetadata: 'indexed',
  })

  if (!result.matches?.length) return []

  const db = drizzle(env.DB)
  const similar = result.matches
    .filter((m) => {
      const docId = m.id.replace(/^doc-/, '').replace(/-\d+$/, '')
      return docId !== documentId && m.score >= minScore
    })
    .slice(0, limit)

  // Resolve doc metadata
  const docIds = similar.map((m) => m.id.replace(/^doc-/, '').replace(/-\d+$/, ''))
  const docs = await db.select({ id: documents.id, title: documents.title, slug: documents.slug, category: documents.category })
    .from(documents)
    .where(and(eq(documents.tenantId, tenantId)))

  const docMap = new Map(docs.map((d) => [d.id, d]))
  return similar
    .map((m) => {
      const id = m.id.replace(/^doc-/, '').replace(/-\d+$/, '')
      const doc = docMap.get(id)
      return doc ? { ...doc, score: m.score } : null
    })
    .filter(Boolean)
}
```

### Step 2: Add Queue Job

In `packages/api/src/queue/handler.ts`, add case:

```typescript
case 'compute-similarities':
  if (msg.documentId) await computeSimilarities(env, msg.documentId, msg.tenantId)
  break
```

### Step 3: Trigger After Embedding

In `embedDocumentJob()` (queue/handler.ts), after successful embedding, enqueue similarity computation:

```typescript
async function embedDocumentJob(env: Env, documentId: string, tenantId: string) {
  // ... existing embedding logic ...
  await embedDocument(env, documentId, doc[0].content, tenantId, doc[0].category ?? undefined)

  // Trigger similarity computation after embedding completes
  await env.QUEUE.send({ type: 'compute-similarities', documentId, tenantId })
}
```

### Step 4: Add /api/graph/similar/:id Endpoint

In `packages/api/src/routes/graph.ts`:

```typescript
graphRouter.get('/similar/:id', requirePermission('doc:read'), async (c) => {
  const docId = c.req.param('id')
  const limit = Math.min(Number(c.req.query('limit') ?? 10), 50)
  const minScore = Number(c.req.query('min_score') ?? 0.5)

  const results = await querySimilarDocs(
    c.env, docId, c.get('auth').tenantId, limit, minScore,
  )
  return c.json({ results, documentId: docId })
})
```

### Step 5: Merge Implicit Edges in Graph Service

In `graph-service.ts` (Phase 2), when `includeImplicit=true`:

```typescript
// After fetching explicit edges, if includeImplicit:
if (opts.includeImplicit) {
  const docIdList = nodes.map(n => n.data.id)
  const similarities = await db.select()
    .from(documentSimilarities)
    .where(inArray(documentSimilarities.sourceDocId, docIdList))

  for (const sim of similarities) {
    if (docIds.has(sim.targetDocId)) {
      edges.push({
        data: {
          id: `sim-${sim.id}`,
          source: sim.sourceDocId,
          target: sim.targetDocId,
          type: 'relates-to',
          weight: sim.score,
          implicit: true,
          score: sim.score,
        },
      })
    }
  }
}
```

### Step 6: Type-check + Test

```bash
pnpm type-check
pnpm -F @agentwiki/api test
```

## Todo List
- [x] Create `packages/api/src/services/similarity-service.ts`
- [x] Implement `computeSimilarities()` — Vectorize query + D1 cache
- [x] Implement `getCachedSimilarities()` — read from D1
- [x] Implement `querySimilarDocs()` — on-demand Vectorize query
- [x] Add `compute-similarities` job type to queue handler
- [x] Trigger similarity computation after embedding in `embedDocumentJob()`
- [x] Add `GET /api/graph/similar/:id` endpoint
- [x] Integrate implicit edge merging in graph-service.ts (Phase 2 file)
- [x] Type-check + test

## Success Criteria
- Similarity computed async after document embedding
- Top-5 neighbors cached in `document_similarities` with score > 0.7
- On-demand `/similar/:id` returns fresh Vectorize results
- `include_implicit=true` merges similarity edges into graph response
- No degradation of existing embedding pipeline performance

## Risk Assessment
- **Vectorize query by vector ID**: Need to verify Vectorize supports querying by existing vector ID (vs raw vector). If not, store embedding in metadata or re-embed.
- **Vector ID format**: Current format is `doc-{docId}-{chunkIndex}`. Must extract docId correctly from match results.
- **Score threshold**: 0.7 may be too high/low — monitor and adjust based on real data.
