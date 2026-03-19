---
title: "Enhanced Search System"
description: "Trigram fuzzy search, autocomplete, faceted filtering, search analytics — all on Cloudflare stack"
status: pending
priority: P1
effort: 40h
branch: feat/enhanced-search
tags: [search, trigram, fuzzy, autocomplete, facets, analytics, cloudflare]
created: 2026-03-19
brainstorm: plans/reports/brainstorm-260319-1428-enhanced-search-system.md
blockedBy: []
blocks: []
---

# Enhanced Search System — Implementation Plan

Upgrade AgentWiki's search from basic LIKE queries to a production-grade hybrid search with trigram fuzzy matching, autocomplete suggestions, faceted filtering, and search analytics. 100% Cloudflare stack.

## Current State

- **Keyword:** SQL `LIKE %query%` on title + content (no ranking, no fuzzy)
- **Semantic:** Cloudflare Vectorize + BAAI BGE embeddings (working well)
- **Fusion:** RRF with k=60 (working well)
- **UI:** Command palette (Cmd+K) with debounced search

## Architecture After Enhancement

```
┌─────────────────────────────────────────────────────────┐
│                    Search API Layer                       │
│  GET /api/search        GET /api/search/suggest          │
│  POST /api/search/track                                  │
├───────────┬────────────┬────────────┬───────────────────┤
│  Trigram   │  Semantic   │  Faceted   │   Autocomplete   │
│  Fuzzy     │  Vector     │  Filter    │   Suggest        │
│  (D1)      │ (Vectorize) │  (D1)     │   (D1 + KV)     │
├───────────┴────────────┴────────────┴───────────────────┤
│                 RRF Fusion (enhanced)                    │
├─────────────────────────────────────────────────────────┤
│              Search Analytics (D1, async)                │
└─────────────────────────────────────────────────────────┘
```

## Phases

| # | Phase | Effort | Status | File |
|---|-------|--------|--------|------|
| 1 | Trigram Fuzzy Search | 14h | Pending | [phase-01](./phase-01-trigram-fuzzy-search.md) |
| 2 | Autocomplete & Suggestions | 10h | Pending | [phase-02](./phase-02-autocomplete-suggestions.md) |
| 3 | Faceted Filtering | 8h | Pending | [phase-03](./phase-03-faceted-filtering.md) |
| 4 | Search Analytics | 8h | Pending | [phase-04](./phase-04-search-analytics.md) |

## Dependency Graph

```
Phase 1 (Trigram Fuzzy) ──→ Phase 2 (Autocomplete)
                                    │
Phase 3 (Facets) ← independent ─────┤
                                    │
Phase 4 (Analytics) ← independent ──┘
```

P1 is foundation. P2 depends on P1 (uses trigram for fuzzy title matching). P3 and P4 are independent of each other.

## Key Files Modified

| Package | File | Changes |
|---------|------|---------|
| api | `src/db/schema.ts` | Add 3 new tables |
| api | `src/services/search-service.ts` | Replace LIKE with trigram, add facets |
| api | `src/services/trigram-service.ts` | NEW: trigram generation & indexing |
| api | `src/services/suggest-service.ts` | NEW: autocomplete logic |
| api | `src/services/analytics-service.ts` | NEW: search analytics tracking |
| api | `src/routes/search.ts` | Add /suggest, /track endpoints, facet params |
| api | `src/queue/handler.ts` | Add 'index-trigrams' job type |
| api | `src/utils/trigram.ts` | NEW: trigram extraction utilities |
| api | `src/utils/stop-words.ts` | NEW: English stop words list |
| web | `src/hooks/use-search.ts` | Add facets, suggest hooks |
| web | `src/components/command-palette/command-palette.tsx` | Autocomplete UI |
| shared | `src/constants.ts` | Add suggest rate limit |
| shared | `src/types/search.ts` | NEW: search type definitions |

## Storage Impact

- `search_trigrams`: ~500MB for 10K docs (word-level extraction)
- `search_history`: Negligible (~100KB per tenant)
- `search_analytics`: ~50MB/month at moderate usage
- Total: Well within D1 10GB paid tier
