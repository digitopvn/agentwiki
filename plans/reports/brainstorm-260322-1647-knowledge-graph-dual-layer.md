# Brainstorm Report: Dual-Layer Knowledge Graph
**Issue:** [#34 — KG friendly to both humans and AI agents](https://github.com/digitopvn/agentwiki/issues/34)
**Date:** 2026-03-22
**Branch:** claude/great-blackwell

---

## Problem Statement

Current KG is a simple wikilink graph (Obsidian-style):
- Edges are untyped ("links to" only) — AI agents can't reason about relationship semantics
- No implicit relationships — only explicit `[[wikilinks]]` are captured
- Full graph dump only — no traversal queries, path finding, or clustering
- No frontend visualization yet
- AI agents get the same flat data as humans via MCP `graph_get`

**Goal:** Build a KG that humans can visually explore AND AI agents can traverse, reason about, and auto-organize.

---

## Chosen Approach: Hybrid D1 + Vectorize Graph (Approach B)

Two-layer architecture:

### Layer 1: Explicit Graph (D1)
Typed wikilinks stored in `document_links` table with edge semantics.

### Layer 2: Implicit Graph (Vectorize)
Semantic similarity edges from document embeddings, cached in D1 for performance.

---

## Design

### 1. Edge Type System

**Fixed types (enum):**

| Type | Meaning | AI Use |
|------|---------|--------|
| `relates-to` | General relationship (default) | Weak signal, context discovery |
| `depends-on` | A requires B | Dependency analysis, impact assessment |
| `extends` | A builds upon B | Knowledge hierarchy, learning paths |
| `references` | A cites B | Source attribution, credibility chains |
| `contradicts` | A conflicts with B | Conflict detection, fact-checking |
| `implements` | A implements concept from B | Spec-to-code tracing |

**Inference flow:**
1. User creates `[[wikilink]]` in editor
2. `syncWikilinks()` extracts link + surrounding context (~200 chars)
3. Workers AI classifies edge type from context (async Queue job)
4. Default `relates-to` applied immediately; AI type applied when inference completes
5. User can override type via metadata panel or editor UI

**Schema change — `document_links`:**
```sql
ALTER TABLE document_links ADD COLUMN type TEXT NOT NULL DEFAULT 'relates-to';
ALTER TABLE document_links ADD COLUMN weight REAL DEFAULT 1.0;
ALTER TABLE document_links ADD COLUMN inferred INTEGER DEFAULT 0; -- 0=explicit, 1=ai-inferred, 2=user-confirmed
```

### 2. Implicit Similarity Layer

**Strategy: Hybrid cache + on-demand**

**Cached (background):**
- After document embedding (existing Queue job), compute top-5 nearest neighbors via Vectorize
- Store in new `document_similarities` table if score > 0.7
- Re-compute when document content changes
- Lightweight — piggybacks on existing embedding pipeline

**On-demand:**
- `GET /api/graph/similar/:id?limit=20` queries Vectorize in real-time
- Used for "discover more related docs" exploration
- Not cached (always fresh)

**New table — `document_similarities`:**
```sql
CREATE TABLE document_similarities (
  id TEXT PRIMARY KEY,
  source_doc_id TEXT NOT NULL REFERENCES documents(id),
  target_doc_id TEXT NOT NULL REFERENCES documents(id),
  score REAL NOT NULL,  -- cosine similarity 0-1
  computed_at INTEGER NOT NULL,
  UNIQUE(source_doc_id, target_doc_id)
);
CREATE INDEX idx_similarities_source ON document_similarities(source_doc_id);
CREATE INDEX idx_similarities_score ON document_similarities(score DESC);
```

### 3. Graph API Design

**Enhanced existing endpoints:**

| Endpoint | Purpose | Changes |
|----------|---------|---------|
| `GET /api/graph` | Full graph | Add edge types, optional `include_implicit=true` to merge similarity edges |
| `GET /api/documents/:id/links` | Doc links | Add edge types + backlinks with types |

**New traversal endpoints:**

| Endpoint | Purpose | Params |
|----------|---------|--------|
| `GET /api/graph/neighbors/:id` | 1-hop neighbors | `depth=1-3`, `types=depends-on,extends`, `include_implicit` |
| `GET /api/graph/subgraph/:id` | Ego network | `depth=1-3`, `max_nodes=50` |
| `GET /api/graph/path/:from/:to` | Shortest path | BFS in app layer, max 5 hops |
| `GET /api/graph/clusters` | Topic clusters | K-means on Vectorize embeddings, cached |
| `GET /api/graph/similar/:id` | Similar docs | On-demand Vectorize query, `limit`, `min_score` |
| `GET /api/graph/suggest-links/:id` | AI link suggestions | Combine implicit edges + AI analysis |
| `GET /api/graph/stats` | Graph analytics | Node/edge counts, density, top connected docs |

**Response format (enhanced Cytoscape):**
```typescript
interface GraphResponse {
  nodes: Array<{
    data: {
      id: string;
      label: string;
      category: string;
      tags: string[];
      summary?: string;
      // New: graph metrics
      degree: number; // connection count
      pageRank?: number; // importance score
    };
  }>;
  edges: Array<{
    data: {
      id: string;
      source: string;
      target: string;
      type: EdgeType; // NEW
      weight: number; // NEW
      implicit: boolean; // NEW: true if from Vectorize
      context?: string;
      score?: number; // similarity score for implicit edges
    };
  }>;
  stats: {
    nodeCount: number;
    edgeCount: number;
    explicitEdges: number;
    implicitEdges: number;
    clusters?: Array<{ id: string; label: string; docIds: string[] }>;
  };
}
```

### 4. MCP Tools for AI Agents

**Enhanced:**
- `graph_get` — add `edge_types` filter, `include_implicit` flag, `depth` for subgraph

**New tools:**

| Tool | Purpose | Params |
|------|---------|--------|
| `graph_traverse` | Multi-hop traversal from a doc | `startDocId`, `depth`, `edgeTypes`, `direction` |
| `graph_find_path` | Shortest path between 2 docs | `fromDocId`, `toDocId`, `maxHops` |
| `graph_clusters` | Get topic clusters | `minClusterSize` |
| `graph_suggest_links` | AI suggests missing links for a doc | `docId`, `limit` |
| `graph_explain_connection` | Explain why 2 docs are related | `docId1`, `docId2` |

**Example agent workflow:**
```
Agent: graph_traverse(startDocId="auth-guide", depth=2, edgeTypes=["depends-on"])
→ Returns: auth-guide → jwt-tokens → session-management → user-model
→ Agent understands dependency chain for auth system
```

### 5. Frontend: Cytoscape.js + AI Panel

**Graph Visualization:**
- Cytoscape.js with `cose-bilkent` layout (force-directed, good for clusters)
- Edge types → different colors + line styles:
  - `relates-to`: gray solid
  - `depends-on`: blue arrow
  - `extends`: green arrow
  - `references`: gray dashed
  - `contradicts`: red dashed
  - `implements`: purple arrow
  - Implicit (similarity): dotted gray, opacity by score
- Node size → degree (more connections = larger)
- Click node → navigate to document
- Hover → preview tooltip (title + summary + tags)
- Filter bar: edge types, categories, tags, min-similarity
- Zoom/pan/fit controls

**AI Insight Panel (sidebar):**
- "Why connected?" — explains relationship between 2 selected nodes
- "Cluster analysis" — labels for auto-detected topic clusters
- "Suggested links" — AI recommends missing connections
- "Impact analysis" — "if you change doc X, these docs are affected"
- "Knowledge gaps" — isolated nodes or weak clusters

### 6. AI Auto-Organization

**Background jobs (Queue):**
1. **Type inference**: classify edge types for untyped links
2. **Similarity computation**: update cached top-5 neighbors
3. **Link suggestions**: periodically scan for missing links
4. **Cluster detection**: re-compute topic clusters daily

**User-triggered:**
- "Auto-organize" button in graph view
- Runs AI analysis and suggests: new links, type corrections, orphan docs

### 7. Wikilink Syntax Enhancement

Current: `[[target]]` or `[[display|target]]`

Enhanced: `[[target|type:depends-on]]` or `[[display|target|type:extends]]`

- Optional type suffix in wikilink syntax
- If omitted, AI infers type
- Extractor updated to parse new format
- Backward compatible (existing links stay `relates-to`)

---

## Migration Strategy

**Phase 1: Schema + Edge Types (Week 1)**
- Add `type`, `weight`, `inferred` columns to `document_links`
- Add `document_similarities` table
- Update `syncWikilinks()` to parse enhanced syntax
- Migrate existing links as `relates-to`
- Background job: AI classify existing links

**Phase 2: Graph API (Week 1-2)**
- Implement traversal endpoints
- Enhance `graph_get` with types + implicit edges
- Add similarity caching to embedding pipeline
- Implement path finding (BFS in app layer)

**Phase 3: MCP Tools (Week 2)**
- Add new MCP graph tools
- Enhance existing `graph_get` tool
- Test with Claude Desktop

**Phase 4: Frontend (Week 2-3)**
- Cytoscape.js graph component
- Edge type styling
- Filter controls
- AI insight panel

**Phase 5: Auto-Organization (Week 3-4)**
- Background inference jobs
- Link suggestion engine
- Cluster detection
- "Auto-organize" UI

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| AI type inference inaccurate | Medium | Default to `relates-to`, user override, confidence threshold |
| Implicit edges too noisy | Medium | Score threshold (>0.7), user can hide implicit layer |
| D1 performance with traversals | Low | Medium scale OK, cache hot queries in KV |
| Vectorize latency for on-demand | Low | Cache top-N, on-demand only for exploration |
| Wikilink syntax confusion | Low | New syntax optional, backward compatible |

---

## Success Metrics

- AI agents can traverse typed graph and answer relationship queries
- Graph visualization renders <1s for 1K docs
- Edge type inference accuracy >80%
- Implicit edges surface genuinely related docs (user feedback)
- MCP tools enable multi-hop reasoning workflows

---

## Tech Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Graph storage | D1 (existing) | Medium scale, no new infra |
| Edge types | Fixed enum (6 types) | Predictable for AI, extensible later |
| Type inference | AI auto + user override | Zero friction writing, accuracy via override |
| Implicit edges | Hybrid cache + on-demand | Speed for common, fresh for exploration |
| Frontend | Cytoscape.js + cose-bilkent | Mature library, good perf, Cloudflare compatible |
| Graph queries | REST traversal endpoints | Fits Hono stack, no GraphQL complexity |
| Clustering | K-means on Vectorize embeddings | Leverages existing infra |

---

## Dependencies

- Cloudflare Workers AI (edge type inference)
- Cloudflare Vectorize (similarity computation — already deployed)
- Cloudflare Queues (background jobs — already deployed)
- Cytoscape.js (frontend — new dependency)

## Next Steps

1. Create detailed implementation plan with phases
2. Generate DB migration for schema changes
3. Start with Phase 1 (schema + edge types) as foundation
