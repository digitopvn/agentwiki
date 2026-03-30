# Code Review: MCP Connection Guide Modal

**Date:** 2026-03-29 | **Reviewer:** code-reviewer | **Status:** DONE_WITH_CONCERNS

## Scope
- `packages/web/src/components/sidebar/mcp-guide-modal.tsx` (NEW, 197 LOC)
- `packages/web/src/components/layout/sidebar.tsx` (MODIFIED, +10 LOC)

## Overall Assessment

Clean implementation that follows existing codebase patterns well. The modal structure, theme handling, and Tailwind classes are consistent with `create-folder-modal.tsx`. A few medium-priority issues around error handling and accessibility.

## Critical Issues

None.

## High Priority

### 1. Clipboard API — unhandled rejection
`handleCopy` uses `await navigator.clipboard.writeText()` without try/catch. This API throws when:
- Page not served over HTTPS (dev environments)
- User denies clipboard permission
- Browser lacks Clipboard API support (older mobile browsers)

Other codebase usages (e.g. `api-docs.tsx:154`, `share-link-display.tsx:39`) also lack error handling — this is a codebase-wide pattern debt, but new code should not repeat it.

**Fix:**
```tsx
const handleCopy = async () => {
  try {
    await navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  } catch {
    // Fallback or silent fail — user sees no checkmark
    console.warn('Clipboard write failed')
  }
}
```

## Medium Priority

### 2. Missing keyboard dismiss (Escape key)
Neither this modal nor `create-folder-modal` handles Escape key to close. This is a codebase-wide gap, but worth noting for accessibility. Users expect modals to close on Escape.

**Suggested improvement (for both modals):**
```tsx
useEffect(() => {
  if (!open) return
  const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
  document.addEventListener('keydown', handler)
  return () => document.removeEventListener('keydown', handler)
}, [open, onClose])
```

### 3. Missing ARIA attributes
Modal lacks `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`. Same gap exists in `create-folder-modal`. Screen readers won't announce this as a dialog.

### 4. macOS-only config path for Claude Desktop
`configPath` for Claude Desktop is `~/Library/Application Support/Claude/claude_desktop_config.json` — this is macOS-only. Windows users see an incorrect path. Consider showing platform-specific paths or noting "macOS" explicitly.

### 5. `useNavigate` import but no route guard
`handleApiKeyLink` navigates to `/settings?tab=api-keys` after closing modal. This works, but if the user is unauthenticated, they could hit an unguarded route. Verify that `/settings` has auth protection (likely already handled by route guards — low risk).

### 6. `setTimeout` leak on unmount
`setTimeout(() => setCopied(false), 2000)` — if modal unmounts within 2s of copy, React will warn about state update on unmounted component. Use a ref-based cleanup or check mounted state.

**Fix:**
```tsx
useEffect(() => {
  if (!copied) return
  const timer = setTimeout(() => setCopied(false), 2000)
  return () => clearTimeout(timer)
}, [copied])
```
Then remove the `setTimeout` from `handleCopy`.

## Low Priority

### 7. Unused `Plug` import in modal
`Plug` is imported and used in the modal header (line 106), so this is actually fine. Disregard — confirmed used.

### 8. Config snippet is static
`buildSnippet()` is called on every render but returns a constant. Could be a module-level constant instead of a function. Minor perf nit.

### 9. Non-null assertion on tab lookup
`TABS.find((t) => t.id === activeTab)!` — safe in practice since `activeTab` is constrained by `TabId` type and initialized to a valid value. Acceptable.

## Positive Observations

- Follows existing modal pattern precisely (backdrop, stopPropagation, theme classes)
- Tab state resets `copied` on tab switch — good UX detail
- `buildSnippet()` generates config dynamically — easy to update MCP URL in one place
- API key link navigates to settings with proper tab param
- Code is well-structured, under 200 LOC
- Sidebar integration is minimal and clean

## Recommended Actions (prioritized)

1. **Add try/catch to handleCopy** — prevents unhandled promise rejection in non-HTTPS or permission-denied scenarios
2. **Move setTimeout to useEffect cleanup** — prevents React state-update-on-unmount warning
3. **Add Escape key handler** — standard modal UX expectation
4. **Note platform in Claude Desktop config path** — prevents confusion for Windows users
5. (Informational) ARIA attributes — track as tech debt for all modals

## Checklist

- [x] Concurrency: no shared mutable state, no async races
- [x] Error boundaries: clipboard is the one gap (see #1)
- [x] API contracts: modal props match caller usage in sidebar
- [x] Backwards compatibility: new component, no breaking changes
- [x] Input validation: no external input accepted
- [x] Auth/authz: no sensitive operations (read-only UI)
- [x] N+1 queries: no data fetching
- [x] Data leaks: no secrets — MCP URL is public, API key is placeholder text

## Unresolved Questions

- Should the MCP URL (`https://mcp.agentwiki.cc/sse`) be sourced from an env variable instead of hardcoded? Would allow different URLs per environment.
- Is there a plan to support Windows/Linux config paths for Claude Desktop?
