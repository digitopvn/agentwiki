---
phase: 6
title: "AI Auto-Organization"
status: completed
priority: P2
effort: 8h
dependencies: [phase-02, phase-03, phase-04]
---

# Phase 6: AI Auto-Organization

Background AI jobs for edge type inference, cluster detection, and link suggestions.

## Context Links
- [plan.md](plan.md) | [Phase 2](phase-02-graph-traversal-api.md) | [Phase 4](phase-04-mcp-tools.md)
- Queue handler: `packages/api/src/queue/handler.ts`
- AI service: `packages/api/src/ai/ai-service.ts`

## Overview

Add Queue jobs that use Workers AI to: (1) infer edge types for untyped links, (2) suggest missing links, (3) detect topic clusters. These run async and enrich the graph over time.

## Requirements

### Functional
- `infer-edge-type` job: classify edge type from link context using Workers AI
- `suggest-links` endpoint: find semantically similar docs without explicit links
- Cluster detection: group docs by similarity graph connectivity
- Batch inference: process all untyped links on demand

### Non-functional
- All AI calls async via Queue — no user-facing latency
- Graceful fallback: if AI inference fails, keep `relates-to` default
- Rate-limited: max 10 inference calls per batch to avoid Workers AI quota

## Related Code Files

### Create
- `packages/api/src/services/graph-ai-service.ts` — AI inference for edge types, link suggestions

### Modify
- `packages/api/src/queue/handler.ts` — Add `infer-edge-type` job type
- `packages/api/src/routes/graph.ts` — Add `POST /api/graph/suggest-links/:id`

## Implementation Steps

### Step 1: Edge Type Inference Service

`packages/api/src/services/graph-ai-service.ts`:

```typescript
import type { EdgeType } from '@agentwiki/shared'
import type { Env } from '../env'

const TYPE_INFERENCE_PROMPT = `Classify the relationship between two documents based on the surrounding context.
Choose exactly one type:
- relates-to: general relationship
- depends-on: source requires/needs target
- extends: source builds upon target
- references: source cites/mentions target
- contradicts: source conflicts with target
- implements: source implements concept from target

Context: "{context}"
Source doc: "{sourceTitle}"
Target doc: "{targetTitle}"

Return only the type name, nothing else.`

export async function inferEdgeType(
  env: Env,
  context: string,
  sourceTitle: string,
  targetTitle: string,
): Promise<EdgeType> {
  try {
    const prompt = TYPE_INFERENCE_PROMPT
      .replace('{context}', context.slice(0, 200))
      .replace('{sourceTitle}', sourceTitle)
      .replace('{targetTitle}', targetTitle)

    const result = await (env.AI as Ai).run('@cf/meta/llama-3.1-8b-instruct' as never, {
      messages: [
        { role: 'system', content: 'You are a document relationship classifier. Return only the relationship type.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 20,
    } as never) as { response: string }

    const type = result.response?.trim().toLowerCase() as EdgeType
    const VALID: EdgeType[] = ['relates-to', 'depends-on', 'extends', 'references', 'contradicts', 'implements']
    return VALID.includes(type) ? type : 'relates-to'
  } catch {
    return 'relates-to' // fallback
  }
}
```

### Step 2: Queue Job for Batch Inference

In `packages/api/src/queue/handler.ts`:

```typescript
case 'infer-edge-type':
  if (msg.documentId) await inferEdgeTypesForDoc(env, msg.documentId, msg.tenantId)
  break

case 'batch-infer-edge-types':
  await batchInferEdgeTypes(env, msg.tenantId)
  break
```

```typescript
async function inferEdgeTypesForDoc(env: Env, docId: string, tenantId: string) {
  const db = drizzle(env.DB)
  // Get untyped links (type='relates-to' AND inferred=0) from this doc
  const links = await db.select({
    id: documentLinks.id,
    context: documentLinks.context,
    targetId: documentLinks.targetDocId,
  }).from(documentLinks).where(and(
    eq(documentLinks.sourceDocId, docId),
    eq(documentLinks.type, 'relates-to'),
    eq(documentLinks.inferred, 0),
  ))

  if (!links.length) return

  // Get source doc title
  const source = await db.select({ title: documents.title })
    .from(documents).where(eq(documents.id, docId)).limit(1)
  if (!source.length) return

  // Infer each link (max 10 per batch)
  for (const link of links.slice(0, 10)) {
    const target = await db.select({ title: documents.title })
      .from(documents).where(eq(documents.id, link.targetId)).limit(1)
    if (!target.length) continue

    const type = await inferEdgeType(env, link.context ?? '', source[0].title, target[0].title)
    if (type !== 'relates-to') {
      await db.update(documentLinks)
        .set({ type, inferred: 1 })
        .where(eq(documentLinks.id, link.id))
    }
  }
}
```

### Step 3: Trigger Inference After Wikilink Sync

In `syncWikilinks()` (document-service.ts), after inserting new links, enqueue inference:

```typescript
// After all links inserted:
await env.QUEUE.send({ type: 'infer-edge-type', documentId: docId, tenantId })
```

### Step 4: Link Suggestion Endpoint

`POST /api/graph/suggest-links/:id`:

```typescript
graphRouter.get('/suggest-links/:id', requirePermission('doc:read'), async (c) => {
  const docId = c.req.param('id')
  const limit = Math.min(Number(c.req.query('limit') ?? 5), 20)
  const { tenantId } = c.get('auth')

  // Get similar docs from Vectorize
  const similar = await querySimilarDocs(c.env, docId, tenantId, limit + 10, 0.6)

  // Get existing explicit links
  const existing = await db.select({ targetId: documentLinks.targetDocId })
    .from(documentLinks).where(eq(documentLinks.sourceDocId, docId))
  const linkedIds = new Set(existing.map(e => e.targetId))

  // Filter out already-linked docs
  const suggestions = similar.filter(s => !linkedIds.has(s.id)).slice(0, limit)

  return c.json({ suggestions, documentId: docId })
})
```

### Step 5: Type-check + Test

```bash
pnpm type-check
pnpm -F @agentwiki/api test
```

## Todo List
- [x] Create `packages/api/src/services/graph-ai-service.ts`
- [x] Implement `inferEdgeType()` using Workers AI
- [x] Add `infer-edge-type` and `batch-infer-edge-types` queue jobs
- [x] Implement `inferEdgeTypesForDoc()` batch inference
- [x] Trigger inference after `syncWikilinks()` creates new links
- [x] Add `GET /api/graph/suggest-links/:id` endpoint
- [x] Type-check + test

## Success Criteria
- AI correctly classifies >80% of edge types (manual spot-check)
- Inference runs async — no user-facing latency impact
- Failed inference gracefully falls back to `relates-to`
- Link suggestions return relevant non-linked docs
- Max 10 AI calls per batch to stay within quota

## Risk Assessment
- **Workers AI latency**: Each inference call ~200-500ms. Batch of 10 = 2-5s total. Acceptable for async queue.
- **Accuracy**: Llama 3.1 8B may not be accurate enough. Monitor and consider upgrading to tenant's configured provider for better results.
- **Cost**: Workers AI has free tier limits. For heavy usage, may need to throttle or use tenant's own provider.
