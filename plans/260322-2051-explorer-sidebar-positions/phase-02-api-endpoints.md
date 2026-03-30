---
phase: 2
title: "API: Reorder & Preferences Endpoints"
status: completed
priority: P0
effort: 5h
---

# Phase 2: API — Reorder & Preferences Endpoints

## Context
- [Phase 1: DB Migration](./phase-01-db-migration.md)
- [Folder routes](../../packages/api/src/routes/folders.ts)
- [Document routes](../../packages/api/src/routes/documents.ts)
- [Folder service](../../packages/api/src/services/folder-service.ts)
- [Document service](../../packages/api/src/services/document-service.ts)

## Overview

3 new API capabilities:
1. **Reorder endpoint** — compute fractional position for moved item
2. **Preferences CRUD** — get/set per-user preferences
3. **Folder tree with doc positions** — return position data in folder tree response

## Requirements

### Functional
- `PATCH /api/reorder` — reorder a folder or document within its parent
- `GET /api/preferences` — get all preferences for current user+tenant
- `PUT /api/preferences/:key` — upsert a single preference
- Folder tree response includes document positions
- Documents list supports `sort=position` param

### Non-functional
- Reorder must be O(1) — single row update via fractional indexing
- Preferences must be tenant-scoped (user sees different prefs per workspace)

## Related Code Files

### Modify
- `packages/api/src/routes/folders.ts` — Update folder tree to include doc positions
- `packages/api/src/routes/documents.ts` — Add sort param support
- `packages/api/src/services/folder-service.ts` — Use positionIndex, compute positions for new folders
- `packages/api/src/services/document-service.ts` — Include position in queries, compute position on create

### Create
- `packages/api/src/services/reorder-service.ts` — Fractional indexing logic
- `packages/api/src/services/preference-service.ts` — User preferences CRUD
- `packages/api/src/routes/reorder.ts` — Reorder route handler
- `packages/api/src/routes/preferences.ts` — Preferences route handlers

### Register routes
- `packages/api/src/index.ts` — Mount new routers

## Implementation Steps

### 1. Create reorder-service.ts

Core function: given item type, id, parentId, and neighbors (beforeId, afterId), compute new fractional position.

```typescript
import { generateKeyBetween } from 'fractional-indexing'

export async function reorderItem(
  env: Env,
  tenantId: string,
  input: { type: 'folder' | 'document'; id: string; parentId: string | null; afterId?: string; beforeId?: string },
) {
  // 1. Get position of afterId item (or null if first)
  // 2. Get position of beforeId item (or null if last)
  // 3. Compute new position = generateKeyBetween(afterPosition, beforePosition)
  // 4. Update the item's position
}
```

**Position computation logic:**
- Moving to **start**: `generateKeyBetween(null, firstSiblingPosition)`
- Moving to **end**: `generateKeyBetween(lastSiblingPosition, null)`
- Moving **between** two items: `generateKeyBetween(afterPosition, beforePosition)`

Query siblings: for folders, query by `parentId` + `tenantId`. For documents, query by `folderId` + `tenantId`.

### 2. Create preference-service.ts

```typescript
export async function getPreferences(env: Env, userId: string, tenantId: string)
  // SELECT * FROM user_preferences WHERE userId = ? AND tenantId = ?

export async function setPreference(env: Env, userId: string, tenantId: string, key: string, value: string)
  // INSERT OR REPLACE INTO user_preferences ...
```

### 3. Create reorder route (`packages/api/src/routes/reorder.ts`)

```
PATCH /api/reorder
Body: { type: 'folder'|'document', id: string, parentId: string|null, afterId?: string, beforeId?: string }
Response: { id, position }
```

Auth: `requirePermission('doc:update')` — reordering items requires edit access.

### 4. Create preferences routes (`packages/api/src/routes/preferences.ts`)

```
GET  /api/preferences          → { preferences: Record<string, string> }
PUT  /api/preferences/:key     → { ok: true }
Body: { value: string }
```

Auth: `authGuard` only (any authenticated user can set their own prefs).

### 5. Update folder-service.ts

**`getFolderTree`**: Change orderBy to `positionIndex`, also return documents per folder with positions:
- Currently folder tree doesn't include docs — docs fetched separately per folder via `useDocuments({ folderId })`
- Option A: Keep current approach, just ensure doc list endpoint returns position-ordered data
- Option B: Include lightweight doc list in folder tree response

**Recommendation: Option A** — less change, folder tree stays lightweight. Documents already fetched per-folder by the frontend.

**`createFolder`**: When creating a new folder, compute position as last item among siblings:
```typescript
const siblings = await db.select({ positionIndex: folders.positionIndex })
  .from(folders)
  .where(and(eq(folders.tenantId, tenantId), parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId)))
  .orderBy(desc(folders.positionIndex))
  .limit(1)

const lastPosition = siblings[0]?.positionIndex ?? null
const newPosition = generateKeyBetween(lastPosition, null)
```

### 6. Update document-service.ts

**`createDocument`**: Compute position as last among siblings in same folder:
```typescript
const siblings = await db.select({ position: documents.position })
  .from(documents)
  .where(and(
    eq(documents.tenantId, tenantId),
    input.folderId ? eq(documents.folderId, input.folderId) : isNull(documents.folderId),
    isNull(documents.deletedAt),
  ))
  .orderBy(desc(documents.position))
  .limit(1)

const newPosition = generateKeyBetween(siblings[0]?.position ?? null, null)
```

**`listDocuments`**: Add sort param support:
- `sort=updatedAt` (default, current behavior)
- `sort=position` — order by position ASC
- `sort=title` — order by title ASC/DESC
- `order=asc|desc`

### 7. Register routes in index.ts

```typescript
import { reorderRouter } from './routes/reorder'
import { preferencesRouter } from './routes/preferences'

app.route('/api/reorder', reorderRouter)
app.route('/api/preferences', preferencesRouter)
```

## Todo

- [ ] Create `reorder-service.ts` with fractional indexing logic
- [ ] Create `preference-service.ts` CRUD
- [ ] Create `reorder.ts` route handler
- [ ] Create `preferences.ts` route handlers
- [ ] Update `folder-service.ts` — use positionIndex, compute position on create
- [ ] Update `document-service.ts` — include position, compute on create, add sort param
- [ ] Register new routes in `index.ts`
- [ ] Update shared schemas — add `reorderItemSchema`, `preferenceSchema`
- [ ] Run `pnpm type-check` across all packages

## Success Criteria

- [ ] `PATCH /api/reorder` correctly computes fractional positions
- [ ] Moving item to start/end/between works
- [ ] `GET /api/preferences` returns user preferences
- [ ] `PUT /api/preferences/:key` upserts correctly
- [ ] Documents list supports sort=position
- [ ] New folders/docs get appended position
- [ ] Type-check passes

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Fractional key collision | Library handles — keys are unique by construction |
| Position string growth | After ~1000 reorders in same spot, strings get long. Add periodic compaction if needed (YAGNI for now) |
| Race condition on concurrent reorder | Fractional indexing: two concurrent inserts between same items produce different valid positions |

## Security Considerations

- Reorder requires `doc:update` permission
- Preferences scoped to (userId, tenantId) — no cross-tenant leakage
- Validate input IDs belong to tenant before updating
