---
title: "Fix Settings Page Tabs"
issue: https://github.com/digitopvn/agentwiki/issues/57
status: completed
priority: high
created: 2026-03-26
branch: claude/exciting-kilby
blockedBy: []
blocks: []
completed: 2026-03-26
---

# Fix Settings Page Tabs (#57)

## Overview

Multiple tabs in the Settings page (`packages/web/src/routes/settings.tsx`) are broken or incomplete. This plan addresses all 6 sub-issues from the GitHub issue.

## Current State

| Tab | Status | Issues |
|-----|--------|--------|
| **Deeplinking** | Missing | Tab state not synced to URL — lost on refresh |
| **Members** | Partial | List + update role + remove work. **No invite/add member** |
| **API Keys** | Partial | List + revoke work. **No create key UI** (backend POST exists) |
| **AI** | Partial | Provider config works. **Models outdated**, no drag-reorder for fallback |
| **Storage** | Read-only | File grid works. **No custom R2 credentials configuration** |
| **Shortcuts** | Display-only | Hardcoded list, **not configurable**, many shortcuts non-functional |

## Phases

| # | Phase | Priority | Effort | Files |
|---|-------|----------|--------|-------|
| 1 | [Settings deeplinking](./phase-01-settings-deeplinking.md) | High | S | 1 frontend |
| 2 | [Members tab CRUD](./phase-02-members-tab-crud.md) | High | M | 2 FE + 1 BE + 1 shared |
| 3 | [API Keys tab CRUD](./phase-03-api-keys-tab-crud.md) | High | M | 1 FE + 0 BE (exists) |
| 4 | [AI tab overhaul](./phase-04-ai-tab-overhaul.md) | High | L | 2 FE + 1 BE + 1 shared + 1 DB migration |
| 5 | [Storage tab configurable](./phase-05-storage-tab-config.md) | Medium | L | 2 FE + 2 BE + 1 DB migration |
| 6 | [Shortcuts tab configurable](./phase-06-shortcuts-tab-config.md) | Medium | M | 2 FE + 1 hook |

## Key Dependencies

- Phase 1 (deeplinking) should be done first — all other phases benefit
- Phases 2-6 are independent of each other
- Phase 4 requires new npm dep: `@dnd-kit/core` + `@dnd-kit/sortable`
- Phase 4 & 5 require DB migrations
- Phase 5 requires AES-256-GCM encryption (already exists for AI keys)

## Architecture Decisions

1. **Deeplinking**: `useSearchParams` from react-router-dom — sync `?tab=<id>` with state
2. **Drag reorder**: `@dnd-kit/sortable` — lightweight, accessible, React 19 compatible
3. **Storage credentials**: Reuse existing AES-256-GCM encryption pattern from AI settings
4. **Shortcuts config**: Store in `localStorage` with defaults fallback — no DB needed
5. **Members invite**: Email-based invite via new `POST /api/members/invite` endpoint

## Success Criteria

- [x] Each tab accessible via direct URL: `/settings?tab=<id>`
- [x] Members: invite by email, list, update role, remove
- [x] API Keys: create (with shown-once key), list, revoke
- [x] AI: updated model lists, drag-reorder providers for fallback priority
- [x] Storage: form to configure custom R2 credentials per tenant
- [x] Shortcuts: all listed shortcuts functional, each rebindable via UI
- [x] `pnpm type-check && pnpm lint` pass
