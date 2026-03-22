---
title: "Explorer Sidebar: Positions, Sorting & Recent Modifications"
description: "Drag-drop reorder for folders+docs, sort by name/date with manual fallback, recent modifications section"
status: completed
priority: P1
effort: 24h
issue: 29
branch: feat/explorer-sidebar-positions
tags: [feature, frontend, backend, database, dnd, sidebar]
created: 2026-03-22
brainstorm: plans/reports/brainstorm-260322-2051-explorer-sidebar-positions.md
blockedBy: []
blocks: []
---

# Explorer Sidebar: Positions, Sorting & Recent Modifications

## Summary

Issue #29 — 3 features for Explorer sidebar:
1. **Drag & drop reorder** folders + documents (fractional indexing, server-persisted)
2. **Sort controls** — name (A-Z/Z-A), date (new/old), manual (saved positions)
3. **Recent modifications** — collapsible section showing 10 latest docs

## Architecture Decision

- **Fractional indexing** via `fractional-indexing` lib for O(1) reorder writes
- **Folders first, docs after** per level (both independently reorderable)
- **`@dnd-kit/sortable`** for reorder UX (upgrade from current drag-only)
- **`user_preferences`** table for per-user sort prefs (server-persisted)
- **Existing `listDocuments`** reused for recent docs query

## Phases

| # | Phase | Status | Effort | File |
|---|-------|--------|--------|------|
| 1 | DB Migration & Schema | completed | 3h | [phase-01](./phase-01-db-migration.md) |
| 2 | API: Reorder & Preferences | completed | 5h | [phase-02](./phase-02-api-endpoints.md) |
| 3 | Frontend: Sortable DnD | completed | 8h | [phase-03](./phase-03-frontend-dnd.md) |
| 4 | Frontend: Sort Controls & Recent Section | completed | 5h | [phase-04](./phase-04-sort-and-recent.md) |
| 5 | Testing & Polish | completed | 3h | [phase-05](./phase-05-testing.md) |

## Key Dependencies

- `fractional-indexing` npm package (packages/api + packages/web)
- `@dnd-kit/sortable` npm package (packages/web — may already be peer dep)
- D1 migration for `position` column on documents + `user_preferences` table
