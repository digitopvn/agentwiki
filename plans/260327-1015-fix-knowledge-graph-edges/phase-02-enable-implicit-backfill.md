# Phase 2: Enable Implicit Edges + Backfill Endpoint

## Context

- [graph-toolbar.tsx](../../packages/web/src/components/graph/graph-toolbar.tsx) — implicit toggle default
- [graph.ts](../../packages/api/src/routes/graph.ts) — graph API routes
- [document-service.ts](../../packages/api/src/services/document-service.ts) — `syncWikilinks()`

## Overview

- **Priority:** P2
- **Status:** Pending
- **Effort:** 0.5h

## Implementation Steps

### Step 1: Default implicit edges to ON

File: `packages/web/src/components/graph/graph-toolbar.tsx`, line 52

Change:
```typescript
checked={filters.includeImplicit ?? false}
```
To:
```typescript
checked={filters.includeImplicit ?? true}
```

Also update the initial query param in `useGraphData` hook — check if it passes `include_implicit` correctly when `includeImplicit` is undefined (defaults to true now).

### Step 2: Add backfill endpoint to graph.ts

Add admin-only POST endpoint to `packages/api/src/routes/graph.ts`:

```typescript
/** Backfill edges for all existing documents (admin-only) */
graphRouter.post('/backfill-edges', requirePermission('admin'), async (c) => {
  try {
    const { tenantId } = c.get('auth')
    const db = drizzle(c.env.DB)

    // Get all non-deleted documents with content
    const docs = await db
      .select({ id: documents.id, content: documents.content })
      .from(documents)
      .where(and(eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))

    let edgesCreated = 0
    for (const doc of docs) {
      if (!doc.content) continue
      await syncWikilinks(db, doc.id, doc.content, tenantId)
      // Count edges after sync
      const count = await db
        .select({ count: sql<number>`count(*)` })
        .from(documentLinks)
        .where(eq(documentLinks.sourceDocId, doc.id))
      edgesCreated += count[0]?.count ?? 0
    }

    return c.json({ ok: true, documentsProcessed: docs.length, edgesCreated })
  } catch (err) {
    console.error('Backfill error:', err)
    return c.json({ error: 'Failed to backfill edges' }, 500)
  }
})
```

**Important:** `syncWikilinks` is currently a private function in `document-service.ts`. Must export it.

### Step 3: Export `syncWikilinks` from document-service.ts

Change line 511 from:
```typescript
async function syncWikilinks(
```
To:
```typescript
export async function syncWikilinks(
```

Add import in `graph.ts`:
```typescript
import { syncWikilinks } from '../services/document-service'
```

Also import required schema/ORM items:
```typescript
import { documents, documentLinks } from '../db/schema'
import { isNull, sql } from 'drizzle-orm'
```

Note: `eq`, `and` already imported in graph.ts. Check for `isNull` and `sql` — add if missing.

## TODO

- [ ] Change `includeImplicit` default from `false` to `true` in graph-toolbar.tsx
- [ ] Export `syncWikilinks` from document-service.ts
- [ ] Add `POST /api/graph/backfill-edges` route in graph.ts (admin-only)
- [ ] Import `syncWikilinks`, `documents`, `documentLinks`, `isNull`, `sql` in graph.ts
- [ ] Run `pnpm type-check` and `pnpm lint`

## Success Criteria

- Graph page loads with similarity edges visible by default
- `POST /api/graph/backfill-edges` re-syncs all document edges and returns count
- Endpoint restricted to admin role

## Risk Assessment

- **Backfill on large tenants** could be slow (sequential per-doc). Acceptable for admin-only one-shot. Could batch later if needed (YAGNI).
- **Exporting `syncWikilinks`** is safe — it's pure DB logic with no side effects beyond inserts.

## Security Considerations

- Backfill endpoint requires `admin` permission via `requirePermission('admin')`
- No user input beyond auth context
