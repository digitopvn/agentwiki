---
phase: 3
status: pending
priority: medium
---

# Phase 3: Build & Test

## Overview

Verify compilation, run existing tests, validate no regressions.

## Steps

1. Run `pnpm build` from monorepo root — verify all packages compile
2. Run `pnpm lint` — fix any lint issues
3. Manual validation checklist:
   - `syncWikilinks` delete only targets `inferred=0`
   - `autoLinkFromSimilarities` creates bidirectional links
   - `auto-link-similarities` queue case exists and chains correctly
   - `backfill-auto-links` endpoint is admin-protected
4. Run existing test suites if available

## Todo

- [ ] Build passes
- [ ] Lint passes
- [ ] No type errors
- [ ] Manual code review of changes

## Success Criteria

- Clean build across all packages
- No regressions in existing functionality
- All new code follows existing patterns
