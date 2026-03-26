---
phase: 2
priority: high
status: pending
effort: small
---

# Phase 2: Error Handling + Deploy

## Context

- `trigramSearch` has NO try-catch — any D1 error crashes the whole request
- `fts5Search` and `semanticSearch` already have try-catch with graceful fallback
- Both `search_trigrams` and `documents_fts` tables are empty (0 rows indexed)

## Implementation Steps

- [ ] Add try-catch to `trigramSearch` matching `fts5Search` pattern (return `[]` on error, console.error)
- [ ] Add try-catch around `searchDocuments` main flow for defense-in-depth
- [ ] Type-check: `pnpm --filter @agentwiki/api exec tsc --noEmit`
- [ ] Deploy: `pnpm --filter @agentwiki/api run deploy` (or `npx wrangler deploy -c packages/api/wrangler.toml`)
- [ ] Verify: `curl "https://api.agentwiki.cc/api/search?q=test&type=keyword"` returns 200
- [ ] Verify: `npx tsx packages/cli/src/index.ts doc search "test"` works
- [ ] Also deploy `/auth/me` fix from earlier (API key support)

## Files to Modify

- `packages/api/src/services/trigram-service.ts` — wrap `trigramSearch` in try-catch
- `packages/api/src/routes/auth.ts` — already fixed (authGuard on /me)

## Notes

Search will return empty results until trigram indexing runs for existing documents. That's expected — empty results ≠ 500 error.

## Risk

Low — adding error handling is safe. Deploy includes the auth/me fix too.
