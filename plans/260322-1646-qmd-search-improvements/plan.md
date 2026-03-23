---
title: "QMD-Inspired Search Pipeline Improvements"
description: "Adopt search quality & architecture improvements from QMD project — eval baseline, FTS5/BM25, position-aware RRF, query expansion (parallel), folder context, smart chunking, caching, debug mode, content hash"
status: in-progress
priority: P1
effort: 30h
branch: research/qmd-search-improvements
tags: [search, rrf, fts5, bm25, query-expansion, context, chunking, caching, performance, eval]
created: 2026-03-22
updated: 2026-03-23
issues: [38]
brainstorm: plans/reports/brainstorm-260322-1646-qmd-learnings-adoption.md
research: plans/reports/researcher-260323-qmd-plan-evaluation.md
blockedBy: []
blocks: []
relatedPlans: [260319-1428-enhanced-search-system]
notes: "Code implementation complete. Awaiting review before merge to main."
---

# QMD-Inspired Search Pipeline Improvements

Adopt proven patterns from [tobi/qmd](https://github.com/tobi/qmd) (16.5k stars) to improve AgentWiki's search quality, AI agent experience, and performance. 9 items across 5 phases.

## Context

QMD is a local-first hybrid search engine with 5-stage pipeline (expansion → retrieval → RRF → reranking → blending). AgentWiki currently has a 2-stage pipeline (retrieval → RRF). This plan bridges the gap while respecting Cloudflare Workers constraints (no local LLM).

**Update (2026-03-23):** [Research report](../reports/researcher-260323-qmd-plan-evaluation.md) confirmed D1 now supports FTS5. Plan updated with eval baseline + FTS5/BM25 evaluation phases, and query expansion redesigned for parallel execution.

Full analysis: [brainstorm report](../reports/brainstorm-260322-1646-qmd-learnings-adoption.md) | [research evaluation](../reports/researcher-260323-qmd-plan-evaluation.md)

## Architecture: Before & After

```
BEFORE:
Query → [Trigram Search] ─┐
                          ├─→ RRF (k=60, flat) → Results
Query → [Semantic Search] ┘

AFTER:
                    ┌─→ [AI Expand] → [Search expanded] ─┐
Query ──────────────┤                                     ├─→ Position-Aware RRF → Results + Debug
  (KV cache layer)  ├─→ [FTS5/BM25 Search] ─────────────┤    (with folder context)
                    ├─→ [Trigram Fuzzy (fallback)] ──────┤
                    └─→ [Semantic Search] ────────────────┘
                         (smart chunks + content hash skip)
```

**Key change:** Expansion runs **in parallel** with regular search (Promise.all), not sequentially. Latency = max(expansion, search), not sum.

## Phases

| # | Phase | Effort | Priority | Status | File |
|---|-------|--------|----------|--------|------|
| 0 | Search Eval Baseline | 3h | CRITICAL | code-complete | [phase-00](./phase-00-search-eval-baseline.md) |
| 0.5 | FTS5/BM25 Evaluation | 4h | HIGH | code-complete | [phase-00b-fts5-bm25-evaluation.md](./phase-00b-fts5-bm25-evaluation.md) |
| 1 | Quick Wins: RRF + Hash + Cache | 5h | HIGH | code-complete | [phase-01](./phase-01-quick-wins.md) |
| 2 | Smart Chunking + Debug | 4h | MEDIUM | code-complete | [phase-02](./phase-02-chunking-debug.md) |
| 3 | Folder Context + Query Expansion | 14h | HIGH | code-complete | [phase-03](./phase-03-context-expansion.md) |

## Dependency Graph

```
Phase 0  (Eval Baseline) ← MUST DO FIRST — all other phases depend on this
  ↓
Phase 0.5 (FTS5/BM25 Eval) ← depends on eval set from Phase 0
  ↓
Phase 1 (RRF + Hash + Cache) ← benefits from eval, independent of 0.5
Phase 2 (Chunking + Debug)   ← independent, no deps except Phase 0
Phase 3 (Context + Expansion) ← independent, no deps except Phase 0

After each phase: re-run eval to measure improvement.
```

## Key Files Modified

| Package | File | Phases | Changes |
|---------|------|--------|---------|
| api | `tests/search-eval/` | P0 | NEW: eval queries + golden set + harness |
| api | `src/services/fts5-search-service.ts` | P0.5 | NEW: FTS5/BM25 search service |
| api | `src/db/schema.ts` | P0.5, P1, P3 | FTS5 virtual table, contentHash, folder desc |
| api | `src/utils/rrf.ts` | P1 | Position-aware weighting |
| api | `src/services/embedding-service.ts` | P1, P2 | Content hash check, re-chunk |
| api | `src/services/search-service.ts` | P0.5, P1, P2, P3 | FTS5 integration, cache, debug, expansion |
| api | `src/utils/chunker.ts` | P2 | Markdown-aware chunking |
| api | `src/routes/search.ts` | P2 | Debug query param |
| api | `src/services/query-expansion-service.ts` | P3 | NEW: AI-based parallel query expansion |
| api | `src/routes/folders.ts` | P3 | Accept/return description |
| api | `src/queue/handler.ts` | P1 | Hash check before embed |
| mcp | `src/tools/search-and-graph-tools.ts` | P3 | Return folder context, expand param |
| web | folder UI components | P3 | Description field |
| shared | types | P2, P3 | SearchDebug type, folder description |

## Success Metrics

| Metric | Current | Target | Measured By |
|--------|---------|--------|-------------|
| MRR@5 (eval set) | Unmeasured | Baseline + track | Phase 0 eval harness |
| Precision@3 (eval set) | Unmeasured | >80% on 50 queries | Phase 0 eval harness |
| NDCG@10 | Unmeasured | Baseline + track | Phase 0 eval harness |
| Search latency p95 | ~450ms | <500ms (expansion: <600ms parallel) | Debug mode timings |
| Cache hit rate | 0% | >30% for search results | KV metrics |
| Re-embedding skip rate | 0% | >40% on doc updates | Queue handler logs |
| Context in MCP results | None | 100% results have folder context | MCP tool response |
| FTS5 vs Trigram quality | N/A | BM25 ≥ trigram on eval set | Phase 0.5 benchmark |

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| No eval set → blind optimization | ~~Certain~~ Resolved | ~~High~~ | Phase 0 builds eval set first |
| FTS5 migration complexity | Medium | Medium | Evaluate in isolation, keep trigram as fallback |
| Query expansion latency | ~~High~~ Reduced | Medium | **Parallel execution** + KV cache + opt-in per channel |
| Smart chunking requires full re-embed | Certain | Low | One-time queue batch job (~$0.10/1K docs, ~4 min) |
| D1 migration failure | Low | High | Test locally, backup, `ALTER TABLE ADD COLUMN` |
| AI provider rate limits on expansion | Medium | Medium | Cache 1h TTL, exponential backoff, graceful skip |
| FTS5 + trigram coexistence overhead | Low | Low | Benchmark both, disable trigram if FTS5 wins |

## Remaining Questions

1. **Vectorize metadata limits:** Size limit on metadata per vector? Heading chains could be long.
2. **Multi-tenant expansion cache:** Per-tenant or global? Same query in different tenants may need different expansions.
3. **Queue priority:** Should re-embedding jobs have lower priority than real-time embed jobs?
4. **FTS5 virtual table export:** D1 export tool can't export FTS5 tables — need drop+recreate migration strategy.
