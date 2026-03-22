---
phase: 2
title: "Graph Traversal API"
status: completed
priority: P1
effort: 16h
dependencies: [phase-01]
---

# Phase 2: Graph Traversal API

New REST endpoints for graph traversal, path finding, and analytics. Runs parallel with Phase 3.

## Context Links
- [plan.md](plan.md) | [Phase 1](phase-01-schema-edge-types.md)
- Existing route: `packages/api/src/routes/graph.ts`
- Document service: `packages/api/src/services/document-service.ts`

## Overview

Create `graph-service.ts` with traversal algorithms (BFS neighbors, shortest path, subgraph extraction, stats). Enhance existing `/api/graph` to include edge types. Add 5 new endpoints.

## Requirements

### Functional
- `GET /api/graph` — enhanced with `types` filter + `include_implicit` param
- `GET /api/graph/neighbors/:id` — 1-N hop neighbors with edge type filter
- `GET /api/graph/subgraph/:id` — ego network (bounded BFS)
- `GET /api/graph/path/:from/:to` — shortest path via BFS (max 5 hops)
- `GET /api/graph/stats` — graph analytics (density, top connected, orphans)
- All endpoints return enhanced `GraphResponse` format from shared types

### Non-functional
- <200ms response for graphs with 1K docs
- Subgraph capped at `max_nodes=50` default to prevent payload explosion
- Path finding capped at 5 hops to prevent runaway BFS

## Architecture

```
routes/graph.ts (thin HTTP layer)
  → graph-service.ts (business logic)
    → D1 queries for explicit edges
    → Optional: document_similarities for implicit edges
    → BFS/DFS algorithms in app layer (no recursive CTEs)
```

## Related Code Files

### Modify
- `packages/api/src/routes/graph.ts` — Enhance existing endpoint, add new routes

### Create
- `packages/api/src/services/graph-service.ts` — Traversal algorithms, graph queries

## Implementation Steps

### Step 1: Create graph-service.ts

`packages/api/src/services/graph-service.ts`:

Key functions:
```typescript
/** Get full graph with typed edges */
export async function getFullGraph(env: Env, tenantId: string, opts: {
  category?: string
  tag?: string
  types?: EdgeType[]
  includeImplicit?: boolean
}): Promise<GraphResponse>

/** Get N-hop neighbors from a document */
export async function getNeighbors(env: Env, tenantId: string, docId: string, opts: {
  depth?: number      // 1-3, default 1
  types?: EdgeType[]  // filter edge types
  direction?: 'outbound' | 'inbound' | 'both' // default 'both'
  includeImplicit?: boolean
}): Promise<GraphResponse>

/** Get ego network (subgraph centered on a doc) */
export async function getSubgraph(env: Env, tenantId: string, docId: string, opts: {
  depth?: number     // 1-3, default 2
  maxNodes?: number  // default 50
}): Promise<GraphResponse>

/** Find shortest path between two docs via BFS */
export async function findPath(env: Env, tenantId: string, fromId: string, toId: string, opts: {
  maxHops?: number   // default 5
  types?: EdgeType[] // optional edge type filter
}): Promise<{ path: string[]; edges: GraphEdge[]; hops: number } | null>

/** Graph statistics */
export async function getGraphStats(env: Env, tenantId: string): Promise<{
  nodeCount: number
  edgeCount: number
  avgDegree: number
  density: number
  topConnected: Array<{ id: string; title: string; degree: number }>
  orphanCount: number
  edgeTypeDistribution: Record<EdgeType, number>
}>
```

### Step 2: BFS Algorithm (in-memory)

For medium scale (500-5K docs), load adjacency list into memory and run BFS:

```typescript
/** Build adjacency list from D1 links */
function buildAdjacencyList(
  links: Array<{ sourceDocId: string; targetDocId: string; type: string }>,
  direction: 'outbound' | 'inbound' | 'both',
): Map<string, Set<string>>

/** BFS traversal — returns visited nodes up to depth */
function bfsTraverse(
  adj: Map<string, Set<string>>,
  startId: string,
  maxDepth: number,
  maxNodes: number,
): Set<string>

/** BFS shortest path */
function bfsShortestPath(
  adj: Map<string, Set<string>>,
  fromId: string,
  toId: string,
  maxHops: number,
): string[] | null
```

**Performance note**: For 5K docs with ~20K edges, adjacency list fits in ~2MB. BFS is O(V+E) — well within Workers 128MB memory + 30s CPU.

### Step 3: Enhance Existing /api/graph

Update `routes/graph.ts`:

```typescript
graphRouter.get('/', requirePermission('doc:read'), async (c) => {
  const { tenantId } = c.get('auth')
  const category = c.req.query('category')
  const tag = c.req.query('tag')
  const types = c.req.query('types')?.split(',') as EdgeType[] | undefined
  const includeImplicit = c.req.query('include_implicit') === 'true'

  const result = await getFullGraph(c.env, tenantId, {
    category, tag, types, includeImplicit,
  })
  return c.json(result)
})
```

### Step 4: Add New Endpoints

```typescript
/** Neighbors (1-N hop) */
graphRouter.get('/neighbors/:id', requirePermission('doc:read'), async (c) => {
  const docId = c.req.param('id')
  const depth = Math.min(Number(c.req.query('depth') ?? 1), 3)
  const types = c.req.query('types')?.split(',') as EdgeType[] | undefined
  const direction = (c.req.query('direction') ?? 'both') as 'outbound' | 'inbound' | 'both'
  const includeImplicit = c.req.query('include_implicit') === 'true'

  const result = await getNeighbors(c.env, c.get('auth').tenantId, docId, {
    depth, types, direction, includeImplicit,
  })
  return c.json(result)
})

/** Subgraph (ego network) */
graphRouter.get('/subgraph/:id', requirePermission('doc:read'), async (c) => {
  const docId = c.req.param('id')
  const depth = Math.min(Number(c.req.query('depth') ?? 2), 3)
  const maxNodes = Math.min(Number(c.req.query('max_nodes') ?? 50), 200)

  const result = await getSubgraph(c.env, c.get('auth').tenantId, docId, { depth, maxNodes })
  return c.json(result)
})

/** Shortest path */
graphRouter.get('/path/:from/:to', requirePermission('doc:read'), async (c) => {
  const fromId = c.req.param('from')
  const toId = c.req.param('to')
  const maxHops = Math.min(Number(c.req.query('max_hops') ?? 5), 10)
  const types = c.req.query('types')?.split(',') as EdgeType[] | undefined

  const result = await findPath(c.env, c.get('auth').tenantId, fromId, toId, { maxHops, types })
  if (!result) return c.json({ error: 'No path found' }, 404)
  return c.json(result)
})

/** Graph stats */
graphRouter.get('/stats', requirePermission('doc:read'), async (c) => {
  const stats = await getGraphStats(c.env, c.get('auth').tenantId)
  return c.json(stats)
})
```

### Step 5: Type-check + Test

```bash
pnpm type-check
pnpm -F @agentwiki/api test
```

Write unit tests for BFS algorithms (pure functions, no DB dependency).

## Todo List
- [x] Create `packages/api/src/services/graph-service.ts`
- [x] Implement `getFullGraph()` with typed edges
- [x] Implement `buildAdjacencyList()` + `bfsTraverse()` + `bfsShortestPath()`
- [x] Implement `getNeighbors()`, `getSubgraph()`, `findPath()`, `getGraphStats()`
- [x] Enhance existing `GET /api/graph` with types filter + include_implicit
- [x] Add `GET /api/graph/neighbors/:id` endpoint
- [x] Add `GET /api/graph/subgraph/:id` endpoint
- [x] Add `GET /api/graph/path/:from/:to` endpoint
- [x] Add `GET /api/graph/stats` endpoint
- [x] Write unit tests for BFS algorithms
- [x] Type-check + integration test

## Success Criteria
- All 5 endpoints return correct data
- BFS completes in <100ms for 5K docs
- `types` filter correctly narrows edge results
- Path finding returns shortest path or 404
- Stats endpoint returns accurate metrics
- Existing graph endpoint backward compatible (no breaking changes)

## Risk Assessment
- **Memory pressure**: 5K docs adjacency list ~2MB — well within Workers limit
- **BFS runaway**: maxDepth=3 + maxNodes=200 caps prevent explosion
- **Concurrent queries**: Stateless Workers — no shared state concerns
