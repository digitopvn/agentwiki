---
phase: 4
title: "MCP Tools Enhancement"
status: completed
priority: P1
effort: 10h
dependencies: [phase-02, phase-03]
---

# Phase 4: MCP Tools Enhancement

Enhance `graph_get` and add 5 new MCP tools for AI agent graph traversal.

## Context Links
- [plan.md](plan.md) | [Phase 2](phase-02-graph-traversal-api.md) | [Phase 3](phase-03-implicit-similarity-layer.md)
- MCP tools: `packages/mcp/src/tools/search-and-graph-tools.ts`
- Graph service: `packages/api/src/services/graph-service.ts` (Phase 2)
- Similarity service: `packages/api/src/services/similarity-service.ts` (Phase 3)

## Overview

MCP tools reuse same service layer as REST API. Enhance existing `graph_get` with type filters, add `graph_traverse`, `graph_find_path`, `graph_clusters`, `graph_suggest_links`, `graph_explain_connection`.

## Requirements

### Functional
- `graph_get` — add `types`, `include_implicit`, `depth` params
- `graph_traverse` — multi-hop from a starting doc with edge type filter
- `graph_find_path` — shortest path between 2 docs
- `graph_clusters` — topic clusters via embedding proximity
- `graph_suggest_links` — combine implicit edges + low-connection docs
- `graph_explain_connection` — natural language explanation of how 2 docs relate

### Non-functional
- All tools must be tenant-scoped (existing auth pattern)
- Tool descriptions must be clear for AI agent auto-discovery
- Response format compact but informative (agents parse JSON)

## Related Code Files

### Modify
- `packages/mcp/src/tools/search-and-graph-tools.ts` — Enhance `graph_get`, add new tools

### May split into
- `packages/mcp/src/tools/graph-tools.ts` — if file exceeds 200 lines, extract graph tools

## Implementation Steps

### Step 1: Enhance graph_get

Update existing tool registration:

```typescript
server.registerTool('graph_get', {
  description: 'Get knowledge graph with typed edges. Supports filtering by edge type and including implicit similarity edges.',
  inputSchema: {
    category: z.string().optional().describe('Filter nodes by category'),
    tag: z.string().optional().describe('Filter nodes by tag'),
    types: z.array(z.enum(EDGE_TYPES)).optional().describe('Filter edges by type (e.g., ["depends-on", "extends"])'),
    include_implicit: z.boolean().default(false).describe('Include AI-inferred similarity edges (dotted lines)'),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  // Call getFullGraph() from graph-service
})
```

### Step 2: Add graph_traverse

```typescript
server.registerTool('graph_traverse', {
  description: 'Traverse the knowledge graph from a starting document. Returns all reachable docs within N hops, filtered by edge type. Use for dependency analysis, impact assessment, or discovering related knowledge.',
  inputSchema: {
    startDocId: z.string().describe('Document ID to start traversal from'),
    depth: z.number().int().min(1).max(3).default(2).describe('Max hops (1-3)'),
    edgeTypes: z.array(z.enum(EDGE_TYPES)).optional().describe('Only follow these edge types'),
    direction: z.enum(['outbound', 'inbound', 'both']).default('both').describe('Traversal direction'),
    include_implicit: z.boolean().default(false).describe('Include similarity edges'),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  // Call getNeighbors() from graph-service
})
```

### Step 3: Add graph_find_path

```typescript
server.registerTool('graph_find_path', {
  description: 'Find the shortest path between two documents in the knowledge graph. Returns the chain of documents connecting them. Useful for understanding how concepts relate.',
  inputSchema: {
    fromDocId: z.string().describe('Starting document ID'),
    toDocId: z.string().describe('Target document ID'),
    maxHops: z.number().int().min(1).max(10).default(5).describe('Max path length'),
    edgeTypes: z.array(z.enum(EDGE_TYPES)).optional().describe('Only follow these edge types'),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  // Call findPath() from graph-service
})
```

### Step 4: Add graph_clusters

```typescript
server.registerTool('graph_clusters', {
  description: 'Get topic clusters in the knowledge graph. Groups related documents by semantic similarity. Useful for understanding knowledge organization and finding gaps.',
  inputSchema: {
    minClusterSize: z.number().int().min(2).max(20).default(3).describe('Min docs per cluster'),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  // Use cached similarities to group docs by connectivity
  // Simple approach: connected components in similarity graph
})
```

### Step 5: Add graph_suggest_links

```typescript
server.registerTool('graph_suggest_links', {
  description: 'AI suggests missing links for a document. Finds semantically similar docs not yet explicitly linked. Useful for enriching the knowledge graph.',
  inputSchema: {
    docId: z.string().describe('Document ID to get suggestions for'),
    limit: z.number().int().min(1).max(20).default(5).describe('Max suggestions'),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  // Query similar docs, filter out already-linked ones
  // Return suggestions with similarity scores
})
```

### Step 6: Add graph_explain_connection

```typescript
server.registerTool('graph_explain_connection', {
  description: 'Explain why two documents are related. Shows the path between them and shared context. Useful for understanding knowledge relationships.',
  inputSchema: {
    docId1: z.string().describe('First document ID'),
    docId2: z.string().describe('Second document ID'),
  },
  annotations: { readOnlyHint: true },
}, async (args) => {
  // 1. Find direct link (if exists) → return edge type + context
  // 2. Find shortest path → return path with edge types
  // 3. Check similarity score → return if implicit connection
  // 4. No connection → return "not connected"
})
```

### Step 7: Modularize if Needed

If `search-and-graph-tools.ts` exceeds 200 lines, split:
- `search-and-graph-tools.ts` → keep search + graph_get
- `graph-traversal-tools.ts` (new) → traverse, find_path, clusters, suggest, explain

### Step 8: Type-check + Test

```bash
pnpm type-check
pnpm -F @agentwiki/mcp test
```

Test with Claude Desktop / MCP inspector.

## Todo List
- [x] Enhance `graph_get` with `types` and `include_implicit` params
- [x] Add `graph_traverse` tool
- [x] Add `graph_find_path` tool
- [x] Add `graph_clusters` tool
- [x] Add `graph_suggest_links` tool
- [x] Add `graph_explain_connection` tool
- [x] Modularize into separate file if >200 lines
- [x] Type-check + manual test with MCP inspector

## Success Criteria
- All 6 tools (1 enhanced + 5 new) registered and functional
- Tools correctly reuse graph-service and similarity-service
- Tenant isolation maintained (no cross-tenant data leak)
- AI agents can perform multi-hop reasoning via MCP tools
- Tool descriptions enable auto-discovery by AI agents

## Risk Assessment
- **Service import paths**: MCP package imports from `../../../api/src/services/` — verify paths work after new service files
- **Vectorize binding**: MCP worker needs same Vectorize binding as API worker — verify in wrangler.toml
