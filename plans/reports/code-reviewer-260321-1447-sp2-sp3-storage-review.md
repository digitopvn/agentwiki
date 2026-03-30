# Code Review: SP2 (Storage UI/UX) + SP3 (CLI/MCP Storage Search)

## Scope
- **Files**: 15 files across web, api, cli, mcp packages
- **LOC**: ~750 net new/changed
- **Focus**: Correctness, security, UX, edge cases

## Overall Assessment
Solid implementation. Clean component decomposition, good separation of concerns. A few issues need attention: one **critical** security gap in source param validation, one **high** bug in the drag-drop ref, and several medium improvements.

---

## Critical Issues

### C1. No validation on `source` query param (search route)
**File**: `packages/api/src/routes/search.ts:29`
```ts
const source = (c.req.query('source') ?? 'docs') as SearchSource
```
Raw cast with no validation. A malicious or malformed `source` value (e.g., `source=__proto__`) passes through unchecked. In `searchDocuments`, an invalid source silently skips all search branches, returning empty results -- not exploitable, but still a correctness bug. Same pattern applies to `type` on line 27.

**Fix**: Validate with allowlist:
```ts
const validSources = new Set(['docs', 'storage', 'all'])
const sourceRaw = c.req.query('source') ?? 'docs'
const source: SearchSource = validSources.has(sourceRaw) ? sourceRaw as SearchSource : 'docs'
```
Apply same pattern to `type`.

### C2. SQL LIKE query -- injection safety (verified safe, but fragile)
**File**: `packages/api/src/services/storage-search-service.ts:19`
```ts
const likeQuery = `%${query}%`
// ...
sql`${fileExtractions.extractedText} LIKE ${likeQuery}`
```
This is safe because Drizzle parameterizes `sql` template tag values. However, LIKE wildcards (`%`, `_`) in user input are not escaped, meaning a query like `%` or `_` matches everything. Not a security vulnerability but a correctness concern.

**Recommendation**: Escape LIKE meta-characters in user input:
```ts
const escaped = query.replace(/[%_\\]/g, '\\$&')
const likeQuery = `%${escaped}%`
```

---

## High Priority

### H1. `dragCounterRef` is a plain object, not a `useRef` -- stale closure bug
**File**: `packages/web/src/components/storage/global-drop-zone.tsx:18`
```ts
const dragCounterRef = { current: 0 }
```
This creates a new object on every render. Since `handleDragEnter`/`handleDragLeave` are wrapped in `useCallback` with empty deps, they capture the **first** render's `dragCounterRef`. However, because `dragCounterRef` itself is recreated every render, if the effect re-runs (deps change), handlers will reference a stale counter -- the overlay could get stuck visible.

**Fix**: Use `useRef`:
```ts
const dragCounterRef = useRef(0)
```
This is a one-character fix with significant correctness impact. Without it, the drop overlay can get stuck on screen after rapid drag-enter/leave sequences.

### H2. `addToUploadQueue` is called but never used -- dead code / dual ID generation
**File**: `packages/web/src/stores/app-store.ts:139-148` and `packages/web/src/hooks/use-upload-with-progress.ts:15-18`

`useUploadWithProgress` generates its own queue item via `useAppStore.setState` directly (line 16-18), bypassing the `addToUploadQueue` action entirely. The `addToUploadQueue` action in the store is dead code -- never called from any consumer. This isn't a bug per se, but it's confusing and the direct `setState` pattern bypasses the store's action abstraction.

**Recommendation**: Either use `addToUploadQueue` inside `useUploadWithProgress` (set status to `'uploading'` instead of `'queued'`), or remove `addToUploadQueue` from the store.

### H3. Sequential uploads on drop -- blocks UI for multi-file drops
**File**: `packages/web/src/components/storage/global-drop-zone.tsx:50-56`
```ts
for (const file of Array.from(files)) {
  // ...
  await uploadWithProgress(file)
}
```
Same pattern in `storage-drawer.tsx:49-55`. Files upload one at a time. For 10 files, this blocks the callback for the entire duration. The XHR itself is async, but the `await` serializes them.

**Recommendation**: Upload in parallel with concurrency limit:
```ts
await Promise.all(validFiles.map((file) => uploadWithProgress(file)))
```
Or use a concurrency pool (e.g., 3 concurrent uploads) for large batches.

### H4. `RankedResult` type mismatch for storage results
**File**: `packages/api/src/services/storage-search-service.ts:38-43`
```ts
return {
  id: r.uploadId,
  title: r.filename,
  slug: '',           // <-- always empty string
  resultType: 'upload' as const,
}
```
`RankedResult` interface (rrf.ts) has no `resultType` field. The storage search adds `resultType: 'upload'` but the type definition does not include it. The `satisfies RankedResult & { resultType: string }` on line 104 is a workaround, but consumers of search results have no type-safe way to distinguish doc vs. upload results.

**Fix**: Add `resultType?: 'doc' | 'upload'` to the `RankedResult` interface. This enables frontend to render results differently.

---

## Medium Priority

### M1. `File` objects stored in Zustand -- not serializable
**File**: `packages/web/src/stores/app-store.ts:8`
```ts
file: File  // in UploadQueueItem
```
`File` objects are not serializable. While `uploadQueue` is excluded from `partialize` (so it won't be persisted), storing non-serializable values in Zustand can cause issues with devtools and time-travel debugging.

**Recommendation**: Store only `{ name: string; size: number; type: string }` metadata instead of the `File` object. The `File` reference is only needed during active upload -- keep it in the XHR closure, not the store.

### M2. `handleCopyUrl` has no user feedback
**File**: `packages/web/src/components/storage/storage-file-card.tsx:23-25`
```ts
const handleCopyUrl = () => {
  navigator.clipboard.writeText(...)
}
```
No success/error feedback. `clipboard.writeText` can fail (non-HTTPS, permission denied). No toast or visual confirmation.

**Recommendation**: Add try/catch with toast notification. Also, `navigator.clipboard` is not available in all contexts (e.g., HTTP localhost without secure context).

### M3. Polling interval hardcoded, no backoff
**File**: `packages/web/src/components/storage/storage-drawer.tsx:28`
```ts
const interval = setInterval(() => refetch(), 5000)
```
5s polling is reasonable, but if extraction takes minutes, this generates unnecessary requests. No exponential backoff.

**Minor**: Acceptable for MVP. Consider increasing interval over time (5s -> 10s -> 30s) if processing takes long.

### M4. `MAX_FILE_SIZE` duplicated
**File**: `global-drop-zone.tsx:9` and `storage-drawer.tsx:12`
Both define `const MAX_FILE_SIZE = 100 * 1024 * 1024`. Should be shared constant.

### M5. Upload error handling uses `alert()`
**Files**: `global-drop-zone.tsx:52`, `storage-drawer.tsx:51`
`alert()` blocks the main thread and is poor UX. Should use toast notification.

---

## Low Priority

### L1. ExtractionBadge null-coalescing order
**File**: `extraction-badge.tsx:15`
```ts
const config = STATUS_CONFIG[(status as keyof typeof STATUS_CONFIG) ?? 'pending'] ?? STATUS_CONFIG.pending
```
The `??` inside the brackets applies to `status`, not the lookup result. If `status` is a non-null unknown string (e.g., `"new_status"`), the cast produces `undefined` from the lookup, caught by the outer `??`. Works correctly by accident -- the logic is fine but reads confusingly.

### L2. `doc search` command placement
**File**: `packages/cli/src/index.ts:167-188`
`search` is a subcommand of `doc`, so it's invoked as `agentwiki doc search`. For discoverability, consider also registering at top level: `agentwiki search`.

---

## Positive Observations

- Clean component split: ExtractionBadge, StorageFileCard, UploadProgressList, StorageDrawer, GlobalDropZone -- each under 100 lines
- Correct use of `useCallback` and proper dependency arrays throughout (except H1)
- Polling only when drawer is open AND files are processing -- good optimization
- `partialize` in Zustand correctly excludes volatile state (uploadQueue, drawers)
- MCP tool schema uses Zod with proper defaults and descriptions
- Backward compatibility maintained: `source` defaults to `'docs'` everywhere
- XHR upload with progress tracking is the correct approach (fetch API lacks upload progress)
- `withCredentials: true` on XHR for auth cookie passthrough
- Semantic search properly filters by `source_type: 'upload'` metadata
- Auto-remove completed uploads from queue after 3s -- nice UX touch

---

## Recommended Actions (Priority Order)

1. **[Critical]** Validate `source` and `type` query params in search route
2. **[High]** Fix `dragCounterRef` to use `useRef` in GlobalDropZone
3. **[High]** Add `resultType` to `RankedResult` interface for type-safe result distinction
4. **[High]** Consider parallel uploads for multi-file drops
5. **[Medium]** Escape LIKE wildcards in storage keyword search
6. **[Medium]** Remove dead `addToUploadQueue` or use it in `useUploadWithProgress`
7. **[Medium]** Replace `alert()` with toast notifications
8. **[Low]** Extract shared `MAX_FILE_SIZE` constant

## Unresolved Questions

- Is `resultType: 'upload'` consumed anywhere on the frontend? If not, search results for uploads may render incorrectly (empty slug means no navigation target).
- Does the `postFilterResults` function (date/tag filters) accidentally filter out storage upload results when `source='all'`? The function queries the `documents` table, so upload results would be silently dropped from filtered results. Need to verify the conditional on line 61 handles this correctly.
- Should the MCP `search` tool require `upload:read` scope when `source='storage'`? Currently only checks `doc:read`.

---

**Status:** DONE
**Summary:** 2 critical, 4 high, 5 medium, 2 low issues found. Main concerns: missing input validation on search source param, stale ref bug in drag-drop, and type safety gap in mixed doc/upload search results.
