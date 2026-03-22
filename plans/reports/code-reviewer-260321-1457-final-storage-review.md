# Code Review: Final Storage (Cloudflare R2) Feature Review - Issue #22

**Date:** 2026-03-21
**Branch:** `ultrathink` vs `main`
**Scope:** SP1 (Extraction Pipeline), SP2 (Storage UI/UX), SP3 (CLI/MCP Storage Search)

## Scope

- Files: ~80 source files across 6 packages (api, web, extraction-service, cli, mcp, shared)
- LOC: ~24,000 additions
- Focus: Security, correctness, performance, type safety, UX, DX

## Overall Assessment

Solid feature implementation with clean architecture. Extraction pipeline (CF Worker -> VPS -> callback) is well-designed. Major blocking issue: **frontend file cards are broken due to `fileKey` not returned by API**. Several security and correctness issues to address before merge.

---

## Critical Issues (Blocking)

### C1. `listUploads` does NOT return `fileKey` -- frontend broken

**File:** `packages/api/src/services/upload-service.ts:83-100`
**Impact:** `StorageFileCard` uses `file.fileKey` for image previews, download links, and copy URL. Since `listUploads` only selects `{id, filename, contentType, sizeBytes, extractionStatus, summary, createdAt}`, all file URLs will be `undefined` rendering images broken, downloads non-functional, and copy-URL producing garbage.

**Fix:** Add `fileKey: uploads.fileKey` to the select in `listUploads()`:
```ts
.select({
  id: uploads.id,
  fileKey: uploads.fileKey, // <-- ADD THIS
  filename: uploads.filename,
  ...
})
```
Also trim the frontend `Upload` interface to only fields actually returned (remove `tenantId`, `documentId`, `uploadedBy` or add them to the select).

### C2. Extraction service auth uses non-constant-time comparison

**File:** `packages/extraction-service/app/main.py:43`
```python
if x_internal_secret != AGENTWIKI_INTERNAL_SECRET:
```
Python string comparison is not timing-safe. The CF Worker side (`internal-auth.ts`) correctly uses timing-safe comparison, but the VPS FastAPI side does not.

**Fix:** Use `hmac.compare_digest()`:
```python
import hmac
if not hmac.compare_digest(x_internal_secret, AGENTWIKI_INTERNAL_SECRET):
```

### C3. PBKDF2 salt is hardcoded and identical for all tenants

**File:** `packages/api/src/utils/encryption.ts:18`
```ts
salt: encoder.encode('agentwiki-ai-keys'),
```
All tenants derive the same AES key from the same secret + static salt. If the master secret leaks, ALL tenant API keys are compromised simultaneously. This also means identical plaintexts across tenants produce correlated ciphertext patterns (different IVs help but the key is the same).

**Fix:** Include tenant ID in the salt: `salt: encoder.encode(`agentwiki-${tenantId}`)` and pass `tenantId` to `encrypt()`/`decrypt()`.

---

## High Priority

### H1. `storageKeywordSearch` uses LIKE on full `extracted_text` -- very slow

**File:** `packages/api/src/services/storage-search-service.ts:34`
```ts
sql`${fileExtractions.extractedText} LIKE ${likeQuery}`
```
`LIKE '%query%'` on a text column storing full document content (up to 5MB per row) will do full table scan per query. D1 has strict CPU time limits (~30ms for free, ~50ms for paid). This will timeout quickly with >10 files.

**Fix:** Add a full-text search index on `extracted_text` using SQLite FTS5, or limit keyword search to the `uploads.filename` + `file_extractions.extraction_method` fields and rely on semantic search for content matching.

### H2. Delete vectors uses hardcoded range `0..49` instead of actual vector count

**File:** `packages/api/src/services/upload-service.ts:118`
```ts
const vectorIds = Array.from({ length: 50 }, (_, i) => `${vectorPrefix}-${i}`)
```
If a document has >50 chunks, orphan vectors remain in Vectorize. If it has <50, unnecessary delete calls are made.

**Fix:** Store the chunk count in `fileExtractions.charCount` or a new field, or query Vectorize by metadata filter `{upload_id: uploadId}` to find all vectors.

### H3. Extraction retry uses `createdAt` instead of `updatedAt` for timeout detection

**File:** `packages/api/src/services/extraction-retry-service.ts:28,45,62`

Uses `uploads.createdAt` to determine if a job is stuck. A file uploaded 3 hours ago that was manually retried 5 minutes ago will be marked as permanently failed because `createdAt` is the original upload time.

**Fix:** Add an `extractionUpdatedAt` column to `uploads` table, update it on each dispatch/status change, and use that for timeout calculations.

### H4. Sequential file uploads in drop zone and storage drawer

**File:** `packages/web/src/components/storage/global-drop-zone.tsx:50-56`
```ts
for (const file of Array.from(files)) {
  await uploadWithProgress(file)
}
```
Uploading 10 files is sequential (each waits for the previous to finish). Bad UX for batch uploads.

**Fix:** Use `Promise.allSettled()` for parallel uploads (with a concurrency limit of 3-5):
```ts
await Promise.allSettled(files.map(file => uploadWithProgress(file)))
```

### H5. `storageSemanticSearch` makes 2 separate DB queries for uploads and extractions

**File:** `packages/api/src/services/storage-search-service.ts:79-92`

Two separate queries to get `uploads` and `fileExtractions` when a single JOIN would suffice.

**Fix:** Combine into one query:
```ts
const rows = await db.select({ id: uploads.id, filename: uploads.filename, extractedText: fileExtractions.extractedText })
  .from(uploads)
  .innerJoin(fileExtractions, eq(uploads.id, fileExtractions.uploadId))
  .where(sql`...IN(...)`)
```

---

## Medium Priority

### M1. No file type allowlist on upload route

**File:** `packages/api/src/routes/uploads.ts:18-38`

Accepts any content type. A user could upload `.exe`, `.sh`, shell scripts, or HTML files that could be served back and execute in the browser context (stored XSS via file upload).

**Fix:** Validate `file.type` against an allowlist of safe content types. At minimum, serve uploaded files with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff` headers.

### M2. Missing `Content-Disposition` and `X-Content-Type-Options` headers on file serving

**File:** `packages/api/src/routes/uploads.ts:76-80, 91-95`

Files served without `Content-Disposition: attachment` for non-image types, and no `X-Content-Type-Options: nosniff`. This enables stored XSS if an attacker uploads an HTML file.

**Fix:** Add these headers:
```ts
'Content-Disposition': `inline; filename="${sanitizedFilename}"`,
'X-Content-Type-Options': 'nosniff',
```

### M3. `document_extractor.py` runs Docling synchronously in async context

**File:** `packages/extraction-service/app/extractors/document_extractor.py:26`
```python
converter = DocumentConverter()
result = converter.convert(tmp_path)
```
Docling `convert()` is CPU-bound and blocks the event loop. With `WORKER_CONCURRENCY=2`, one large PDF blocks all other jobs.

**Fix:** Run in a thread pool:
```python
import asyncio
loop = asyncio.get_event_loop()
result = await loop.run_in_executor(None, lambda: converter.convert(tmp_path))
```

### M4. `image_extractor.py` creates a new Gemini client per call

**File:** `packages/extraction-service/app/extractors/image_extractor.py:26`
```python
gemini_client = genai.Client(api_key=GEMINI_API_KEY)
```
Creates a new client instance for every image extraction. Should be module-level singleton.

### M5. MCP package imports API internals via relative paths

**File:** `packages/mcp/src/tools/search-and-graph-tools.ts:7-8`
```ts
import { searchDocuments } from '../../../api/src/services/search-service'
import { documents, documentLinks, documentTags } from '../../../api/src/db/schema'
```
Tight coupling between packages via relative imports. Breaking if API restructures.

**Fix:** Export needed functions from `@agentwiki/api` package or create a shared service layer.

### M6. `extractSnippet` not shown -- potential issue with empty extracted text

If `storageKeywordSearch` returns results where `extractedText` is empty string (e.g., image-only PDFs before Gemini processes them), `extractSnippet('', query)` may return empty/garbage snippets.

### M7. Upload queue ID race condition

**File:** `packages/web/src/hooks/use-upload-with-progress.ts:16-17`
```ts
addToUploadQueue([file])
const queue = useAppStore.getState().uploadQueue
const queueId = queue[queue.length - 1].id
```
If two uploads are triggered near-simultaneously, the second call might grab the first call's queue item ID because `addToUploadQueue` and `getState()` are not atomic together.

**Fix:** Return the generated ID from `addToUploadQueue` or generate the ID before adding.

---

## Low Priority

### L1. `MAX_FILE_SIZE` duplicated in 3 places

Defined in `global-drop-zone.tsx`, `storage-drawer.tsx`, and `uploads.ts` (API). Should be in `@agentwiki/shared/constants`.

### L2. Worker cleanup in `app/main.py` doesn't await task cancellation

**File:** `packages/extraction-service/app/main.py:31-34`
```python
if worker_task:
    worker_task.cancel()
```
Should `await` the cancelled task to ensure clean shutdown.

### L3. Storage drawer lacks keyboard accessibility

No focus trap, no ARIA attributes (`role="dialog"`, `aria-modal`, `aria-label`). Tab key can escape behind the backdrop.

### L4. Missing error boundary for storage components

If `useUploads()` query fails, the entire storage drawer crashes. Should show an error state with retry option.

### L5. CLI `upload list` doesn't paginate

**File:** `packages/cli/src/index.ts:247-280`

Lists all files without pagination. Will be problematic for tenants with many uploads.

---

## Positive Observations

1. **Download token pattern** (line 26-28 in `extraction-job-dispatcher.ts`) is well-designed: short-lived KV tokens with 15-min TTL, deleted before serving (TOCTOU prevention)
2. **Timing-safe comparison** in CF Worker internal auth middleware is correct
3. **Extraction retry service** with progressive timeouts and permanent failure after 2 hours prevents infinite retry loops
4. **Queue handler** properly separates embed-upload and summarize-upload jobs for independent processing
5. **GlobalDropZone** correctly handles nested drag events with counter pattern
6. **Search source parameter** cleanly extends existing search without breaking backward compatibility
7. **File extraction schema** wisely separates large text from upload metadata (prevents D1 row size issues)
8. **Zod validation** on internal extraction result endpoint prevents malformed callbacks

---

## Recommended Actions (Priority Order)

1. **[BLOCKER]** Add `fileKey` to `listUploads` select statement -- fix frontend file cards
2. **[BLOCKER]** Use `hmac.compare_digest()` in Python extraction service auth
3. **[HIGH]** Add `Content-Disposition` + `X-Content-Type-Options` headers to file serving
4. **[HIGH]** Fix PBKDF2 salt to include tenant ID
5. **[HIGH]** Address LIKE '%query%' performance on large text (add FTS5 or limit scope)
6. **[HIGH]** Fix upload queue ID race condition in `use-upload-with-progress.ts`
7. **[MEDIUM]** Run Docling conversion in thread pool executor
8. **[MEDIUM]** Make Gemini client a module-level singleton
9. **[MEDIUM]** Parallel file uploads with concurrency limit
10. **[LOW]** Consolidate `MAX_FILE_SIZE` constant
11. **[LOW]** Add ARIA attributes to storage drawer

---

## Unresolved Questions

1. Is there a content-type allowlist planned for uploads? Currently accepts everything including HTML/SVG (stored XSS risk)
2. The `uploads.createdAt` vs `extractionUpdatedAt` issue -- is manual retry a supported workflow or just internal/debug?
3. Vector deletion with hardcoded range of 50 -- what's the expected max chunk count for large documents?
4. Should the CLI `upload list` support pagination given the API already returns all results?
