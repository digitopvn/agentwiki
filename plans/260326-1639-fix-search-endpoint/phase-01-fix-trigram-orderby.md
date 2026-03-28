---
phase: 1
priority: critical
status: pending
effort: small
---

# Phase 1: Fix Trigram ORDER BY Bug

## Context

- [trigram-service.ts](../../packages/api/src/services/trigram-service.ts) — lines 105-124
- Error log: `D1_ERROR: no such column: rawScore at offset 386: SQLITE_ERROR`

## Root Cause

Drizzle's `sql` template in `orderBy` references `rawScore` as a bare identifier. D1/SQLite doesn't resolve Drizzle column aliases inside raw SQL fragments.

```ts
// CURRENT (broken):
.orderBy(sql`COUNT(DISTINCT ${searchTrigrams.trigram}) DESC, rawScore DESC`)
```

SQLite allows ORDER BY with column aliases from SELECT, but Drizzle's `sql` template literal doesn't interpolate the alias — it passes "rawScore" as a literal string which D1 can't resolve.

## Fix

Replace the raw `rawScore` reference with the full `SUM(CASE...)` expression repeated in ORDER BY, OR use Drizzle's `desc()` helper with the select alias.

**Option A (simplest):** Use numeric column position:
```ts
.orderBy(sql`3 DESC, 4 DESC`)  // 3=matchedTrigrams, 4=rawScore by position
```

**Option B (explicit, preferred):** Repeat the expressions:
```ts
.orderBy(
  sql`COUNT(DISTINCT ${searchTrigrams.trigram}) DESC`,
  sql`SUM(CASE WHEN ${searchTrigrams.field} = 'title' THEN ${searchTrigrams.frequency} * 2 ELSE ${searchTrigrams.frequency} END) DESC`
)
```

**Option C (Drizzle-native):** Use `desc()` with the selected column reference. But Drizzle doesn't directly support ordering by computed `sql<>` aliases.

**Recommendation:** Option A (column position) — simplest, no duplication, standard SQL.

## Implementation Steps

- [ ] Fix `orderBy` in `trigramSearch` function (line 123)
- [ ] Type-check: `pnpm --filter @agentwiki/api exec tsc --noEmit`
- [ ] Verify fix works against production D1 via `wrangler tail` + curl test

## Files to Modify

- `packages/api/src/services/trigram-service.ts` — line 123

## Risk

Low — single-line fix in ORDER BY clause. No schema or data changes.
