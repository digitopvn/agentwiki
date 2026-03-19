# Brainstorm: Enhanced Search System

**Date:** 2026-03-19
**Branch:** feat/github-issues-batch
**Status:** Approved → Plan creation

## Problem Statement

Current search has limitations:
- Keyword search uses SQL LIKE (no fuzzy, no typo tolerance, no ranking)
- No autocomplete/suggestions
- No faceted filtering (only basic category param)
- No search analytics

## Constraints

- **Infrastructure:** Cloudflare only (D1, Vectorize, Workers AI, Queues, KV)
- **Scale:** 1K-10K documents, multiple tenants
- **D1 limitation:** No FTS5 support → need alternative for fuzzy matching

## Evaluated Approaches

### A. Trigram Index + Phased Enhancement ✅ SELECTED
- Word-level trigram index in D1 for fuzzy matching
- Phased delivery: Fuzzy → Autocomplete → Facets → Analytics
- **Pros:** Accurate fuzzy, incremental value, KISS
- **Cons:** Trigram table storage (~500MB for 10K docs)

### B. Semantic-Heavy (Minimal Keyword Changes)
- Rely on embeddings for typo tolerance
- **Pros:** Least code
- **Cons:** Embeddings unreliable for short typos, keyword results stay weak

### C. Custom Inverted Index + BM25
- Full search engine in D1
- **Pros:** Search engine-grade quality
- **Cons:** Over-engineered for 1K-10K docs, high maintenance, violates YAGNI

## Approved Design

### Architecture
```
Search API → [Trigram Fuzzy (D1) + Semantic (Vectorize) + Facets (D1)] → RRF Fusion → Analytics (D1)
                                                                          ↑
                                                        Autocomplete (D1 + KV) → GET /api/search/suggest
```

### Phases
| Phase | Scope | New Tables |
|-------|-------|------------|
| P1 | Trigram fuzzy search replacing LIKE | search_trigrams |
| P2 | Autocomplete + search suggestions | search_history + KV cache |
| P3 | Faceted filtering (tags, date, category) | — (extend existing) |
| P4 | Search analytics + dashboard | search_analytics |

### Key Decisions
- **Word-level trigram extraction** (not character sliding window) to reduce storage
- **Stop words removal** before trigram generation
- **Trigram indexing via queue job** (same pattern as embed jobs)
- **KV cache** for hot autocomplete prefixes (TTL 5min)
- **Vectorize metadata** extended with tags/category for semantic faceted search

### Storage Estimate
- 10K docs × ~2500 unique trigrams = ~10M rows = ~500MB
- Acceptable within D1 paid tier (10GB limit)

### Risks
| Risk | Mitigation |
|------|------------|
| Trigram table too large | Word-level extraction + stop words, monitor size |
| Index rebuild slow | Background queue, incremental updates only |
| D1 query perf at scale | Composite indexes, limited scan range |
| KV cache stale | Short TTL, invalidate on popular query changes |

## Next Steps
- Create detailed implementation plan with phases
- Each phase independently deployable and testable
