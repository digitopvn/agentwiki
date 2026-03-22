---
title: "QMD-Inspired Search Pipeline Improvements"
description: "Adopt 7 search quality & architecture improvements from QMD project — position-aware RRF, query expansion, folder context, smart chunking, caching, debug mode, content hash"
status: pending
priority: P1
effort: 22h
branch: feat/qmd-search-improvements
tags: [search, rrf, query-expansion, context, chunking, caching, performance]
created: 2026-03-22
issues: [38]
brainstorm: plans/reports/brainstorm-260322-1646-qmd-learnings-adoption.md
blockedBy: []
blocks: []
relatedPlans: [260319-1428-enhanced-search-system]
---

# QMD-Inspired Search Pipeline Improvements

Adopt proven patterns from [tobi/qmd](https://github.com/tobi/qmd) (16.5k stars) to improve AgentWiki's search quality, AI agent experience, and performance. 7 items across 3 phases.

## Context

QMD is a local-first hybrid search engine with 5-stage pipeline (expansion → retrieval → RRF → reranking → blending). AgentWiki currently has a 2-stage pipeline (retrieval → RRF). This plan bridges the gap while respecting Cloudflare Workers constraints (no local LLM, no FTS5).

Full analysis: [brainstorm report](../reports/brainstorm-260322-1646-qmd-learnings-adoption.md)

## Architecture: Before & After

```
BEFORE:
Query → [Trigram Search] ─┐
                          ├─→ RRF (k=60, flat) → Results
Query → [Semantic Search] ┘

AFTER:
Query → [AI Expand] → [Expanded Queries] ─┐
                                           ├─→ Position-Aware RRF → Results + Debug Info
Query → [Trigram Search] ─────────────────┤    (with folder context)
Query → [Semantic Search] ────────────────┘
         (smart chunks + content hash skip)
         (KV cache layer)
```

## Phases

| # | Phase | Effort | Priority | File |
|---|-------|--------|----------|------|
| 1 | Quick Wins: RRF + Hash + Cache | 5h | HIGH | [phase-01](./phase-01-quick-wins.md) |
| 2 | Medium: Smart Chunking + Debug | 5h | MEDIUM | [phase-02](./phase-02-chunking-debug.md) |
| 3 | High Impact: Context + Expansion | 12h | HIGH | [phase-03](./phase-03-context-expansion.md) |

## Dependency Graph

```
Phase 1 (RRF + Hash + Cache) → independent, no deps
Phase 2 (Chunking + Debug) → independent, no deps
Phase 3 (Context + Expansion) → independent, no deps

All phases can run in parallel. No cross-phase dependencies.
```

## Key Files Modified

| Package | File | Phases | Changes |
|---------|------|--------|---------|
| api | `src/utils/rrf.ts` | P1 | Position-aware weighting |
| api | `src/services/embedding-service.ts` | P1, P2 | Content hash check, re-chunk |
| api | `src/services/search-service.ts` | P1, P2, P3 | Cache layer, debug mode, expansion |
| api | `src/utils/chunker.ts` | P2 | Markdown-aware chunking |
| api | `src/routes/search.ts` | P2 | Debug query param |
| api | `src/db/schema.ts` | P1, P3 | contentHash column, folder description |
| api | `src/routes/folders.ts` | P3 | Accept/return description |
| api | `src/services/query-expansion-service.ts` | P3 | NEW: AI-based query expansion |
| api | `src/queue/handler.ts` | P1 | Hash check before embed |
| mcp | `src/tools/search-and-graph-tools.ts` | P3 | Return folder context |
| web | folder UI components | P3 | Description field |
| shared | types | P2, P3 | SearchDebug type, folder description |

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Search relevance (top-3) | Unmeasured | >80% on 50 test queries |
| Search latency p95 | ~450ms | <500ms (with expansion: <800ms) |
| Cache hit rate | 0% | >30% for search results |
| Re-embedding skip rate | 0% | >40% on doc updates |
| Context in MCP results | None | 100% results have folder context |

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Query expansion adds latency | High | Medium | KV cache, optional toggle, async |
| Smart chunking requires full re-embed | Certain | Low | One-time queue batch job |
| D1 migration failure | Low | High | Test locally first, backup |
| AI provider rate limits on expansion | Medium | Medium | Cache aggressively, fallback to no-expansion |
