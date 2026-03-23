---
phase: 5
title: "Testing & Polish"
status: completed
priority: P1
effort: 3h
---

# Phase 5: Testing & Polish

## Context
- All previous phases completed

## Overview

Verify all features work correctly, handle edge cases, ensure type safety across monorepo.

## Implementation Steps

### 1. Type-check & lint

```bash
pnpm type-check
pnpm lint
```

Fix any issues.

### 2. API endpoint testing

Test via curl or API client:

```bash
# Reorder: move folder to position between two siblings
curl -X PATCH /api/reorder -d '{"type":"folder","id":"f1","parentId":null,"afterId":"f0","beforeId":"f2"}'

# Reorder: move document to start of root
curl -X PATCH /api/reorder -d '{"type":"document","id":"d1","parentId":null}'

# Get preferences
curl GET /api/preferences

# Set sort preference
curl -X PUT /api/preferences/sidebar_sort -d '{"value":"{\"mode\":\"name\",\"direction\":\"asc\"}"}'
```

### 3. Manual DnD testing

- [ ] Create 5+ folders, drag to reorder. Reload — order preserved.
- [ ] Create 5+ docs in a folder, drag to reorder. Reload — order preserved.
- [ ] Drag doc from folder A to folder B — still works.
- [ ] Drag doc to root drop zone — still works.
- [ ] Drag doc between two docs in same folder — inserts correctly.
- [ ] Rapid successive drags — no race conditions.
- [ ] Switch to Name sort — items reorder alphabetically. DnD reorder disabled.
- [ ] Switch to Date sort — items reorder by date. Toggle ASC/DESC.
- [ ] Switch back to Manual — saved positions restored.
- [ ] Recent section shows correct docs, timestamps update.
- [ ] Collapse/expand recent section — state preserved.

### 4. Edge cases

- [ ] Empty folder tree — no errors
- [ ] Single item in folder — drag should work (no reorder needed, but no crash)
- [ ] Very long folder/doc names — truncation in drag overlay
- [ ] Create new doc — gets position at end of siblings
- [ ] Create new folder — gets position at end of siblings
- [ ] Delete folder with position — no orphaned positions
- [ ] Mobile: touch drag works with 8px activation threshold

### 5. Build verification

```bash
pnpm build
```

Ensure production build succeeds.

### 6. Migration dry-run

```bash
pnpm -F @agentwiki/api db:migrate        # Local
pnpm -F @agentwiki/api db:migrate:remote  # Production (after review)
```

## Todo

- [ ] Run type-check and fix errors
- [ ] Run lint and fix warnings
- [ ] Test reorder API endpoints
- [ ] Test preferences API endpoints
- [ ] Manual DnD testing (folders, docs, cross-folder)
- [ ] Test all sort modes (manual, name, date) with ASC/DESC
- [ ] Test recent modifications section
- [ ] Test edge cases (empty, single item, long names)
- [ ] Verify production build
- [ ] Test migration on local D1

## Success Criteria

All items from brainstorm success criteria:
- [ ] Drag folders to reorder within same parent
- [ ] Drag documents to reorder within same folder/root
- [ ] Drag documents between folders (existing feature preserved)
- [ ] Sort by name (A-Z, Z-A) works for folders + docs
- [ ] Sort by date (newest/oldest) works
- [ ] Switch back to manual sort restores saved positions
- [ ] Sort preference persists across sessions (server)
- [ ] Recent modifications section shows 10 latest docs
- [ ] All existing DnD (move doc to folder) still works
- [ ] Production build succeeds
- [ ] No TypeScript errors
