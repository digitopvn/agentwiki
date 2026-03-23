---
title: "GitHub Issues #3-#18 Implementation Plan"
description: "Comprehensive implementation plan for all 15+ open GitHub issues across 6 phases"
status: pending
priority: P1
effort: 32h
branch: feat/github-issues-batch
tags: [issues, frontend, backend, features, bugfixes]
created: 2026-03-19
---

# Implementation Plan: All Open GitHub Issues

## Summary

15 open issues grouped into 6 phases by dependency, complexity, and risk. Phases 1-2 are pure frontend. Phase 3 mixes frontend+backend. Phases 4-5 are new feature builds. Phase 6 is documentation.

## Phase Overview

| Phase | File | Issues | Effort | Dependencies |
|-------|------|--------|--------|-------------|
| 01 - Quick Fixes | [phase-01](./phase-01-quick-fixes.md) | #7, #12, #13 | 2h | None |
| 02 - UI Enhancements | [phase-02](./phase-02-ui-enhancements.md) | #15, #5, #6 | 5h | None |
| 03 - Core Feature Fixes | [phase-03](./phase-03-core-feature-fixes.md) | #4, #3, #16 | 8h | Phase 1 |
| 04 - New Features | [phase-04](./phase-04-new-features.md) | #11, #9, #14, #8 | 10h | Phase 2 |
| 05 - Infrastructure | [phase-05](./phase-05-r2-storage-ui.md) | #10 | 5h | Phase 4 (#9) |
| 06 - Documentation | [phase-06](./phase-06-documentation.md) | #17, #18 | 2h | All prior |

## Dependency Graph

```
Phase 1 (Quick Fixes)
  |
  v
Phase 3 (Core Fixes) -----> Phase 5 (R2 Storage)
                                ^
Phase 2 (UI Enhancements)       |
  |                             |
  v                             |
Phase 4 (New Features) ---------+
  |
  v
Phase 6 (Documentation)
```

## Issue-to-Phase Mapping

| Issue | Title | Phase | Type |
|-------|-------|-------|------|
| #7 | CSS outline on editor/inputs | 01 | fix |
| #12 | Author name encoded chars | 01 | bug |
| #13 | ENTER on title -> focus editor | 01 | enhance |
| #15 | Deep linking (URL matches doc) | 02 | enhance |
| #5 | Command Palette doc search | 02 | enhance |
| #6 | Sidebar right-click context menu on docs | 02 | enhance |
| #4 | Drag & drop docs into folders | 03 | fix |
| #3 | Smart version control | 03 | enhance |
| #16 | Sharing access levels | 03 | fix |
| #11 | Profile page | 04 | feat |
| #9 | Admin settings page | 04 | feat |
| #14 | Keyboard shortcuts system | 04 | feat |
| #8 | Browse by categories/tags | 04 | enhance |
| #10 | R2 storage UI | 05 | feat |
| #17 | API docs page | 06 | feat |
| #18 | CLI docs page | 06 | feat |

## Tech Decisions

1. **DND library**: `@dnd-kit/core` + `@dnd-kit/sortable` (lightweight, React 19 compatible)
2. **Keyboard shortcuts**: Custom hook wrapping `document.addEventListener` (no extra lib; cmdk already handles Cmd+K)
3. **Routing for deep linking**: Extend React Router with `/doc/:slug` pattern
4. **Profile/Settings pages**: New routes under `/profile` and `/settings`
5. **Version control**: Content-hash comparison to skip duplicate versions

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| DND library compat with React 19 | Medium | @dnd-kit actively maintained; test early |
| Version hash perf on large docs | Low | SHA-256 via SubtleCrypto is fast |
| R2 credentials management | Medium | Use env bindings; never expose keys to frontend |
| Deep linking + tab state sync | Medium | Single source of truth in URL; derive tab state from it |
