---
title: "Fix Knowledge Graph Edge Extraction"
description: "Fix 0 edges in Knowledge Graph by extracting standard markdown links alongside wikilinks"
status: complete
priority: P1
effort: 3h
branch: claude/romantic-swanson
tags: [knowledge-graph, bug-fix, edge-extraction, mobile]
created: 2026-03-27
---

# Fix Knowledge Graph Edge Extraction

## Problem

Knowledge Graph shows 0 edges because `syncWikilinks()` only extracts `[[wikilinks]]` via regex, but BlockNote editor produces standard markdown links `[text](/doc/slug)`. The `document_links` table stays empty.

## Root Cause

- `wikilink-extractor.ts` only has `WIKILINK_REGEX = /\[\[([^\]]+)\]\]/g`
- BlockNote never produces `[[wikilinks]]` — it outputs `[text](/doc/slug)` links
- `syncWikilinks()` calls `extractWikilinks()` only, finds nothing, inserts nothing

## Phases

| # | Phase | Status | Effort | Files |
|---|-------|--------|--------|-------|
| 1 | [Fix Edge Extraction](./phase-01-fix-edge-extraction.md) | Complete | 1.5h | wikilink-extractor.ts, document-service.ts |
| 2 | [Enable Implicit Edges + Backfill](./phase-02-enable-implicit-backfill.md) | Complete | 0.5h | graph-toolbar.tsx, graph.ts, use-graph.ts |
| 3 | [Mobile Responsive Graph](./phase-03-mobile-responsive-graph.md) | Complete | 1h | graph.tsx, graph-canvas.tsx, graph-toolbar.tsx, graph-insight-panel.tsx |

## Dependencies

- Phase 2 depends on Phase 1 (backfill uses the fixed extraction)
- Phase 3 is independent, can run in parallel with Phase 1-2

## Success Criteria

- Documents linked with `[text](/doc/slug)` produce edges in `document_links`
- Existing documents get backfilled via admin endpoint
- Graph page renders correctly on mobile (< 768px)
- Existing `[[wikilink]]` extraction unaffected
