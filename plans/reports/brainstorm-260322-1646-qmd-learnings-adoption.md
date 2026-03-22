# QMD Learnings Adoption: What AgentWiki Should & Should NOT Learn

**Date:** 2026-03-22
**Issue:** [#38](https://github.com/digitopvn/agentwiki/issues/38)
**Source:** [tobi/qmd](https://github.com/tobi/qmd) — Local-first hybrid search engine (16.5k stars)
**Detailed Research:** [researcher-260322-1646-qmd-repo-analysis.md](./researcher-260322-1646-qmd-repo-analysis.md)

---

## Executive Summary

QMD is a sophisticated local-first hybrid search engine combining BM25, vector search, and LLM reranking — all running on-device. AgentWiki is a cloud-native knowledge platform on Cloudflare. Despite fundamentally different deployment models, QMD offers several algorithmic and architectural patterns worth adopting. This report identifies **7 items to adopt** and **5 items to NOT adopt**, with priority and effort estimates.

---

## Current State Comparison

| Aspect | AgentWiki | QMD |
|--------|-----------|-----|
| **Deployment** | Cloudflare Workers (serverless) | Local machine (Node.js/Bun) |
| **Keyword Search** | Trigram fuzzy (custom) | BM25 via FTS5 |
| **Semantic Search** | Workers AI + Vectorize | node-llama-cpp + sqlite-vec |
| **Fusion** | RRF (k=60, fixed weights) | RRF + position-aware blending |
| **Query Expansion** | None | LLM-based (fine-tuned 1.7B model) |
| **Reranking** | None | LLM reranker (Qwen3-0.6B) |
| **Context System** | Folders + tags | Hierarchical path-prefix metadata |
| **Chunking** | ~2000 chars, 600 overlap | ~900 tokens, 15% overlap, markdown-aware |
| **Caching** | KV (suggestions only) | SQLite (LLM response cache) |
| **Output Formats** | JSON only | JSON, CSV, Markdown, XML |
| **MCP Integration** | 25 tools, 6 resources | Search-focused tools |

---

## SHOULD Adopt (7 Items)

### 1. Position-Aware RRF Blending
**Priority:** HIGH | **Effort:** LOW (1-2 hours) | **Impact:** Moderate search quality improvement

**What QMD does:** Instead of treating all ranks equally in RRF, dynamically adjusts weight between keyword and semantic signals based on rank position:
- Top 3 results: 75% keyword / 25% semantic (trust exact matches)
- Rank 4-10: 60% / 40%
- Rank 11+: 40% / 60% (trust semantic understanding more)

**Why adopt:** AgentWiki's current RRF treats all positions equally. Position-aware blending is a zero-cost improvement — same inputs, better output ordering. No new infrastructure needed.

**How to implement:**
- Modify `packages/api/src/utils/rrf.ts` (44 LOC)
- Add rank-position weight multiplier after standard RRF scoring
- Add top-rank bonus (+0.05 for #1, +0.02 for #2-3) from keyword results

**Risk:** Low. Easy to A/B test; revert = remove multiplier.

---

### 2. Query Expansion via Existing AI Providers
**Priority:** HIGH | **Effort:** MEDIUM (4-6 hours) | **Impact:** Significant search quality improvement

**What QMD does:** Fine-tuned 1.7B model generates keyword synonyms + semantic rephrasing before search executes.

**What AgentWiki should do:** Use existing AI providers (OpenAI/Anthropic/Gemini already configured per-tenant) to expand queries instead of training custom models:

```
User query: "rate limiting"
→ Expanded: ["rate limiting", "throttling", "request quota", "API rate control"]
```

**How to implement:**
- New `query-expansion-service.ts` in search services
- Prompt existing AI provider with: "Generate 2-3 search synonyms for: {query}. Return JSON array."
- Run expanded queries in parallel through existing keyword + semantic pipeline
- Weight original query 2x (same as QMD)
- Cache expansions in KV (same query = same expansions, 1-hour TTL)
- Optional: disable for exact-match queries (quoted phrases)

**Why NOT copy QMD's approach:** Local LLM inference impossible on Cloudflare Workers. Using existing tenant-configured AI providers avoids new infrastructure.

**Risk:** Medium. Adds latency (~200-500ms for AI call). Mitigate with KV caching + optional toggle.

---

### 3. Hierarchical Context System for Documents
**Priority:** HIGH | **Effort:** MEDIUM (6-8 hours) | **Impact:** Major AI agent experience improvement

**What QMD does:** Attaches hierarchical path-prefix metadata ("context") to documents. When searching "rate limiting," context tells AI whether it's API design, microservices, or database related.

**What AgentWiki should do:** Leverage existing folder hierarchy as implicit context:
- Each folder can have an optional `description` field
- Search results include folder path + descriptions as context
- MCP responses enriched with folder context for AI agent consumption

**How to implement:**
- Add `description TEXT` column to `folders` table (migration)
- Folder CRUD API accepts/returns description
- Search results include `context: "Engineering > API Design > Rate Limiting Policies"`
- MCP search tool returns `context` field alongside each result
- UI: Add description field to folder create/edit dialog

**Why this matters:** QMD explicitly calls context "the key feature" for LLM integration. AI agents make dramatically better decisions when results include organizational context.

**Risk:** Low. Additive change. Null description = no change in behavior.

---

### 4. Smarter Markdown Chunking
**Priority:** MEDIUM | **Effort:** LOW (2-3 hours) | **Impact:** Better embedding quality

**What QMD does:** Chunks at markdown structure boundaries (headings, code blocks, lists) instead of arbitrary character counts. Preserves heading hierarchy as chunk metadata.

**What AgentWiki currently does:** Fixed ~2000 char chunks with ~600 char overlap.

**What to improve:**
- Chunk at heading boundaries (h1-h3 as break points)
- Keep code blocks intact (never split mid-code-block)
- Reduce chunk size to ~1000 chars (~256 tokens) for more precise vector matches
- Reduce overlap to 15% (vs current 30%) — heading context replaces overlap need
- Include parent heading chain as chunk metadata (improves vector search relevance)

**How to implement:**
- Refactor `packages/api/src/utils/chunker.ts`
- Add heading-aware splitting logic
- Pass heading chain as Vectorize metadata

**Risk:** Low. Requires re-embedding existing documents (queue job). No API changes.

---

### 5. Search Result Caching in KV
**Priority:** MEDIUM | **Effort:** LOW (1-2 hours) | **Impact:** Performance improvement

**What QMD does:** Caches LLM responses in SQLite to avoid redundant inference.

**What AgentWiki should do:** Cache full search results in KV (not just suggestions):

```
Key: search:{tenantId}:{hash(query+type+source+filters)}
TTL: 5 minutes (short — documents change)
```

**Why:** Semantic search embedding costs ~200ms per query. Identical queries from same tenant within 5 min should return cached results. AgentWiki's system architecture doc mentions "search cache in KV (1-hour TTL)" but the explorer confirmed this is NOT implemented for search results.

**How to implement:**
- Add cache check/set in `searchDocuments()` in `search-service.ts`
- Hash query params for cache key
- Invalidate on document create/update/delete (already have queue events)
- Short TTL (5 min) as safety net

**Risk:** Low. Cache miss = normal path. Stale results mitigated by short TTL + explicit invalidation.

---

### 6. Search Explain Mode
**Priority:** LOW | **Effort:** LOW (2-3 hours) | **Impact:** Developer/debugging experience

**What QMD does:** `--explain` flag shows retrieval traces — which signals contributed to each result's ranking, keyword vs semantic scores, reranker scores.

**What AgentWiki should do:** Add `debug=true` query param to search API:

```json
{
  "results": [...],
  "debug": {
    "keyword_results": 12,
    "semantic_results": 8,
    "fused_results": 15,
    "timings": { "keyword_ms": 35, "semantic_ms": 210, "fusion_ms": 1 },
    "top_result_scores": { "keyword_rank": 1, "semantic_rank": 3, "rrf_score": 0.032 }
  }
}
```

**Why:** Essential for debugging search quality issues. QMD's `--explain` is cited by users as extremely useful.

**Risk:** None. Debug info only returned when explicitly requested. No production impact.

---

### 7. Content-Addressed Document Hashing
**Priority:** LOW | **Effort:** LOW (1-2 hours) | **Impact:** Embedding efficiency

**What QMD does:** SHA256 hash of document content. Only re-embeds when hash changes.

**What AgentWiki currently does:** Re-embeds on every document update (even whitespace changes).

**What to improve:**
- Hash document content before queueing embed job
- Store hash in documents table (`contentHash TEXT`)
- Skip re-embedding if hash unchanged
- Saves Workers AI calls and Vectorize writes

**Risk:** Very low. Additive optimization.

---

## Should NOT Adopt (5 Items)

### 1. Local LLM Inference (node-llama-cpp)
**Why NOT:** AgentWiki runs on Cloudflare Workers — no GPU, no persistent processes, 30-second CPU time limit. Local LLM inference is fundamentally incompatible with serverless architecture. QMD's entire value proposition is local-first; AgentWiki's is cloud-native.

**Instead:** Use existing AI providers (already configured per-tenant) for any LLM-dependent features like query expansion.

---

### 2. BM25/FTS5 Replacing Trigram Search
**Why NOT:**
- Cloudflare D1 (SQLite) does NOT support FTS5 extension loading
- D1 has limited SQLite extension support — only built-in functions
- AgentWiki's trigram search is custom-built for D1's constraints
- Trigram search provides fuzzy matching (typo tolerance) that BM25 lacks
- Migrating would require fundamental D1 architecture change

**Instead:** Improve trigram search scoring with TF-IDF-like weighting within existing trigram infrastructure.

---

### 3. Custom Fine-Tuned Query Expansion Models
**Why NOT:**
- Requires training infrastructure (GPU, datasets, evaluation harness)
- QMD's 2,290 training examples are domain-specific to their use case
- Maintenance burden: model retraining as domain evolves
- AgentWiki already has 6 AI providers configured — use them via API calls
- YAGNI: Prompt-based expansion via existing providers achieves 80% of the benefit at 5% of the effort

**Instead:** Use structured prompts with existing AI providers for query expansion (see Adopt #2).

---

### 4. YAML-Based Collection Configuration
**Why NOT:**
- AgentWiki already has DB-backed folder hierarchy with API/UI
- YAML config is a CLI-first pattern; AgentWiki is web-first
- Collection glob patterns don't map to AgentWiki's document model (documents are DB records, not files)
- Would add configuration surface area without clear benefit

**Instead:** Enhance existing folder system with descriptions/context (see Adopt #3).

---

### 5. LLM-Based Reranking Pipeline
**Why NOT (yet):**
- Adds 500-2000ms latency per search query (LLM inference for each candidate)
- Cost: Every search query triggers AI provider call (multiplied by candidates)
- AgentWiki targets <500ms p95 latency — reranking breaks this budget
- QMD runs reranking locally (free, but slow); AgentWiki would pay per-query
- Position-aware RRF blending (Adopt #1) captures most of the quality improvement without latency/cost

**When to reconsider:** If search quality metrics show RRF + expansion still insufficient, AND AI provider costs drop significantly, consider server-side reranking with strict candidate limits (top 5 only).

---

## Implementation Roadmap

### Phase 1 — Quick Wins (Week 1)
| Item | Effort | Files |
|------|--------|-------|
| Position-aware RRF | 1-2h | `rrf.ts` |
| Content hash skip re-embed | 1-2h | `embedding-service.ts`, migration |
| Search result caching | 1-2h | `search-service.ts` |

### Phase 2 — Medium Impact (Week 2)
| Item | Effort | Files |
|------|--------|-------|
| Smart markdown chunking | 2-3h | `chunker.ts` |
| Search explain mode | 2-3h | `search-service.ts`, `search.ts` route |

### Phase 3 — High Impact (Week 3-4)
| Item | Effort | Files |
|------|--------|-------|
| Folder context system | 6-8h | migration, folder routes, search service, MCP tools, UI |
| Query expansion via AI | 4-6h | new service, search service, KV cache |

### Estimated Total Effort: 18-28 hours

---

## Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Search relevance (top-3 precision) | Unknown | >80% | Manual evaluation on 50 test queries |
| Search latency p95 | ~450ms | <500ms | Cloudflare analytics |
| Cache hit rate | 0% | >30% | KV metrics |
| Embedding efficiency | 100% re-embed | <50% re-embed | Queue job count reduction |
| Agent context quality | No folder context | 100% results have context | MCP response inspection |

---

## Unresolved Questions

1. **D1 FTS support:** Has Cloudflare added FTS5 support to D1 since last check? If yes, BM25 adoption should be reconsidered.
2. **Query expansion latency budget:** Is 200-500ms additional latency acceptable for better results? Should it be opt-in?
3. **Re-embedding cost:** How many documents would need re-embedding after chunking strategy change? What's the Workers AI cost impact?
4. **Search quality baseline:** Do we have test queries + expected results to measure improvement? Should we build an eval set first?
