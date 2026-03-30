# Brainstorm: Auto Knowledge Graph Linking

**Issue:** [#68](https://github.com/digitopvn/agentwiki/issues/68) — Documents should be linked to each other in KG automatically
**Date:** 2026-03-29
**Status:** Approved → Ready for plan

## Problem

Manual `[[wikilink]]` tagging is tedious. Documents need to auto-discover and link to related docs upon creation/update.

## Current State

AgentWiki already has dual-layer KG:
- **Layer 1 (explicit):** `document_links` — extracted from `[[wikilinks]]` in content (`inferred=0`)
- **Layer 2 (implicit):** `document_similarities` — vector cosine similarity cached after embedding

Pipeline: `doc save → syncWikilinks → summary → embed → compute-similarities → STOPS`

The gap: `document_similarities` computed but **never converted to `document_links`**.

## Reference: GoClaw KG

Studied GoClaw repo for patterns:
- LLM entity extraction with chunking + merge dedup
- Confidence scoring (1.0=explicit, 0.7=implied, 0.4=inferred)
- Background goroutine, non-blocking
- Upsert-on-conflict idempotent ingestion
- Hybrid ILIKE + pgvector search

**Decision:** Use similarity-based auto-link (not full LLM entity extraction) — simpler, leverages existing infra, no extra AI credits.

## Approved Approach

### Pipeline Extension

```
compute-similarities completes
    ↓
auto-link-from-similarities (NEW queue job)
    ↓
Read document_similarities (top 5, score >= 0.7)
    ↓
Filter: skip docs with existing explicit link (inferred=0)
    ↓
Insert document_links (type='relates-to', inferred=1, weight=score)
    ↓
Queue: infer-edge-types (classify type for new auto-links)
```

### 3 Changes Required

1. **`autoLinkFromSimilarities()`** — new function in `similarity-service.ts`
   - Read `document_similarities` for target doc
   - Filter out existing explicit links
   - Upsert `document_links` with `inferred=1`, `type='relates-to'`, `weight=similarity_score`
   - Bidirectional links (A→B and B→A)

2. **Queue handler chain** — `handler.ts`
   - New case: `auto-link-similarities`
   - After `compute-similarities` → enqueue `auto-link-similarities`
   - After auto-link → enqueue `infer-edge-types`

3. **Backfill endpoint** — `graph.ts` route
   - `POST /api/graph/backfill-auto-links` — admin batch processing
   - Iterate all docs, enqueue `auto-link-similarities` per doc
   - Self-re-enqueue with offset for large datasets

### Design Decisions

| Decision | Value | Rationale |
|----------|-------|-----------|
| Threshold | 0.7 | Match existing `SIMILARITY_THRESHOLD` |
| Max links/doc | 5 | Match existing `TOP_K - 1` |
| Dedup | Skip if explicit link exists | Don't overwrite user's manual links |
| Direction | Bidirectional | Similarity is symmetric |
| Idempotent | Upsert on conflict | Safe to re-run |
| User review | Auto-accept | Visual indicator (dotted lines) in graph; user can delete |
| Backfill | Yes | Admin endpoint for existing docs |

### Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Too many auto-links cluttering graph | Threshold 0.7 + max 5 per doc |
| Queue overload during backfill | Batch processing with offset + re-enqueue |
| Stale auto-links after content changes | Re-computed on every save (similarity recalculation) |
| D1 write limits | Upsert batching, existing pattern proven |

### Success Criteria

- Documents auto-linked within seconds of save
- Auto-links visible in graph with `inferred=1` distinction
- Backfill processes all existing docs without timeout
- No regression on existing explicit wikilinks
- Graph density improves measurably (orphan count decreases)

## Next Steps

Create detailed implementation plan → implement → test → review.
