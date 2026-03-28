---
phase: 1
title: Settings Tab Deeplinking
priority: high
status: completed
effort: S
---

# Phase 1: Settings Tab Deeplinking

## Context Links
- [plan.md](./plan.md)
- [Issue #57](https://github.com/digitopvn/agentwiki/issues/57)
- Route: `packages/web/src/routes/settings.tsx`
- App router: `packages/web/src/app.tsx:117`

## Overview

Currently `activeTab` is `useState('members')` — state lost on refresh, no bookmarkable URLs. Need to sync tab state with URL search param `?tab=<id>`.

## Key Insights

- `react-router-dom` already imported in settings.tsx (for `useNavigate`)
- `useSearchParams` available from same package — zero new deps
- Route is `/settings` (no sub-routes), query param approach cleanest
- All 7 tab IDs already typed as `TabId` union

## Requirements

**Functional:**
- URL reflects active tab: `/settings?tab=members`, `/settings?tab=ai`, etc.
- Direct navigation to `/settings?tab=api-keys` opens correct tab
- Invalid/missing `?tab` defaults to `members`
- Tab changes update URL without full page navigation (replace, not push)

**Non-functional:**
- No flash of wrong tab on initial load
- Back/forward browser navigation works

## Architecture

```
URL ?tab=xxx  ←→  useSearchParams()  ←→  activeTab state
                     ↕ (on tab click: setSearchParams)
                     ↕ (on load: read searchParams)
```

## Related Code Files

**Modify:**
- `packages/web/src/routes/settings.tsx` — replace `useState` with `useSearchParams`

## Implementation Steps

1. Import `useSearchParams` from `react-router-dom`
2. Replace `useState<TabId>('members')` with derived state from `searchParams.get('tab')`
3. Validate tab param against `TABS` array — fallback to `'members'`
4. On tab click: `setSearchParams({ tab: id }, { replace: true })` instead of `setActiveTab(id)`
5. Remove `useState` for `activeTab`

**Pseudocode:**
```tsx
const [searchParams, setSearchParams] = useSearchParams()
const rawTab = searchParams.get('tab')
const activeTab: TabId = TABS.some(t => t.id === rawTab)
  ? (rawTab as TabId)
  : 'members'

// Tab click handler:
onClick={() => setSearchParams({ tab: id }, { replace: true })}
```

## Todo

- [x] Replace useState with useSearchParams
- [x] Validate tab param against TABS array
- [x] Update tab click handler
- [x] Test: direct URL navigation, refresh persistence, back/forward

## Success Criteria

- `/settings?tab=ai` opens AI tab directly
- Refresh preserves active tab
- Invalid `?tab=xyz` falls back to Members
- `pnpm type-check` passes

## Risk Assessment

- **Low risk**: Isolated change, no backend, no new deps
- Only concern: ensure `replace: true` so tab switches don't pollute browser history
