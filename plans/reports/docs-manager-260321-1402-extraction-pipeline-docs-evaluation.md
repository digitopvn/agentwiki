# SP1 Text Extraction Pipeline - Documentation Evaluation Report

**Date**: 2026-03-21
**Status**: EVALUATION COMPLETE — Updates Required

## Executive Summary

The SP1 Text Extraction Pipeline implementation introduces significant new functionality requiring **substantial documentation updates**. All three core doc files need changes to reflect the new extraction architecture, database schema, and API endpoints.

**Update scope:**
- `system-architecture.md` — Add new extraction pipeline architecture section
- `codebase-summary.md` — Add fileExtractions table, update uploads table, document new services/endpoints
- `README.md` — Optionally update file size limit and mention extraction feature

## Changes Implemented (from code analysis)

### Database Schema Changes
- **uploads** table: Added `extractionStatus` and `summary` columns
- **fileExtractions** table: NEW — stores extracted text separately from uploads metadata (e.g., 184–198 in schema.ts)
- `extractionStatus` values: `pending | processing | completed | failed | unsupported`
- `extractionMethod` values: `docling | gemini | direct | unsupported`

### New Services
1. **extraction-service.ts** — Handles extraction result callbacks from VPS service
2. **extraction-job-dispatcher.ts** — Dispatches jobs to VPS, manages download tokens
3. **extraction-retry-service.ts** — Cron-based retry for stuck extractions (referenced, not deeply reviewed)

### New API Routes
1. **`POST /api/internal/extraction-result`** — Receives extraction results (shared secret auth via internalAuth middleware)
2. **`GET /api/internal/extraction-status`** — Admin endpoint: counts by extraction status
3. **`POST /api/internal/extraction-retry/:id`** — Admin endpoint: manually retry extraction
4. **File download with token** — `/api/files/{key}?dl_token={token}` for VPS access (in uploads.ts)

### Infrastructure Changes
- **VPS Python extraction service** — FastAPI + BullMQ + Docling + Gemini (external, not in repo)
- **Queue jobs** — `embed-upload`, `summarize-upload` jobs in queue handler
- **File size limit** — Increased from 10MB to 100MB (line 11 in uploads.ts)
- **Download tokens** — 15-min TTL, stored in KV, one-time use (extraction-job-dispatcher.ts, uploads.ts)
- **Vector cleanup** — Handled as part of embed-upload job (queue handler)

## Documentation Status Assessment

### `system-architecture.md` (723 lines)
**Status:** Needs new section (MAJOR UPDATE)

**What's missing:**
- No mention of file extraction pipeline
- Async processing section exists but doesn't cover extraction workflow
- No mention of fileExtractions table in Data Storage Layer
- No mention of VPS extraction service
- No mention of `/api/internal/*` routes
- No mention of download tokens for VPS access

**Impact:** Readers have no architectural understanding of how files → extracted text → embeddings/summaries flow.

### `codebase-summary.md` (577 lines)
**Status:** Needs updates in multiple sections (MAJOR UPDATE)

**What's missing:**
- `fileExtractions` table not in Database Schema section
- `uploads` table schema incomplete (missing extractionStatus, summary columns)
- New extraction services not documented in services list
- No mention of extraction-job-dispatcher, extraction-service, extraction-retry-service
- `/api/internal/*` endpoints not listed in API Routes Summary
- `EXTRACTABLE_CONTENT_TYPES` constant not documented
- Queue messages (embed-upload, summarize-upload) not detailed

**Impact:** Developers exploring codebase won't understand extraction architecture or find new services without searching.

### `README.md` (297 lines)
**Status:** Needs optional update (MINOR)

**What could be updated:**
- File size limit increase: "Uploads & File Serving" section mentions 10MB (outdated, now 100MB)
- Could briefly mention extraction feature in "Key Features" section
- Could add note about supported file types in "Quick Start" or "Uploads" endpoint docs

**Impact:** Low priority — README is high-level. Users will discover via API docs.

---

## Detailed Update Plan

### 1. `system-architecture.md` Changes

**Add new section: "Async Processing Pipeline → File Extraction" (~80 lines)**

Location: After existing Queue Architecture section (after line 475)

Content should cover:
- Architecture diagram showing: User uploads → dispatch job → VPS service → callback → embed/summarize
- VPS extraction service design (FastAPI, BullMQ, Docling, Gemini)
- Download token mechanism for secure VPS access
- Extraction job dispatch process (extractable content types check)
- Result callback processing (fileExtractions storage, status updates)
- Queue jobs for embedding and summarization
- Error handling and retry strategy
- File types and limits

### 2. `codebase-summary.md` Changes

**Update Database Schema section (~10 new lines)**

After `uploads` table definition (line 377), add:

```ts
### file_extractions
{
  id: string          (PK)
  uploadId: string    (FK → uploads, cascade delete)
  tenantId: string    (FK → tenants)
  extractedText: string (large text body from PDF/doc extraction)
  charCount: int      (length of extractedText)
  vectorId: string    (prefix for Vectorize vector IDs)
  extractionMethod: string ("docling" | "gemini" | "direct" | "unsupported")
  errorMessage?: string (if extraction failed)
  createdAt: timestamp
  updatedAt: timestamp
}
```

Also update `uploads` table to reflect new columns:
```ts
extractionStatus: string ("pending" | "processing" | "completed" | "failed" | "unsupported")
summary: string (AI-generated summary of extracted text)
```

**Add new services to Services section (~12 lines)**

After UploadService, add:

```ts
#### ExtractionService
- Result callback handling from VPS service
- FileExtraction record creation/update
- Status tracking (pending → processing → completed/failed/unsupported)
- Triggering embed + summarize queue jobs

#### ExtractionJobDispatcher
- Extractable content type validation
- Download token generation (15-min TTL)
- VPS service job dispatch via HTTP POST
- File URL construction with auth tokens

#### ExtractionRetryService
- Cron-based job for stuck extractions
- Status monitoring and retry logic
```

**Update API Routes Summary (~8 new lines)**

Add new subsection after "Uploads" (before "Files"):

```
### Internal API (`/api/internal`)
- `POST /extraction-result` — Callback from VPS extraction service (shared secret auth)
- `GET /extraction-status` — Admin: extraction pipeline status (counts by status)
- `POST /extraction-retry/:id` — Admin: manually retry failed extraction
```

Also update "Files" subsection to document download token support:
```
### Files (`/api/files/:key`)
- `GET` — Serve file from R2 (auth, public, or download token access)
```

**Update Directory Structure (~4 new lines)**

In packages/api/src/services section, add:
```
│   │   │   ├── extraction-service.ts — VPS result callback handler
│   │   │   ├── extraction-job-dispatcher.ts — Job dispatch + token mgmt
│   │   │   └── extraction-retry-service.ts — Stuck job retry logic
```

Also document middleware file:
```
│   │   │   ├── internal-auth.ts — Shared secret auth for internal endpoints
```

### 3. `README.md` Optional Updates

**Update file size info (line 11 in uploads.ts)**
Change: "5 files/min (50MB/day)" → Document 100MB max per file

**Key Features section (lines 11–24)**
Could add: "Text extraction from uploaded documents (PDF, DOCX, etc.) with AI summarization"

---

## Line Count Analysis

| File | Current | Additions | Est. Final | Fits in 800? |
|------|---------|-----------|-----------|------------|
| system-architecture.md | 723 | ~80 | ~803 | Marginal |
| codebase-summary.md | 577 | ~34 | ~611 | Yes |
| README.md | 297 | 0–5 | ~302 | Yes |

**Note:** `system-architecture.md` will exceed 800 LOC after extraction section. Consider:
- **Option A**: Move "Monitoring & Observability" + "Disaster Recovery" to separate file
- **Option B**: Keep extraction section concise (diagram + 3–4 paragraphs)
- **Option C**: Create separate `docs/extraction-pipeline.md` for detailed info

Recommendation: **Option B** (concise extraction section within system-architecture.md).

---

## Implementation Order

1. **Update `codebase-summary.md` first** (lower risk, adds context)
2. **Update `system-architecture.md`** (main architectural doc)
3. **Optional: Update `README.md`** (cosmetic only)

---

## Verification Checklist

After updates, verify:
- [ ] All new tables from schema.ts documented
- [ ] All new services listed with brief descriptions
- [ ] New `/api/internal/*` endpoints documented
- [ ] Download token mechanism explained
- [ ] Queue jobs (embed-upload, summarize-upload) described
- [ ] Extraction status values and methods documented
- [ ] VPS service architecture explained (high-level)
- [ ] Error handling and retry strategy noted
- [ ] File size limit (100MB) correct in docs
- [ ] All cross-references valid
- [ ] No lines exceed 800 LOC per doc
- [ ] Links to related sections work

---

## Unresolved Questions

None — implementation is clear and complete in codebase. VPS service is external (not in repo) but architecture is well-defined via job dispatch and callback patterns.
