# Phase 3: Build & Verify

**Priority:** P0
**Status:** pending
**Depends on:** Phase 1, Phase 2

## Overview

Type-check, lint, build all packages. Verify accuracy flows end-to-end.

## Steps

- [ ] Run `pnpm type-check` — fix any type errors
- [ ] Run `pnpm lint` — fix any lint issues
- [ ] Run `pnpm build` — verify production build succeeds
- [ ] Run `pnpm test` — verify existing tests pass
- [ ] Manual verification: confirm `accuracy` field appears in API response
- [ ] Manual verification: confirm badge renders in command palette UI

## Success Criteria

- All type-check, lint, build, test pass
- No regressions in existing search functionality
- `accuracy` field present in search API response
- Badge visible in command palette
