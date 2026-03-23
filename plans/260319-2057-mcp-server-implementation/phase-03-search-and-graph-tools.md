---
phase: 3
title: Search + Graph Tools
priority: high
status: completed
effort: small
blockedBy: [phase-01]
---

# Phase 3: Search + Graph Tools (2 tools)

## Context Links

- [Search Service](../../packages/api/src/services/search-service.ts)
- [Embedding Service](../../packages/api/src/services/embedding-service.ts)
- [Graph Route](../../packages/api/src/routes/graph.ts)
- [RRF Util](../../packages/api/src/utils/rrf.ts)

## Overview

Implement hybrid search (keyword + semantic + RRF fusion) and knowledge graph tools. These are the most valuable MCP tools for AI agents.

## Key Insights

- Search uses Vectorize for semantic + D1 LIKE for keyword + RRF fusion
- `agent` role has `doc:search` permission — search is always available to API keys
- Graph returns nodes (documents) + edges (wikilinks) — great for AI context building
- Search rate limit: 50 req/min (separate from API 100 req/min)

## Related Code Files

### Files to create
- `packages/mcp/src/tools/search-and-graph-tools.ts`

### Files to import
- `packages/api/src/services/search-service.ts` — `searchDocuments()`
- `packages/api/src/routes/graph.ts` — Graph query logic (may need to extract to service)

## Implementation Steps

### 1. `search` tool

```typescript
{
  name: "search",
  description: "Search documents using keyword, semantic, or hybrid search. Returns ranked results with snippets.",
  inputSchema: z.object({
    query: z.string().min(1).max(500).describe("Search query"),
    type: z.enum(["hybrid", "keyword", "semantic"]).default("hybrid").describe("Search type"),
    limit: z.number().int().min(1).max(50).default(10).describe("Max results"),
    category: z.string().optional().describe("Filter by category"),
  }),
  annotations: { readOnly: true },
  handler: async (input) => {
    // Apply search rate limit (50/min)
    // Call searchDocuments(env, { tenantId, query, type, limit, category })
    // Format results as numbered list with title, snippet, score
  }
}
```

### 2. `graph_get` tool

```typescript
{
  name: "graph_get",
  description: "Get knowledge graph showing document relationships via wikilinks. Returns nodes (documents) and edges (links) for visualization.",
  inputSchema: z.object({
    category: z.string().optional().describe("Filter by category"),
    tag: z.string().optional().describe("Filter by tag"),
  }),
  annotations: { readOnly: true },
  handler: async (input) => {
    // Query documents + document_links
    // Build nodes: [{ id, label, category, tags }]
    // Build edges: [{ source, target, context }]
    // Return { nodes, edges, stats: { nodeCount, edgeCount } }
  }
}
```

**Note:** Graph logic is currently in route file, may need to extract `getGraph()` to a service function or implement inline.

## Todo List

- [ ] Create `packages/mcp/src/tools/search-and-graph-tools.ts`
- [ ] Implement `search` tool with all 3 search types
- [ ] Implement `graph_get` tool
- [ ] Apply search-specific rate limit (50/min)
- [ ] Register tools in `server.ts`

## Success Criteria

- `search` returns relevant results for all 3 types (keyword, semantic, hybrid)
- Semantic search uses Vectorize embeddings
- `graph_get` returns nodes + edges for knowledge graph
- Search rate limit enforced separately (50/min)
- Agent role can use both tools (`doc:read`, `doc:search`)

## Next Steps

→ Phase 4: Organization Tools
