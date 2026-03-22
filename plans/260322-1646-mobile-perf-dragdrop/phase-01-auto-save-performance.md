---
phase: 01
title: "Auto-save Performance Optimization"
issue: 32
status: completed
priority: P1
effort: 4h
---

# Phase 01: Auto-save Performance Optimization

**Issue:** [#32](https://github.com/digitopvn/agentwiki/issues/32) — "perf: need to improve performance in general & create better UX"
**Problem:** Auto-save causes laggy/flickering/delay. Root cause: `blocksToMarkdownLossy()` runs on every debounced save (expensive), and debounce at 1s is too aggressive.

## Context Links
- Editor: `packages/web/src/components/editor/editor.tsx`
- App store: `packages/web/src/stores/app-store.ts`
- Documents hook: `packages/web/src/hooks/use-documents.ts`

## Key Insights

1. `editor.blocksToMarkdownLossy()` is the most expensive operation — it traverses the entire document tree and serializes to markdown. Called on every save (every 1s while typing).
2. `contentJson` is just `editor.document` (a reference, nearly free). The markdown is only needed for search indexing and API consumers — can be deferred.
3. The `onChange` callback creates a new closure every render due to dependency array, causing unnecessary re-renders.
4. Tab dirty state updates on every keystroke trigger store re-renders.

## Architecture

```
Current flow (every keystroke → 1s debounce):
  onChange → markTabDirty → setTimeout(1s) → blocksToMarkdownLossy + API call

Optimized flow:
  onChange → markTabDirty (batched) → setTimeout(2s) → API call with contentJson only
                                                      → requestIdleCallback → markdown conversion → background API update
```

## Related Code Files

**Modify:**
- `packages/web/src/components/editor/editor.tsx` — Debounce + deferred markdown

## Implementation Steps

1. **Increase debounce delay** from 1000ms to 2000ms in `editor.tsx:82`
2. **Split save into two stages:**
   - Stage 1 (immediate after debounce): Save `contentJson` only via `updateDocument.mutateAsync({ id, contentJson })`
   - Stage 2 (deferred): Use `requestIdleCallback` (with 5s timeout fallback) to run `blocksToMarkdownLossy()`, then send a second `updateDocument` with `content` (markdown)
3. **Optimize handleChange** — Use `useRef` for the save function to avoid re-creating closures
4. **Batch dirty state** — Only call `markTabDirty` if not already dirty (avoid redundant store updates)

## Todo List

- [x] Increase debounce to 2000ms
- [x] Split save: contentJson first, markdown deferred
- [x] Use requestIdleCallback for markdown conversion
- [x] Optimize handleChange closure with useRef
- [x] Batch markTabDirty calls (skip if already dirty)
- [x] Test: verify auto-save still works, no data loss
- [x] Test: verify markdown content eventually syncs

## Success Criteria

- No visible lag/flicker when typing in editor
- Auto-save indicator (dirty dot) clears within 3s of stopping typing
- Markdown content is eventually consistent (within 10s)
- No regressions in document content persistence

## Risk Assessment

- **requestIdleCallback not in all browsers**: Use `setTimeout(fn, 5000)` fallback
- **Race condition**: Stage 2 markdown update could overwrite newer contentJson — mitigate by checking if contentJson changed since stage 1

## Security Considerations
- No security impact — purely frontend performance optimization
