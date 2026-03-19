# Planner Report: GitHub Issues #3-#18 Implementation Plan

**Date:** 2026-03-19
**Plan:** `plans/260319-1329-github-issues-implementation/`

## Summary

Created comprehensive implementation plan for all 15 open GitHub issues, organized into 6 phases. Every issue analyzed against actual codebase state — files to modify, root causes identified, code patterns documented.

## Plan Structure

```
plans/260319-1329-github-issues-implementation/
├── plan.md                          # Overview, dependency graph, tech decisions
├── phase-01-quick-fixes.md          # #7, #12, #13 — 2h
├── phase-02-ui-enhancements.md      # #15, #5, #6 — 5h
├── phase-03-core-feature-fixes.md   # #4, #3, #16 — 8h
├── phase-04-new-features.md         # #11, #9, #14, #8 — 10h
├── phase-05-r2-storage-ui.md        # #10 — 5h
└── phase-06-documentation.md        # #17, #18 — 2h
```

**Total estimated effort: 32h**

## Key Findings from Codebase Analysis

1. **#12 (author name)**: Root cause confirmed — `document-properties.tsx:125` displays `doc.createdBy` which is a user ID. Fix requires joining `users` table in `getDocument()`.

2. **#13 (Enter on title)**: Title `<input>` in `editor.tsx:111-129` has no `onKeyDown` handler. BlockNote's `editor.focus()` API is available.

3. **#7 (CSS outline)**: Global `:focus-visible` in `index.css:60-63` applies to all elements. Inputs already have Tailwind ring styles, so outline can be safely removed for inputs/editor.

4. **#3 (version control)**: `updateDocument()` in `document-service.ts:218` creates a version on EVERY call unconditionally. Fix: content-hash comparison + 5-min time gate.

5. **#4 (DnD)**: No DND library installed. Recommended `@dnd-kit/core` — lightweight, React 19 compatible. Only need `useDraggable`/`useDroppable` (no sortable).

6. **#15 (deep linking)**: `app.tsx` only has `/` route. Need `/doc/:slug` route + `getDocumentBySlug()` backend endpoint. All doc-opening call sites (5 locations) need updating.

7. **#5 (command palette search)**: Already uses `useDocuments({ search })` with LIKE filter. Should switch to `/api/search` hybrid endpoint for better results. Missing debounce.

8. **#16 (sharing)**: Access level buttons update `documents.access_level` column but don't create/revoke share links. Backend share service exists but is disconnected from the UI. `/share/:token` route renders a placeholder.

9. **#10 (R2 storage)**: Backend upload routes exist. BlockNote supports `uploadFile` config option for direct editor image uploads. Need `GET /api/uploads` list endpoint + Settings UI.

## Tech Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| DND library | `@dnd-kit/core` | React 19 compat, tree-friendly, lightweight |
| Keyboard shortcuts | Custom hook + Zustand store | Few shortcuts; no lib overhead; cmdk already handles palette |
| Deep linking pattern | `/doc/:slug` route | SEO-friendly, human-readable URLs |
| Version gating | SHA-256 content hash + 5-min interval | Prevents duplicate versions without losing data |
| Docs pages | Static data files + React pages | No OpenAPI overhead; upgradeable later |

## New Files to Create (across all phases)

### Frontend
- `hooks/use-document-navigation.ts` — URL-driven doc navigation
- `hooks/use-search.ts` — hybrid search hook
- `hooks/use-debounce.ts` — debounce utility
- `hooks/use-tags.ts` — tag listing
- `hooks/use-uploads.ts` — upload CRUD
- `hooks/use-keyboard-shortcuts.ts` — shortcut registry
- `stores/shortcut-store.ts` — customizable key mappings
- `components/sidebar/document-context-menu.tsx`
- `components/sidebar/context-menu-item.tsx` (extracted)
- `components/sidebar/browse-panel.tsx`
- `components/metadata/share-link-display.tsx`
- `components/settings/members-tab.tsx`
- `components/settings/workspace-tab.tsx`
- `components/settings/api-keys-tab.tsx`
- `components/settings/storage-tab.tsx`
- `components/settings/shortcuts-tab.tsx`
- `components/docs/code-block.tsx`
- `components/docs/docs-layout.tsx`
- `routes/profile.tsx`
- `routes/settings.tsx`
- `routes/api-docs.tsx`
- `routes/cli-docs.tsx`
- `data/api-reference.ts`
- `data/cli-reference.ts`

### Backend
- `routes/members.ts` — member management
- `services/member-service.ts` — member CRUD

## New Dependencies
- `@dnd-kit/core` — drag and drop (Phase 3)

## Unresolved Questions

1. **#16 "Specific users" scope**: Should this be a full user picker with email lookup, or MVP with a shareable link? Plan assumes MVP approach (share link labeled for specific users).

2. **#14 Shortcut conflicts**: How to handle conflicts between custom shortcuts and browser defaults (e.g., Ctrl+W closes browser tab)? Plan assumes we prevent overriding browser-reserved combos.

3. **#10 R2 credentials**: Issue mentions reading R2 credentials via `obsidian` CLI from "System/Credentials/Cloudflare". This may be for initial setup only — in production, R2 bindings are configured in `wrangler.toml`. Plan assumes standard Cloudflare bindings.

4. **#8 Category management**: Should categories be a fixed list or freeform? Current schema uses freeform text. Plan keeps it freeform with a distinct query to show existing categories.

---

**Status:** DONE
**Summary:** Complete 6-phase implementation plan created for 15 GitHub issues with detailed file-level instructions, code patterns, and dependency ordering.
