---
status: completed
issue: 68
branch: feat/auto-knowledge-graph-linking-68
created: 2026-03-29
blockedBy: []
blocks: []
---

# Auto Knowledge Graph Linking

**Issue:** [#68](https://github.com/digitopvn/agentwiki/issues/68)
**Branch:** `feat/auto-knowledge-graph-linking-68`

## Overview

Auto-create `document_links` from vector similarity after every doc save. Leverages existing `compute-similarities` pipeline — adds one new queue job that converts `document_similarities` into typed `document_links` (inferred=1).

## Phases

| # | Phase | Status | Files |
|---|-------|--------|-------|
| 1 | [Fix syncWikilinks + add autoLinkFromSimilarities](phase-01-auto-link-service.md) | pending | similarity-service.ts, document-service.ts |
| 2 | [Queue handler chain + backfill endpoint](phase-02-queue-and-backfill.md) | pending | handler.ts, graph.ts |
| 3 | [Build & test](phase-03-build-and-test.md) | pending | — |

## Architecture

```
Doc save → syncWikilinks (explicit only, inferred=0)
        → generate-summary → embed → compute-similarities
                                        ↓
                              auto-link-similarities (NEW)
                                        ↓
                              Insert document_links (inferred=1)
                                        ↓
                              infer-edge-types (classify)
```

## Key Decisions

- Threshold: 0.7 (match existing SIMILARITY_THRESHOLD)
- Max auto-links per doc: 5
- Bidirectional links (A→B and B→A)
- No user review — auto-accept with visual distinction
- Critical fix: `syncWikilinks` must only delete `inferred=0` links

## Dependencies

- Existing: `compute-similarities` queue job, `document_similarities` table, `document_links` table
- No new tables, no schema migrations needed
