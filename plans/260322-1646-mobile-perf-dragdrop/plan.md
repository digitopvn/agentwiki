---
title: "GitHub Issues #37, #32, #21 — Mobile UI, Performance, Drag MD Files"
description: "Mobile sidebar drawers with fixed positioning, auto-save performance optimization, and markdown file drag-and-drop import"
status: completed
priority: P1
effort: 12h
branch: feat/mobile-perf-dragdrop
tags: [mobile, performance, drag-drop, frontend, ux]
created: 2026-03-22
issues: [37, 32, 21]
blockedBy: []
blocks: []
---

# Implementation Plan: Issues #37, #32, #21

## Summary

3 independent frontend-focused issues improving UX across mobile, performance, and file import. All changes are in `packages/web/src/`. No backend/API changes required except #21 which reuses existing `POST /api/documents` endpoint.

## Phase Overview

| Phase | File | Issue | Effort | Dependencies |
|-------|------|-------|--------|-------------|
| 01 - Performance | [phase-01](./phase-01-auto-save-performance.md) | #32 | 4h | None |
| 02 - Mobile Drawers | [phase-02](./phase-02-mobile-sidebar-drawers.md) | #37 | 4h | None |
| 03 - Drag MD Files | [phase-03](./phase-03-drag-markdown-import.md) | #21 | 4h | None |

## Dependency Graph

```
Phase 1 (Performance) ──┐
Phase 2 (Mobile UI)  ────┼──> All independent, can be parallelized
Phase 3 (Drag MD)    ──┘
```

## Issue-to-Phase Mapping

| Issue | Title | Phase | Type |
|-------|-------|-------|------|
| #32 | Performance: auto-save laggy/flickering | 01 | perf |
| #37 | Mobile UI: sidebars fixed position drawers | 02 | enhance |
| #21 | Drag markdown files to create notes | 03 | feat |

## Tech Decisions

1. **Auto-save**: Separate contentJson (fast, immediate) from markdown conversion (deferred via requestIdleCallback). Increase debounce to 2s.
2. **Mobile drawers**: CSS `transform` + `will-change` for GPU-accelerated slide animations. Touch swipe gestures via native touch events.
3. **Drag MD import**: Extend `GlobalDropZone` to detect `.md/.markdown` files, read with FileReader, create document via existing `POST /api/documents`.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| BlockNote onChange perf | Medium | Profile with React DevTools, memoize handlers |
| Touch gesture conflicts with scroll | Low | Only activate swipe on edges (20px) |
| Large MD file import | Low | FileReader is async, limit to 10MB |
