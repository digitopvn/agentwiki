---
status: completed
priority: high
branch: claude/thirsty-panini
blockedBy: []
blocks: []
---

# Fix Search Endpoint 500 Error

## Problem

`GET /api/search?type=keyword` and `?type=hybrid` crash with 500.

**Root cause:** `D1_ERROR: no such column: rawScore at offset 386: SQLITE_ERROR`

In `packages/api/src/services/trigram-service.ts:123`, the `orderBy` clause references `rawScore` as a raw SQL string, but D1/SQLite doesn't recognize it because Drizzle's column alias isn't available inside `sql` template literals.

```ts
// BUG: "rawScore" is a Drizzle alias, not a real SQL column
.orderBy(sql`COUNT(DISTINCT ${searchTrigrams.trigram}) DESC, rawScore DESC`)
```

**Secondary issues:**
- `trigramSearch` has no try-catch (unlike `fts5Search` and `semanticSearch`)
- `search_trigrams` and `documents_fts` tables are empty (no documents indexed)

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Fix trigram ORDER BY bug | completed | [phase-01](./phase-01-fix-trigram-orderby.md) |
| 2 | Add error handling + deploy | completed | [phase-02](./phase-02-error-handling-deploy.md) |

## Success Criteria

- `agentwiki doc search "test"` returns 200 (not 500)
- All search types work: `keyword`, `semantic`, `hybrid`
- Error handling prevents future unhandled crashes
