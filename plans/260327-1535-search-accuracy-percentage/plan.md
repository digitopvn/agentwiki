---
title: "Search Accuracy Percentage in Command Palette"
description: "Show % accuracy badge on search results & suggestions in command palette, sorted descending by relevance"
status: completed
priority: P2
effort: 6h
branch: feat/search-accuracy-percentage
issue: "#55"
tags: [search, accuracy, command-palette, ux]
created: 2026-03-27
brainstorm: plans/reports/brainstorm-260327-1535-search-accuracy-percentage.md
blockedBy: []
blocks: []
---

# Search Accuracy Percentage in Command Palette

**Issue:** [#55](https://github.com/digitopvn/agentwiki/issues/55)
**Approach:** Preserve & Blend — `accuracy = max(keywordScore, semanticScore) * 100`

## Phases

| # | Phase | Status | Files |
|---|-------|--------|-------|
| 1 | [Shared types + RRF pipeline](phase-01-backend-scoring-pipeline.md) | complete | 6 files |
| 2 | [Frontend accuracy badge](phase-02-frontend-accuracy-badge.md) | complete | 1 file |
| 3 | [Build & verify](phase-03-build-verify.md) | complete | — |

## Key Decision

- `accuracy = max(keywordScore, semanticScore) * 100` — uses strongest signal, doesn't penalize single-signal results
- Badge color: green >= 80%, yellow >= 50%, gray < 50%
- Applies to both search results AND suggestions

## Dependencies

- None — builds on existing search infrastructure
