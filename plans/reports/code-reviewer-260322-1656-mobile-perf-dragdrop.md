# Code Review: Mobile Drawers, Auto-save Perf, Drag Markdown Import

**Date:** 2026-03-22
**Issues:** #37 (Mobile Sidebar), #32 (Auto-save Perf), #21 (Drag Markdown Import)
**Files reviewed:** 7 files, ~550 LOC changed/added

## Overall Assessment

Solid implementation across all three features. Architecture choices are sound: always-mounted drawers with CSS transforms, two-stage save with idle callback, and clean file partitioning for drag-drop. A few race conditions and edge cases need attention before merge.

---

## Critical Issues

### 1. Race condition: stale document on deferred markdown save (editor.tsx:103-106)

**Problem:** Stage 2 (idle callback) reads `editor.document` at idle time, which may reflect newer edits than what Stage 1 saved. If user edits between Stage 1 completing and the idle callback firing, the markdown will include content not yet saved as JSON, creating a JSON/markdown mismatch.

**Impact:** Data inconsistency between `contentJson` and `content` fields. Search results (if based on markdown) may show content that wasn't properly saved.

**Fix:** Capture `editor.document` once and pass it to both stages:

```typescript
const snapshot = editor.document
// Stage 1
await updateDocument.mutateAsync({ id: documentId, contentJson: snapshot })
// Stage 2
markdownIdleRef.current = requestIdleCallback(async () => {
  const content = await editor.blocksToMarkdownLossy(snapshot)
  await updateDocument.mutateAsync({ id: documentId, content })
})
```

### 2. Unmount during async idle callback (editor.tsx:103-110)

**Problem:** The cleanup effect (line 126-130) cancels the idle callback on unmount, but if the callback already fired and is mid-`await` (the `blocksToMarkdownLossy` or `mutateAsync`), the async work continues after unmount. The `editor` reference may be stale.

**Impact:** Potential "setState on unmounted component" warnings; wasted network request.

**Fix:** Add an `AbortController` or mounted-ref guard:

```typescript
const mountedRef = useRef(true)
useEffect(() => () => { mountedRef.current = false }, [])

// In idle callback:
if (!mountedRef.current) return
```

---

## High Priority

### 3. Markdown detection relies on MIME type, not file extension (global-drop-zone.tsx:33-34)

**Problem:** The `hasMarkdown` state (used for UI hint) checks `item.type === 'text/markdown'`, but most operating systems report `.md` files as `text/plain` or empty string during dragenter. The actual drop handler correctly uses `partitionMarkdownFiles` (file extension check), so import works fine -- but the UI hint will almost never show "Drop to create notes."

**Impact:** UX: users always see "Drop files to upload" even when dragging `.md` files.

**Fix:** Either accept this as a known limitation (dragenter doesn't expose filenames in many browsers for security), or remove the `hasMarkdown` differentiation from the overlay and show a generic "Drop files" message. The correct detection happens on drop anyway.

### 4. Swipe gesture fires even when interacting with drawer content (use-swipe-gesture.ts)

**Problem:** Touch listeners are on `window`, so swiping inside the sidebar drawer (e.g., scrolling a long folder tree horizontally) can trigger the close gesture. No check whether the touch target is inside the active drawer.

**Impact:** Accidental drawer close while interacting with sidebar content on mobile.

**Fix:** In `handleTouchEnd`, check if the touch start target is inside an open drawer element. If so, suppress the gesture. Consider adding a `data-swipe-ignore` attribute pattern or checking against drawer DOM refs.

### 5. `will-change: transform` permanently set (index.css:86, 94)

**Problem:** `will-change` is always active on drawer elements. MDN recommends applying it only when the animation is about to start, not permanently, as it forces the browser to maintain a compositor layer even when drawers are off-screen.

**Impact:** Increased GPU memory usage on mobile (exactly where resources are tightest). Two permanent compositor layers for elements that are hidden 99% of the time.

**Fix:** Move `will-change: transform` to a class applied only during transition, or move it to `.drawer-open` and add it on the hover/focus state before open. Alternatively, remove it entirely -- modern browsers optimize `transform` transitions well without the hint.

---

## Medium Priority

### 6. Sequential markdown import for multiple files (use-markdown-import.ts:38-64)

**Problem:** Files are imported sequentially in a for-loop with `await`. Dropping 10 markdown files means 10 serial API calls.

**Impact:** Slow import UX for batch drops. Each file triggers a nav + tab open, causing visual thrashing.

**Fix:** Use `Promise.allSettled` for the API calls, then open only the last imported doc:

```typescript
const results = await Promise.allSettled(
  files.map(async (file) => {
    const content = await file.text()
    return createDocument.mutateAsync({ title: file.name.replace(MARKDOWN_EXTENSIONS, ''), content, folderId })
  })
)
// Open last successful doc
```

### 7. No user-visible error feedback (multiple files)

**Problem:** All error handling is `console.error` or `console.warn`. Users get no toast/notification when:
- Auto-save fails (editor.tsx:112)
- Markdown import fails (use-markdown-import.ts:61)
- File exceeds size limit (use-markdown-import.ts:40)

**Impact:** Silent failures. Users may think content was saved or imported when it wasn't.

**Suggestion:** Add toast notifications for user-facing errors. Low urgency for auto-save (existing pattern), higher for import since it's an explicit user action.

### 8. `useEffect` missing deps in layout.tsx

Lines 49 and 57 have `useEffect` hooks with incomplete dependency arrays:
- Line 49: `[slugDoc]` missing `openTabs`, `openTab`, `setActiveTab`
- Line 57: `[isMobile]` missing `setMobileSidebarOpen`, `setMobileMetadataOpen`

**Impact:** Functions are stable Zustand selectors so no runtime bug, but violates exhaustive-deps lint rule. Could break if store implementation changes.

### 9. `handleExternalDragLeave` doesn't use drag counter (folder-node.tsx:61-64)

**Problem:** Unlike `GlobalDropZone` which uses `dragCounterRef` for nested element handling, `FolderNode` sets `isExternalDragOver = false` on any dragleave event. Moving the cursor over child elements within the folder row will flicker the highlight state.

**Impact:** Minor visual flicker during drag-over on folder rows.

**Fix:** Add a drag counter ref similar to `GlobalDropZone`.

---

## Low Priority

### 10. `0.577` magic number (use-swipe-gesture.ts:43)

`Math.abs(dy) > Math.abs(dx) * 0.577` is `tan(30deg)`. A named constant would improve readability:
```typescript
const TAN_30_DEG = Math.tan(Math.PI / 6) // ~0.577
```

### 11. Drawer z-index overlap with GlobalDropZone (layout.tsx vs global-drop-zone.tsx)

Drawer backdrop and panels use `z-50`, while `GlobalDropZone` uses `z-[100]`. This is correct (drop zone overlays drawers), but the implicit z-index contract should be documented or centralized.

---

## Positive Observations

- **Two-stage save** is a smart optimization -- contentJson save is near-instant while markdown conversion is deferred. Good use of `requestIdleCallback` with timeout fallback.
- **Always-mounted drawers** with CSS transforms eliminates mount/unmount cost and enables smooth transitions. Better than conditional rendering.
- **Edge-swipe detection** with angle checking prevents false triggers from vertical scrolling. Clean implementation.
- **`partitionMarkdownFiles`** utility is well-separated and testable. Size limit on markdown import (10MB) is sensible.
- **Reduced motion media query** respects user accessibility preferences.
- **Store design** for mobile drawers is mutually exclusive (`setMobileSidebarOpen` closes metadata and vice versa) -- prevents impossible states.
- **File naming** follows kebab-case convention consistently.
- **Body scroll lock** on drawer open prevents background scrolling.

---

## Recommended Actions (Priority Order)

1. **[Critical]** Fix stale snapshot race in deferred markdown save (#1)
2. **[Critical]** Add mounted guard for idle callback async work (#2)
3. **[High]** Address swipe gesture firing inside drawer content (#4)
4. **[High]** Remove permanent `will-change` or scope to active state (#5)
5. **[Medium]** Add drag counter to folder-node drag handlers (#9)
6. **[Medium]** Consider parallel import for multiple markdown files (#6)
7. **[Low]** Add user-facing error feedback for import failures (#7)

## Unresolved Questions

- Is `requestIdleCallback` polyfilled for Safari < 16.4? The tsconfig includes DOM lib but Safari support may need checking depending on target audience.
- Does the API `PUT /api/documents/:id` handle partial updates (sending only `content` without `contentJson`)? If not, Stage 2 could overwrite `contentJson` with null.
- Should swipe gestures be disabled when a modal/command palette is open? Currently they can trigger drawer state changes underneath modals.
