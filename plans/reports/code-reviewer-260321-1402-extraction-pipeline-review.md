# Code Review: SP1 Text Extraction Pipeline

## Scope
- **Files**: 20+ files across `packages/api`, `packages/shared`, `packages/extraction-service`
- **Focus**: Security, correctness, edge cases
- **LOC**: ~650 (API) + ~200 (Python extraction service)

## Overall Assessment

Well-architected pipeline with clean separation: CF Workers dispatches to VPS via HTTP, VPS processes via BullMQ, results posted back via internal API. Good use of fire-and-forget with `waitUntil`, KV-based one-time download tokens, and cron retry. Several security and correctness issues found below.

---

## Critical Issues

### C1. Timing-safe comparison leaks length (SECURITY)
**File**: `packages/api/src/middleware/internal-auth.ts:8`

```ts
if (a.length !== b.length) return false  // <-- early return leaks length info
```

The early return on length mismatch defeats the purpose of timing-safe comparison. An attacker can determine the secret's length by measuring response times.

**Fix**: Pad/hash both strings to fixed length before comparison, or use Web Crypto `timingSafeEqual` equivalent:
```ts
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const aBuf = encoder.encode(a.padEnd(256, '\0'))
  const bBuf = encoder.encode(b.padEnd(256, '\0'))
  let result = a.length ^ b.length  // include length difference in result
  for (let i = 0; i < aBuf.length; i++) {
    result |= aBuf[i] ^ bBuf[i]
  }
  return result === 0
}
```
**Severity**: Medium-Critical. In practice, the shared secret is over a network from a known VPS, so exploitation is limited. But the code claims timing-safety and doesn't deliver it.

### C2. Unauthenticated file serving fallthrough (SECURITY)
**File**: `packages/api/src/routes/uploads.ts:99-110`

```ts
// Public files: check if file key is for a public document
// For now, serve if the file exists (share links will handle auth separately)
const object = await c.env.R2.get(fileKey)
```

If neither `dl_token` nor authenticated user is present, ANY file in R2 is served publicly. This means every uploaded file is effectively public if the attacker knows/guesses the file key. The key format `{tenantId}/media/{id}/{filename}` is somewhat predictable if `tenantId` is known.

**Fix**: Return 401 when no auth and no dl_token. If public file serving is needed, validate against share links in the DB:
```ts
if (!tenantId && !dlToken) {
  return c.json({ error: 'Authentication required' }, 401)
}
```

### C3. VPS extraction service /jobs endpoint has NO authentication
**File**: `packages/extraction-service/app/main.py:40-53`

The `/jobs` endpoint accepts job submissions without any auth. Anyone who discovers the VPS URL can submit arbitrary extraction jobs, causing the service to download from arbitrary URLs (SSRF) and consume resources.

**Fix**: Add header validation matching the internal secret:
```python
from fastapi import Header, HTTPException

@app.post("/jobs", status_code=202)
async def create_job(job: ExtractionJob, x_internal_secret: str = Header(...)):
    if x_internal_secret != AGENTWIKI_INTERNAL_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")
    ...
```

---

## High Priority

### H1. TOCTOU race in download token consumption
**File**: `packages/api/src/routes/uploads.ts:70-75`

```ts
const storedKey = await c.env.KV.get(`dl:${dlToken}`)
if (storedKey && storedKey === fileKey) {
  const object = await c.env.R2.get(fileKey)
  // ... serve file ...
  await c.env.KV.delete(`dl:${dlToken}`)  // deleted AFTER serving
}
```

Token is deleted after the file is served. Two concurrent requests with the same token can both pass the check before either deletes it. The token is not truly one-time.

**Fix**: Delete first, then serve. If R2 get fails after delete, token is lost but that's safer than reuse:
```ts
await c.env.KV.delete(`dl:${dlToken}`)  // delete first
const object = await c.env.R2.get(fileKey)
if (!object) return c.json({ error: 'File not found' }, 404)
```

### H2. Vector cleanup uses hardcoded 50 IDs — fragile
**File**: `packages/api/src/services/upload-service.ts:118`

```ts
const vectorIds = Array.from({ length: 50 }, (_, i) => `${vectorPrefix}-${i}`)
```

If a document produces more than 50 chunks, orphaned vectors remain. The actual chunk count from `embedUploadJob` uses `chunks.length` which can exceed 50 for large documents (100MB limit).

**Fix**: Store vector count in `fileExtractions` table or query chunk count before deletion. At minimum, increase to a safe upper bound or use a metadata-based deletion if Vectorize supports it.

### H3. No size limit on extractedText in callback
**File**: `packages/api/src/routes/internal.ts:17-23`

The `extractedText` field in `extractionResultSchema` is `z.string()` with no max length. A malicious or buggy extraction service could post gigabytes of text, overwhelming D1 storage and the Workers memory limit.

**Fix**: Add `.max()` constraint:
```ts
extractedText: z.string().max(5_000_000), // 5MB text max
```

### H4. Retry cron uses wrong cutoff for `processing` status
**File**: `packages/api/src/services/extraction-retry-service.ts:18-32`

Both `pending` and `processing` statuses use `pendingCutoff` (15 min). The `PROCESSING_TIMEOUT_MS` (10 min) is defined but never used. Processing items stuck for 10+ min should use their own cutoff.

**Fix**: Apply separate cutoff:
```ts
const processingCutoff = new Date(now - PROCESSING_TIMEOUT_MS)
// Use OR logic with different cutoffs per status
```

### H5. Infinite retry loop — no max retry count
**Files**: `extraction-retry-service.ts`, `extraction-job-dispatcher.ts`

A permanently failing upload will be retried every 5 minutes forever. There's no retry counter or max-attempts check.

**Fix**: Add `retryCount` column to uploads or set status to `failed` after N retries.

---

## Medium Priority

### M1. `extractedText` may be empty string on error paths
**File**: `packages/api/src/services/extraction-service.ts:27-28`

```ts
const isError = !!error || extractionMethod === 'unsupported'
```

When `error` is truthy, `extractedText` is still stored (possibly empty). The `.length` property is then `0`, so embed/summarize won't trigger. That's fine, but the empty string is stored in D1 unnecessarily, and `charCount` is set to `0` for the empty string.

Consider: Skip inserting `fileExtractions` record entirely on error, or at minimum don't store empty `extractedText`.

### M2. Document extractor path traversal risk
**File**: `packages/extraction-service/app/extractors/document_extractor.py:17`

```python
tmp_path = os.path.join(tmp_dir, filename)
```

If `filename` contains `../` sequences, this could write outside the temp directory. While the API sanitizes filenames with `replace(/[^a-zA-Z0-9._-]/g, '_')`, the Python service receives whatever the CF Worker sends. Defense in depth recommends sanitizing here too.

**Fix**:
```python
safe_name = os.path.basename(filename.replace("..", "_"))
tmp_path = os.path.join(tmp_dir, safe_name)
```

### M3. Image extractor uses synchronous Gemini client
**File**: `packages/extraction-service/app/extractors/image_extractor.py:26-33`

`genai.Client.models.generate_content()` is synchronous but called inside an `async` function. This blocks the event loop, reducing worker throughput.

**Fix**: Use `await genai.Client.aio.models.generate_content()` or run in executor.

### M4. No content-type validation on file download in Python extractors
**Files**: All extractors download from `file_url` and trust the content type from the job payload. A mismatch (e.g., PDF content-type but actually a ZIP) could cause Docling to crash or behave unexpectedly.

### M5. Missing `wrangler.toml` queue/cron config validation
The scheduled handler and queue handler are registered in `index.ts`, but the review should verify `wrangler.toml` has matching `[triggers]` and `[[queues]]` config.

### M6. `fileKey` from URL path is not validated
**File**: `packages/api/src/routes/uploads.ts:63`

```ts
const fileKey = c.req.path.replace('/api/files/', '')
```

No validation that `fileKey` is a valid key format. Combined with C2 (public fallthrough), this could be used to probe R2 bucket contents.

---

## Low Priority

### L1. Queue error for non-200 not retried in `post_result`
**File**: `packages/extraction-service/app/worker.py:88`

`response.raise_for_status()` will raise, which BullMQ catches and retries (3 attempts). This is correct behavior but the double log (line 87 + BullMQ retry log) is noisy.

### L2. Redis connection not encrypted
**File**: `packages/extraction-service/docker-compose.yml`

Redis is exposed without TLS or password. Fine for same-host Docker networking, but worth noting for production hardening.

### L3. Worker `while True: await asyncio.sleep(1)` is wasteful
**File**: `packages/extraction-service/app/worker.py:120-121`

BullMQ worker keeps itself alive, this polling loop is unnecessary overhead. The worker itself manages its own event loop.

---

## Positive Observations

1. Clean separation of concerns: dispatcher, service, retry as independent modules
2. Zod validation on internal API endpoints
3. Fire-and-forget with `waitUntil` for non-blocking upload response
4. One-time download tokens via KV with TTL — good pattern
5. Extraction status tracking with proper state machine (pending -> processing -> completed/failed)
6. Cascade delete on `fileExtractions` FK — proper cleanup
7. Content type routing in Python service is well-organized
8. BullMQ with exponential backoff for job retries

---

## Recommended Actions (Priority Order)

1. **[CRITICAL]** Fix C2 — public file fallthrough. This is a data leak.
2. **[CRITICAL]** Fix C3 — add auth to VPS `/jobs` endpoint (SSRF risk).
3. **[HIGH]** Fix H1 — delete download token before serving file.
4. **[HIGH]** Fix H3 — add max length on `extractedText` payload.
5. **[HIGH]** Fix H5 — add max retry count to prevent infinite retry loops.
6. **[MEDIUM]** Fix C1 — timing-safe comparison length leak.
7. **[MEDIUM]** Fix M2 — path traversal defense in document extractor.
8. **[MEDIUM]** Fix H2 — vector cleanup for >50 chunks.
9. **[MEDIUM]** Fix H4 — use correct processing timeout cutoff.

---

## Unresolved Questions

1. Is the public file serving fallthrough (C2) intentional for a specific use case (e.g., public wikis), or is it a TODO left incomplete?
2. What is the expected maximum document size for extraction? The 100MB upload limit + no text size limit could strain D1.
3. Is there a plan to add auth to the VPS extraction service, or is it expected to be on a private network?
4. Should the extraction pipeline track retry count per upload to prevent infinite retries?
