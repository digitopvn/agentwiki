# Phase 3: Upload Flow Integration

## Context
- [SP1 Plan](./plan.md)
- [Phase 1](./phase-01-db-schema-internal-api.md) — DB schema + internal API
- [Phase 2](./phase-02-vps-extraction-service.md) — VPS service running
- Upload routes: `packages/api/src/routes/uploads.ts`
- Upload service: `packages/api/src/services/upload-service.ts`

## Overview
- **Priority:** P0
- **Status:** Completed
- **Description:** Modify upload flow to trigger extraction after file upload. Generate R2 presigned URL, POST job to VPS extraction service. Increase file size limit to 100MB.

## Requirements

### Functional
- After successful R2 upload, POST extraction job to VPS
- Generate presigned R2 URL for VPS to download file
- Set extraction_status=pending on upload, processing when job sent
- Increase file size limit from 10MB to 100MB
- Skip extraction for unsupported content types (set status immediately)

### Non-functional
- Job dispatch is fire-and-forget (don't block upload response)
- If VPS unreachable, set status=pending (retry mechanism later)
- Presigned URL TTL: 15 minutes

## Related Code Files

### Modify
- `packages/api/src/services/upload-service.ts` — add extraction job dispatch
- `packages/api/src/routes/uploads.ts` — increase size limit to 100MB
- `packages/api/src/services/upload-service.ts` — listUploads returns new fields
- `packages/web/src/hooks/use-uploads.ts` — Upload interface add new fields
- `packages/mcp/src/tools/upload-tools.ts` — increase MCP upload size, add extraction_status to list

### Create
- `packages/api/src/services/extraction-job-dispatcher.ts` — dispatch jobs to VPS

## Implementation Steps

1. **Create extraction job dispatcher**
   ```typescript
   // extraction-job-dispatcher.ts
   export async function dispatchExtractionJob(env: Env, upload: {
     id: string; tenantId: string; fileKey: string;
     contentType: string; filename: string;
   }) {
     // 1. Check if content_type is extractable
     // 2. If unsupported → update status=unsupported, return
     // 3. Generate presigned R2 URL (15min TTL)
     // 4. HTTP POST to env.EXTRACTION_SERVICE_URL/jobs
     // 5. On success → update status=processing
     // 6. On failure → keep status=pending (will retry)
   }
   ```

2. **Presigned URL generation**
   - R2 doesn't have native presigned URLs in Workers
   - Alternative: use the existing `/api/files/{key}` endpoint as download URL
   - Add a temporary token param: `/api/files/{key}?token={shortLivedToken}`
   - Store token in KV with 15min TTL
   - Or: use internal auth header for VPS to download directly

3. **Modify uploadFile in upload-service.ts**
   - After R2.put + D1 insert, call `dispatchExtractionJob` via `waitUntil`
   - Don't block the upload response

4. **Increase file size limit**
   - `uploads.ts`: change `10 * 1024 * 1024` → `100 * 1024 * 1024`
   - Update MCP tool: increase MAX_BASE64_SIZE proportionally
   - Note: CF Workers has 100MB body limit on paid plan

5. **Content type routing (extractable check)**
   ```typescript
   const EXTRACTABLE_TYPES = new Set([
     'text/plain', 'text/markdown', 'text/csv', 'text/html',
     'application/pdf',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'image/png', 'image/jpeg', 'image/webp', 'image/gif',
   ])

   const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
   ```

6. **Update listUploads to return new fields**
   - Include extraction_status, summary in SELECT

7. **Update Upload interface in web hooks**
   - Add extractionStatus, summary fields

8. **Run type-check + build**

## Todo List

- [x] Create extraction-job-dispatcher.ts
- [x] Implement presigned URL / download auth for VPS
- [x] Modify uploadFile to dispatch extraction job
- [x] Increase file size limit to 100MB
- [x] Update listUploads to return extraction_status + summary
- [x] Update web Upload interface
- [x] Update MCP upload_list to return new fields
- [x] Run type-check + build
- [x] End-to-end test: upload PDF → extraction → vectorize → search

## Success Criteria

- Upload file → extraction_status transitions: pending → processing → completed
- VPS receives job with valid download URL
- Unsupported files immediately marked as unsupported
- Upload response still fast (< 500ms, extraction is async)
- 100MB files upload successfully

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| R2 presigned URL not available in Workers | Use internal download endpoint with short-lived KV token |
| VPS unreachable at upload time | Keep status=pending, add cron/retry mechanism |
| 100MB upload timeout | CF Workers paid plan allows 100MB body, test with large files |
