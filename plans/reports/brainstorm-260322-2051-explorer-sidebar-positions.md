# Brainstorm: Explorer Sidebar Positions & Sorting

**Issue:** [#29 — Save item/folder positions of the Explorer](https://github.com/digitopvn/agentwiki/issues/29)
**Date:** 2026-03-22
**Status:** Approved — proceeding to plan

---

## Problem Statement

Explorer sidebar lacks:
1. Drag & drop reorder for folders and documents
2. Sort options (name, date) with manual sort fallback
3. Recent modifications visibility

Current state: DnD exists only for moving docs into folders. No reordering. Folders have `position` field (all default 0). Documents have no `position` field.

## Requirements (Confirmed)

| Requirement | Decision |
|-------------|----------|
| DnD scope | Both folders + documents |
| Item ordering | Folders first, docs after (per level) |
| Sort modes | Manual (position), Name (A-Z/Z-A), Date (ASC/DESC) |
| Sort storage | Per-user, server-side |
| Recent modifications | Separate collapsible section at top |
| Position persistence | Server (DB) |

## Chosen Approach

### 1. Fractional Indexing for Positions

Use string-based fractional indexing (`fractional-indexing` library) for `position` field.

**Why over integer approach:**
- O(1) write per reorder (update only moved item)
- No sibling reindexing needed
- Better for concurrent edits
- Documents get new field, clean start

**DB changes:**
- `documents`: add `position TEXT DEFAULT 'a0'`
- `folders`: convert `position INTEGER` → `TEXT` (or add `positionStr TEXT`, deprecate old)

### 2. User Preferences Table

New `user_preferences` table for sort settings (reusable for future prefs).

```
user_preferences:
  id TEXT PK
  userId TEXT FK → users
  tenantId TEXT FK → tenants
  key TEXT
  value TEXT
  updatedAt INTEGER
  UNIQUE(userId, tenantId, key)
```

Sort preference stored as: `key=sidebar_sort, value=JSON{mode,direction}`

### 3. Recent Modifications Section

- Collapsible section above folder tree
- Shows 5-10 most recently updated documents
- Uses existing documents query with `sort=updatedAt&limit=10`
- Click navigates to document

## API Changes

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `PATCH /api/reorder` | PATCH | Reorder items: `{type, id, parentId, afterId?, beforeId?}` → compute fractional position |
| `GET /api/preferences` | GET | Get user preferences for current tenant |
| `PUT /api/preferences` | PUT | Set preference: `{key, value}` |
| `GET /api/documents?sort=updatedAt&order=desc&limit=10` | GET | Recent docs (reuse existing) |

## Frontend Changes

| Component | Change |
|-----------|--------|
| `folder-tree.tsx` | Add `SortableContext` from `@dnd-kit/sortable` for folder + doc reordering |
| `folder-node.tsx` | Make sortable, handle nested sortable contexts |
| New: `recent-documents.tsx` | Collapsible recent section |
| New: `sort-controls.tsx` | Sort mode dropdown with ASC/DESC toggle |
| `sidebar.tsx` | Integrate sort controls + recent section |
| Hooks | `usePreferences()`, `useRecentDocuments()`, update `useReorder()` |

## Implementation Phases

1. **DB Migration** — Add `position` to documents, user_preferences table
2. **API** — Reorder endpoint, preferences CRUD, folder tree sort support
3. **Frontend DnD** — Upgrade @dnd-kit with sortable, implement reorder logic
4. **Sort Controls** — UI + preference persistence
5. **Recent Section** — Component + query
6. **Testing** — E2E drag-drop, sort modes, persistence

## Risks

| Risk | Mitigation |
|------|------------|
| D1 SQLite text position ordering | Fractional indexing produces lexicographically sortable strings |
| DnD complexity with nested sortable | Use `@dnd-kit/sortable` nested containers pattern |
| Folders position migration | Backfill existing folders with sequential fractional positions |
| Concurrent reorder conflicts | Fractional indexing inherently handles — no shared counter |

## Success Criteria

- [ ] Drag folders to reorder within same parent
- [ ] Drag documents to reorder within same folder/root
- [ ] Drag documents between folders (existing feature preserved)
- [ ] Sort by name (A-Z, Z-A) works for folders + docs
- [ ] Sort by date (newest/oldest) works
- [ ] Switch back to manual sort restores saved positions
- [ ] Sort preference persists across sessions (server)
- [ ] Recent modifications section shows 10 latest docs
- [ ] All existing DnD (move doc to folder) still works
