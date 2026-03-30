---
title: "Dual-Layer Knowledge Graph"
description: "Typed explicit edges (D1) + implicit similarity edges (Vectorize) — graph traversal API, MCP tools, Cytoscape.js frontend with AI insights"
status: completed
priority: P1
effort: 80h
issue: 34
branch: claude/great-blackwell
tags: [knowledge-graph, vectorize, cytoscape, mcp, ai, d1]
created: 2026-03-22
completed: 2026-03-22
brainstorm: plans/reports/brainstorm-260322-1647-knowledge-graph-dual-layer.md
blockedBy: []
blocks: []
relatedPlans: [260319-1428-enhanced-search-system, 260319-2057-mcp-server-implementation]
---

# Dual-Layer Knowledge Graph — Implementation Plan

Issue [#34](https://github.com/digitopvn/agentwiki/issues/34): KG friendly to both humans and AI agents.

## Architecture

Two-layer graph:
- **Layer 1 (Explicit)**: Typed wikilinks in D1 `document_links` table — 6 edge types, AI auto-inference
- **Layer 2 (Implicit)**: Vectorize similarity edges, cached top-5 per doc in `document_similarities`

## Phase Overview

| # | Phase | File | Effort | Status | Dependencies |
|---|-------|------|--------|--------|-------------|
| 1 | Schema + Edge Types | [phase-01](phase-01-schema-edge-types.md) | 12h | completed | — |
| 2 | Graph Traversal API | [phase-02](phase-02-graph-traversal-api.md) | 16h | completed | Phase 1 |
| 3 | Implicit Similarity Layer | [phase-03](phase-03-implicit-similarity-layer.md) | 14h | completed | Phase 1 |
| 4 | MCP Tools Enhancement | [phase-04](phase-04-mcp-tools.md) | 10h | completed | Phase 2, 3 |
| 5 | Frontend Graph Visualization | [phase-05](phase-05-frontend-visualization.md) | 20h | completed | Phase 2, 3 |
| 6 | AI Auto-Organization | [phase-06](phase-06-ai-auto-organization.md) | 8h | completed | Phase 2, 3, 4 |

**Total: ~80h across 6 phases.**

Phases 2 & 3 can run in parallel after Phase 1.
Phases 4, 5, 6 can start once 2 & 3 are done.

## Key Files Modified

| Package | Files | Changes |
|---------|-------|---------|
| `shared` | `types/graph.ts` (new) | Edge types, graph response interfaces |
| `api` | `db/schema.ts` | Add columns to `document_links`, new `document_similarities` table |
| `api` | `db/migrations/0005_*` | Migration SQL |
| `api` | `utils/wikilink-extractor.ts` | Parse enhanced `[[target\|type:X]]` syntax |
| `api` | `services/document-service.ts` | Update `syncWikilinks()` for typed edges |
| `api` | `services/graph-service.ts` (new) | Traversal, path finding, clustering, similarity |
| `api` | `routes/graph.ts` | Enhance existing + add traversal endpoints |
| `api` | `queue/handler.ts` | Add similarity computation + type inference jobs |
| `mcp` | `tools/search-and-graph-tools.ts` | Enhance `graph_get`, add 5 new tools |
| `web` | `components/graph/` (new) | Cytoscape.js visualization + AI panel |

## Success Criteria

- [x] Edge types stored and queryable for all wikilinks
- [x] AI auto-classifies edge types with >80% accuracy
- [x] Traversal API returns neighbors, subgraph, shortest path
- [x] Implicit similarity edges discoverable via API
- [x] MCP tools enable multi-hop reasoning for AI agents
- [x] Frontend renders interactive graph with <1s for 1K docs
- [x] AI insight panel shows clusters, suggested links, impact analysis
