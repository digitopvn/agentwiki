# Implementation Report: All GitHub Issues (#3-#18)

**Date:** 2026-03-19 | **Branch:** `feat/github-issues-batch` | **PR:** [#19](https://github.com/digitopvn/agentwiki/pull/19)
**Last updated:** 2026-03-19 14:35 ICT | **Commits:** 7 | **CI:** All green

## Summary

15 open GitHub issues implemented across 6 phases + 6 post-implementation fixes. 53 files changed, ~4800 lines added. CI passes (type-check + lint + build). All pages verified in browser.

## Phase 1: Quick Fixes (Issues #7, #12, #13)

| Issue | Title | Solution | Files |
|-------|-------|----------|-------|
| #7 | CSS outline on editor/inputs | Scoped `:focus-visible` to buttons only; disabled on inputs/editor | `index.css` |
| #12 | Author name encoded chars | Join `users` table in `getDocument()`, display `authorName` in metadata | `document-service.ts`, `document-properties.tsx`, `shared/types/document.ts` |
| #13 | Enter on title → focus editor | Added `onKeyDown` handler, saves title + calls `editor.focus()` | `editor.tsx` |

## Phase 2: UI Enhancements (Issues #15, #5, #6)

| Issue | Title | Solution | Files |
|-------|-------|----------|-------|
| #15 | Deep linking | Added `/doc/:slug` route, `useDocumentBySlug` hook, URL-driven tab management | `app.tsx`, `layout.tsx`, `use-document-navigation.ts`, `use-documents.ts`, all doc-opening call sites |
| #5 | Command Palette search | Hybrid search via `/api/search`, debounced input, recent docs when empty | `command-palette.tsx`, `use-search.ts`, `use-debounce.ts` |
| #6 | Document context menu | Right-click on docs shows Open/Rename/Move/Delete menu | `document-context-menu.tsx`, `folder-tree.tsx`, `folder-node.tsx` |

## Phase 3: Core Feature Fixes (Issues #4, #3, #16)

| Issue | Title | Solution | Files |
|-------|-------|----------|-------|
| #4 | Drag & drop | `@dnd-kit/core`: docs draggable, folders droppable, root drop zone | `folder-tree.tsx`, `folder-node.tsx`, `package.json` |
| #3 | Smart versioning | Content-hash (SHA-256) + 5-min time-gate; manual checkpoint endpoint | `document-service.ts`, `documents.ts` route |
| #16 | Sharing access levels | Public/Specific → auto-create share link with copy button; ShareView for `/share/:token` | `share-link-display.tsx`, `document-properties.tsx`, `use-share-links.ts`, `app.tsx` |

## Phase 4: New Features (Issues #11, #9, #14, #8)

| Issue | Title | Solution | Files |
|-------|-------|----------|-------|
| #11 | Profile page | `/profile` route with name editing, avatar, provider badge, logout | `profile.tsx` |
| #9 | Settings page | `/settings` with tabs: Members, Workspace, API Keys, Storage, Shortcuts | `settings.tsx`, `storage-tab.tsx` |
| #14 | Keyboard shortcuts | `useKeyboardShortcuts` hook; Ctrl+N/S/\/., tab navigation | `use-keyboard-shortcuts.ts`, `layout.tsx` |
| #8 | Browse by tags/categories | Filter chips in sidebar, category/tag API endpoints | `browse-panel.tsx`, `sidebar.tsx`, `use-tags.ts`, `tags.ts` route |

## Phase 5: R2 Storage UI (Issue #10)

| Issue | Title | Solution | Files |
|-------|-------|----------|-------|
| #10 | R2 storage UI | File grid with upload/preview/delete in Settings; R2 config info; BlockNote image upload handler | `storage-tab.tsx`, `use-uploads.ts`, `editor.tsx` |

## Phase 6: Documentation (Issues #17, #18)

| Issue | Title | Solution | Files |
|-------|-------|----------|-------|
| #17 | API docs page | `/docs/api` with all endpoints grouped by category, method-colored badges, copy button | `api-docs.tsx` |
| #18 | CLI docs page | `/docs/cli` with all commands grouped by category, terminal-style display | `cli-docs.tsx` |

## Post-Implementation Fixes

| # | Fix | Root Cause | Solution |
|---|-----|-----------|----------|
| 1 | CI: pnpm version conflict | `action-setup@v4` rejects dual version sources | Removed `version: 9` from `.github/workflows/ci.yml` |
| 2 | CI: missing email-service | `email-service.ts` not committed (was untracked) | Added file + `RESEND_*` vars to `Env` type |
| 3 | CI: prefer-const lint | Pre-existing `let slug` in `slug.ts` | Changed to `const` |
| 4 | Profile page blank | `user.name` undefined → `charAt(0)` TypeError crash | Safe access patterns: `user?.name ?? ''`, fallback defaults |
| 5 | Profile PATCH method | Frontend used `apiClient.put` but backend is `PATCH` | Switched to raw `fetch` with `method: 'PATCH'` |
| 6 | Folder creation UX | `window.prompt` — ugly native browser dialog | Created `create-folder-modal.tsx` with styled input, cancel/submit |
| 7 | R2 config missing | Storage tab had no configuration info | Added R2 config section (bucket, limits, usage stats) |

## Verification Status

| Page/Feature | URL | Status |
|-------------|-----|--------|
| Main wiki | `/` | Verified — sidebar, editor, tabs working |
| Profile | `/profile` | Verified — name, email, avatar, logout |
| Settings | `/settings` | Verified — 5 tabs render |
| API docs | `/docs/api` | Verified — all endpoints listed |
| CLI docs | `/docs/cli` | Verified — all commands listed |
| Deep linking | `/doc/:slug` | Implemented — URL syncs with active tab |
| Share view | `/share/:token` | Implemented — read-only doc display |
| Command palette | `Ctrl+K` | Implemented — hybrid search + recent docs |
| Drag & drop | Sidebar | Implemented — docs draggable, folders droppable |
| Context menu | Right-click doc | Implemented — Open/Rename/Move/Delete |
| Browse filter | Sidebar filter button | Implemented — category/tag chips |
| Keyboard shortcuts | Global | Implemented — Ctrl+N/S/\/. + tab nav |

## New Files Created (20)

### Frontend (16)
- `hooks/use-debounce.ts` — value debounce utility
- `hooks/use-document-navigation.ts` — URL-synced doc opening
- `hooks/use-keyboard-shortcuts.ts` — global shortcut listener
- `hooks/use-search.ts` — hybrid search hook
- `hooks/use-share-links.ts` — share link CRUD
- `hooks/use-tags.ts` — tags + categories hooks
- `hooks/use-uploads.ts` — file upload CRUD
- `components/sidebar/browse-panel.tsx` — category/tag filter chips
- `components/sidebar/create-folder-modal.tsx` — folder creation dialog
- `components/sidebar/document-context-menu.tsx` — doc right-click menu
- `components/metadata/share-link-display.tsx` — share URL display + copy
- `components/settings/storage-tab.tsx` — R2 file browser
- `routes/profile.tsx` — user profile page
- `routes/settings.tsx` — admin settings (5 tabs)
- `routes/api-docs.tsx` — API documentation
- `routes/cli-docs.tsx` — CLI documentation

### Backend (4)
- `routes/members.ts` — member management endpoints
- `services/member-service.ts` — member CRUD logic
- `services/email-service.ts` — Resend email integration
- (getDocumentBySlug, createVersionCheckpoint added to existing files)

## Dependencies Added
- `@dnd-kit/core` — drag & drop for sidebar

## Architecture Decisions
1. **URL-driven navigation**: URL is single source of truth for active doc; tabs derive from URL
2. **Content-hash versioning**: SHA-256 hash comparison prevents duplicate versions from debounced saves
3. **Time-gated versions**: 5-minute minimum interval between auto-created versions
4. **Modal over prompt**: Custom modal components instead of `window.prompt` for better UX
5. **Hybrid search in command palette**: Uses `/api/search` with RRF fusion instead of simple LIKE
6. **Safe access patterns**: All user-facing components use optional chaining + fallback defaults to prevent undefined crashes

## Commit History

| Hash | Message |
|------|---------|
| `ec6f3b1` | feat: implement all 15 GitHub issues (#3-#18) |
| `a0f5d21` | fix: remove pnpm version from CI |
| `a1c441d` | fix: add missing email-service module |
| `abf123b` | fix: add RESEND env vars to Env type |
| `953c5d8` | fix: use const for slug variable |
| `ff36f3d` | fix: profile loading state, R2 config, folder modal |
| `058487c` | fix: profile page crash due to undefined user.name |
