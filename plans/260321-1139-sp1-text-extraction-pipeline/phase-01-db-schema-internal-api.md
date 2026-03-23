# Phase 1: DB Schema + Internal API

## Context
- [Brainstorm Report](../reports/brainstorm-260321-1139-storage-cloudflare-r2.md)
- [SP1 Plan](./plan.md)
- Schema: `packages/api/src/db/schema.ts`
- Queue handler: `packages/api/src/queue/handler.ts`
- Env: `packages/api/src/env.ts`

## Overview
- **Priority:** P0 (foundation for all SP1 work)
- **Status:** Completed
- **Description:** Extend uploads table, create file_extractions table, add internal API endpoint for extraction results, extend queue handler for file embedding/summarization.

## Key Insights
- D1 SQLite via Drizzle ORM — all schema in `packages/api/src/db/schema.ts`
- Migrations generated via `pnpm -F @agentwiki/api db:generate`
- Queue handler already processes embed/summarize jobs for documents
- Vectorize uses `org_id` (tenantId) + `doc_id` metadata — need `source_type` + `upload_id` for storage vectors

## Requirements

### Functional
- Extend `uploads` table with `extraction_status` and `summary` columns
- Create `file_extractions` table for extracted text storage
- Internal API endpoint `POST /api/internal/extraction-result` with shared secret auth
- Queue handler supports `embed-upload` and `summarize-upload` job types

### Non-functional
- Internal endpoint NOT exposed to public (shared secret auth)
- Extracted text can be MBs — separate table prevents uploads table bloat
- Migration must be backward-compatible (new columns have defaults)

## Architecture

### Schema Changes

```typescript
// Extend uploads table
export const uploads = sqliteTable('uploads', {
  // ... existing columns ...
  extractionStatus: text('extraction_status').default('pending'),
  // Values: pending, processing, completed, failed, unsupported
  summary: text('summary'),
})

// New table
export const fileExtractions = sqliteTable('file_extractions', {
  id: text('id').primaryKey(),
  uploadId: text('upload_id').notNull().references(() => uploads.id, { onDelete: 'cascade' }),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  extractedText: text('extracted_text').notNull(),
  charCount: integer('char_count').default(0),
  vectorId: text('vector_id'), // prefix for Vectorize vectors
  extractionMethod: text('extraction_method'), // docling, gemini, direct, unsupported
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})
```

### Internal API Endpoint

```typescript
// POST /api/internal/extraction-result
// Auth: X-Internal-Secret header
// Body: { uploadId, tenantId, extractedText, extractionMethod, error? }
// Handler:
//   1. Validate secret
//   2. Insert/update file_extractions
//   3. Update uploads.extraction_status
//   4. If text extracted: enqueue embed-upload + summarize-upload jobs
//   5. If error: set status=failed, store error_message
```

### Queue Handler Extensions

```typescript
// New message types in handler.ts:
case 'embed-upload':
  // Similar to embedDocumentJob but for file extractions
  // Uses upload_id prefix for vector IDs
  // Metadata includes source_type: 'upload'
  break
case 'summarize-upload':
  // Summarize extracted text using tenant's AI provider
  // Store summary in uploads.summary
  break
```

### Env Extension

```typescript
// Add to Env type
EXTRACTION_INTERNAL_SECRET: string // shared secret for VPS ↔ API auth
EXTRACTION_SERVICE_URL: string    // VPS extraction service URL
```

## Related Code Files

### Modify
- `packages/api/src/db/schema.ts` — add fileExtractions table, extend uploads
- `packages/api/src/env.ts` — add EXTRACTION_INTERNAL_SECRET, EXTRACTION_SERVICE_URL
- `packages/api/src/queue/handler.ts` — add embed-upload, summarize-upload handlers
- `packages/api/src/index.ts` — register internal routes
- `packages/api/wrangler.toml` — add new env vars binding
- `packages/shared/src/types.ts` — add ExtractionStatus type

### Create
- `packages/api/src/routes/internal.ts` — internal API routes (extraction result)
- `packages/api/src/services/extraction-service.ts` — extraction result handling logic
- `packages/api/src/middleware/internal-auth.ts` — shared secret validation middleware

## Implementation Steps

1. **Add schema changes to `schema.ts`**
   - Add `extractionStatus` and `summary` to uploads table
   - Create `fileExtractions` table with indexes
   - Export new table

2. **Generate migration**
   ```bash
   pnpm -F @agentwiki/api db:generate
   ```

3. **Add shared types**
   - `ExtractionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'unsupported'`
   - `ExtractionMethod = 'docling' | 'gemini' | 'direct' | 'unsupported'`
   - `ExtractionResultPayload` interface

4. **Create internal auth middleware**
   - Compare `X-Internal-Secret` header with `EXTRACTION_INTERNAL_SECRET` env var
   - Timing-safe comparison
   - Return 401 if mismatch

5. **Create extraction service**
   - `handleExtractionResult(env, payload)`:
     - Insert into file_extractions (upsert if exists)
     - Update uploads.extraction_status
     - If method !== 'unsupported' and text not empty:
       - Enqueue `embed-upload` job
       - Enqueue `summarize-upload` job
     - If error: set status=failed, store error

6. **Create internal routes**
   - `POST /api/internal/extraction-result` with internal auth middleware
   - Zod validation for request body

7. **Extend queue handler**
   - `embed-upload`: read file_extractions.extracted_text, chunk, embed via Workers AI, upsert to Vectorize with `source_type: 'upload'` and `upload_id` metadata
   - `summarize-upload`: summarize extracted text, store in uploads.summary

8. **Update env.ts and wrangler.toml**
   - Add new env var types and bindings

9. **Update listUploads to include new fields**
   - Return extraction_status, summary in list response

10. **Run type-check and build**
    ```bash
    pnpm type-check && pnpm build
    ```

## Todo List

- [x] Extend uploads table schema (extractionStatus, summary)
- [x] Create fileExtractions table schema
- [x] Generate Drizzle migration
- [x] Add shared types (ExtractionStatus, ExtractionMethod)
- [x] Create internal auth middleware
- [x] Create extraction service (handleExtractionResult)
- [x] Create internal routes (POST /api/internal/extraction-result)
- [x] Extend queue handler (embed-upload, summarize-upload)
- [x] Update env.ts + wrangler.toml
- [x] Update listUploads response to include new fields
- [x] Run type-check + build
- [x] Apply migration locally

## Success Criteria

- Migration applies cleanly
- Internal endpoint accepts extraction results with valid secret
- Invalid secret returns 401
- Queue handler processes embed-upload and summarize-upload jobs
- Vectorize vectors created with source_type=upload metadata
- Type-check passes

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| D1 text column size limits | Extracted text in separate table, chunked if > 1MB |
| Vectorize namespace collision with doc vectors | Use `upload-{uploadId}-{chunkIdx}` prefix for vector IDs |
| Migration on production D1 | Test locally first, backward-compatible defaults |

## Security Considerations

- Internal API only accessible with shared secret
- Timing-safe string comparison to prevent timing attacks
- Rate limit on internal endpoint (prevent abuse if secret leaked)
- No PII in extracted text stored without tenant isolation
