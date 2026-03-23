# Code Review: Explorer Sidebar Positions, Sorting & Recent Modifications

**Issue:** #29
**Branch:** claude/objective-herschel
**Reviewer:** code-reviewer
**Date:** 2026-03-22

## Scope

- Files: 20 modified/new + migration + lockfile
- LOC changed: ~700 net additions
- Focus: security (tenant isolation), correctness (fractional indexing), DnD, performance, edge cases

## Overall Assessment

Solid feature implementation. Clean separation of concerns, proper auth guards, tenant isolation via `tenantId` in all queries. Fractional indexing approach is correct. A few issues range from **critical** to **low** severity.

---

## Critical Issues

### C1. Preference upsert has a TOCTOU race condition

**File:** `packages/api/src/services/preference-service.ts:37-61`

The `setPreference` function does SELECT then conditionally INSERT or UPDATE. Two concurrent requests for the same key could both see "not exists" and both INSERT, causing a unique constraint violation (500 error).

**Fix:** Use SQLite `INSERT ... ON CONFLICT ... DO UPDATE` (Drizzle's `onConflictDoUpdate`):

```ts
await db.insert(userPreferences).values({
  id: generateId(),
  userId,
  tenantId,
  key,
  value,
  updatedAt: now,
}).onConflictDoUpdate({
  target: [userPreferences.userId, userPreferences.tenantId, userPreferences.key],
  set: { value, updatedAt: now },
})
```

This eliminates the race and reduces from 2 queries to 1.

### C2. Preference `key` param is not validated -- arbitrary key injection

**File:** `packages/api/src/routes/preferences.ts:23-28`

The `:key` route param is taken directly from the URL with no validation. A user could store arbitrary keys (including very long strings, special chars, etc.) in the preferences table.

**Fix:** Add a Zod schema or regex allowlist for preference keys:

```ts
const VALID_KEY = /^[a-z_]{1,64}$/
const key = c.req.param('key')
if (!VALID_KEY.test(key)) return c.json({ error: 'Invalid preference key' }, 400)
```

---

## High Priority

### H1. Sort/order query params not validated -- potential SQL sort injection

**File:** `packages/api/src/services/document-service.ts:204-208`

The `sort` and `order` filter values come directly from query params without validation. While the current code uses a whitelist-style ternary (falls through to `updatedAt`/`desc` for unknown values), any future refactor that passes these to dynamic SQL would be risky. The `order` param in particular accepts any string.

**Recommendation:** Validate at the route level:

```ts
const sort = z.enum(['position', 'title', 'updatedAt']).optional().parse(c.req.query('sort'))
const order = z.enum(['asc', 'desc']).optional().parse(c.req.query('order'))
```

### H2. FolderNode makes a `useDocuments` query per folder -- N+1 query pattern

**File:** `packages/web/src/components/sidebar/folder-node.tsx:75`

Each `FolderNode` calls `useDocuments({ folderId: folder.id })`. With 50 folders, that is 50 separate API calls on sidebar mount.

**Impact:** Slow sidebar load for workspaces with many folders; excessive network traffic.

**Fix options:**
1. Fetch all documents once at `FolderTree` level (already done for root docs), group by `folderId`, pass down
2. Or batch endpoint that returns docs grouped by folder

### H3. Reorder endpoint does not verify item ownership / existence

**File:** `packages/api/src/services/reorder-service.ts:56-63`

If `afterId` or `beforeId` references a nonexistent item (deleted, wrong tenant), the select returns `null`, and `generateKeyBetween(null, null)` returns `"a0"`. The reorder silently succeeds but places the item at position `"a0"` (start), which is unexpected behavior.

Similarly, the UPDATE at line 59 silently succeeds even if the item `id` doesn't exist or belongs to a different tenant (0 rows updated).

**Fix:** Check that the UPDATE affected 1 row. If not, return 404. Also consider validating that `afterId`/`beforeId` are in the same parent container.

---

## Medium Priority

### M1. Unused import: `AnySQLiteColumn`

**File:** `packages/api/src/db/schema.ts:1`

`type AnySQLiteColumn` is imported but never used.

### M2. Unused dependency: `fractional-indexing` in web package

**File:** `packages/web/package.json`

`fractional-indexing` was added to web dependencies but is never imported in any frontend file. All fractional index computation happens server-side.

### M3. `visibleDocs` in useMemo dependency array is unstable

**File:** `packages/web/src/components/sidebar/folder-node.tsx:153-167`

`sortedDocs` depends on `visibleDocs` which is a new array reference every render (created by `.filter()` at line 134). This means `sortedDocs` recalculates every render regardless of actual data changes. Should memoize `visibleDocs` too, or derive both in a single `useMemo`.

### M4. `allRootDocs` is also unstable in sortedRootDocs dependency

**File:** `packages/web/src/components/sidebar/folder-tree.tsx:90`

Same issue: `allRootDocs` is computed inline (filter), causing `sortedRootDocs` useMemo to recompute every render. Wrap `allRootDocs` in its own `useMemo`.

### M5. Missing error handling in reorder route

**File:** `packages/api/src/routes/reorder.ts:17-22`

No try/catch. If `generateKeyBetween` throws (e.g., afterPosition >= beforePosition), the error propagates as an unhandled 500. Should catch and return 400 with a user-friendly message.

### M6. `@dnd-kit/sortable` v10 with `@dnd-kit/core` v6

**File:** `packages/web/package.json`

Major version gap between sortable (v10) and core (v6). Build passes and pnpm resolves it, but this is unusual. Verify intended -- dnd-kit v10 may have breaking changes that surface at runtime. Consider aligning versions.

---

## Low Priority

### L1. Duplicate sort logic across FolderTree and FolderNode

Sort comparison functions (name, date) are duplicated in `folder-tree.tsx` and `folder-node.tsx`. Extract to a shared utility.

### L2. RootDropZone always visible

**File:** `packages/web/src/components/sidebar/folder-tree.tsx:315-333`

The root drop zone renders even when not in manual sort mode (DnD disabled). It's invisible but takes DOM space with `\u00A0`.

### L3. `position: integer` column still exists on folders

The old `position: integer` column is kept alongside `positionIndex: text`. Migration doesn't remove it. Consider deprecating the old column in a follow-up migration.

---

## Positive Observations

1. **Tenant isolation is consistently applied** -- all DB queries filter by `tenantId` from auth context
2. **Auth guards and permissions** properly set on both new routes
3. **Fractional indexing** approach is correct and scalable -- avoids full-list reindex
4. **Sort controls** cleanly separated with sensible defaults (date=desc, name=asc)
5. **Recent documents** has graceful localStorage fallback and empty state handling
6. **Zod validation** on reorder and preference schemas at the shared layer
7. **DragOverlay** provides good visual feedback during drag operations

---

## Recommended Actions (Priority Order)

1. **[Critical]** Replace preference upsert with `onConflictDoUpdate` (C1)
2. **[Critical]** Validate preference key parameter (C2)
3. **[High]** Validate sort/order params with Zod at route level (H1)
4. **[High]** Address N+1 document queries in folder nodes (H2)
5. **[High]** Verify reorder UPDATE affected rows, return 404 if not (H3)
6. **[Medium]** Remove unused `AnySQLiteColumn` import (M1)
7. **[Medium]** Remove `fractional-indexing` from web deps (M2)
8. **[Medium]** Memoize `visibleDocs`/`allRootDocs` properly (M3, M4)
9. **[Medium]** Add try/catch in reorder route for generateKeyBetween errors (M5)

---

## Metrics

- Type Coverage: passes (strict mode via tsconfig)
- Lint: 0 new errors, 4 pre-existing warnings
- Build: passes
- Test Coverage: not assessed (no new tests for reorder/preferences)

## Unresolved Questions

1. Is `@dnd-kit/sortable@10` intentionally paired with `@dnd-kit/core@6`? Should versions be aligned?
2. Should the old `folders.position` integer column be removed in this migration or a follow-up?
3. Are there plans for tests covering the reorder service (especially edge cases like concurrent reorders)?
