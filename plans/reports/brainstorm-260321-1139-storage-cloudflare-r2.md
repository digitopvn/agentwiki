# Brainstorm Report: Storage (Cloudflare R2) — Issue #22

**Date:** 2026-03-21
**Issue:** https://github.com/digitopvn/agentwiki/issues/22
**Status:** Design approved, ready for planning

---

## Problem Statement

AgentWiki has basic file upload/storage (R2) but lacks:
- Text extraction from uploaded files (PDF, DOCX, PPTX, images, plain text)
- Vectorization & summarization of extracted content for search + AI context
- Storage-dedicated UI (currently buried in Settings tab)
- CLI/MCP flags to search within uploaded file content
- Drag & drop upload UX

## Decomposition

Issue decomposed into **3 independent sub-projects**, each with own plan → implement → test cycle:

| # | Sub-project | Priority | Dependency |
|---|-------------|----------|------------|
| SP1 | Text Extraction Pipeline | P0 (Core) | None |
| SP2 | Storage UI/UX Enhancements | P1 | SP1 (needs extraction_status) |
| SP3 | CLI/MCP Storage Search | P2 | SP1 (needs extracted text indexed) |

---

## SP1: Text Extraction Pipeline

### Architecture

```
User Upload → API (Hono Worker)
                ├─ Store file in R2
                ├─ Insert uploads row (D1, status=pending)
                └─ HTTP POST job to VPS extraction service
                        ↓
                  Redis (BullMQ) on VPS
                        ↓
                  FastAPI Worker (BullMQ consumer)
                  ├─ Plain text → read directly
                  ├─ PDF/DOCX/PPTX → Docling
                  └─ Images → Gemini Flash API
                        ↓
                  POST /api/internal/extraction-result
                  (authenticated via shared secret)
                        ↓
                  API Worker receives result:
                  ├─ D1: file_extractions.extracted_text
                  ├─ D1: uploads.extraction_status = completed
                  ├─ D1: uploads.summary (short)
                  ├─ Vectorize: embed extracted text
                  └─ Workers AI: generate summary
```

### Database Schema Changes

**Extend `uploads` table:**
```sql
ALTER TABLE uploads ADD COLUMN extraction_status TEXT DEFAULT 'pending';
-- Values: pending, processing, completed, failed, unsupported
ALTER TABLE uploads ADD COLUMN summary TEXT;
```

**New `file_extractions` table:**
```sql
CREATE TABLE file_extractions (
  id TEXT PRIMARY KEY,
  upload_id TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  extracted_text TEXT NOT NULL,
  char_count INTEGER DEFAULT 0,
  vector_id TEXT,
  extraction_method TEXT, -- 'docling', 'gemini', 'direct', 'unsupported'
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_file_extractions_upload ON file_extractions(upload_id);
CREATE INDEX idx_file_extractions_tenant ON file_extractions(tenant_id);
```

**Rationale:** Full extracted text separated because it can be very large (MBs). Uploads table stays lightweight for listing. Summary stays in uploads for quick display.

### VPS Extraction Service

**Stack:** Python 3.11 + FastAPI + BullMQ (via redis) + Docling + google-genai

**Docker Compose:**
```yaml
services:
  extraction-api:
    build: ./extraction-service
    ports: ["8100:8100"]
    environment:
      - REDIS_URL=redis://redis:6379
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - AGENTWIKI_API_URL=https://api.agentwiki.cc
      - AGENTWIKI_INTERNAL_SECRET=${INTERNAL_SECRET}
    depends_on: [redis]
  redis:
    image: redis:7-alpine
    volumes: ["redis-data:/data"]
```

**Endpoints:**
- `POST /jobs` — Receive extraction job from CF Worker (file_url, upload_id, tenant_id, content_type)
- `GET /health` — Health check

**Processing logic:**
1. Receive job → push to BullMQ
2. Worker picks up job → download file from R2 presigned URL
3. Route by content_type:
   - `text/*` → read directly
   - `application/pdf`, `application/vnd.openxmlformats*` → Docling
   - `image/*` → Gemini Flash (describe image in detail)
   - Everything else → mark `unsupported`
4. POST extracted text back to AgentWiki internal API

### Internal API Endpoint

**`POST /api/internal/extraction-result`**

Auth: `X-Internal-Secret` header matching `INTERNAL_SECRET` env var.

```typescript
// Request body
{
  uploadId: string;
  tenantId: string;
  extractedText: string;
  extractionMethod: 'docling' | 'gemini' | 'direct' | 'unsupported';
  error?: string;
}

// Handler:
// 1. Insert into file_extractions
// 2. Update uploads.extraction_status
// 3. Enqueue vectorize job (CF Queue)
// 4. Enqueue summarize job (CF Queue)
```

### Edge Cases

| Case | Handling |
|------|----------|
| ZIP files | Status `unsupported`, skip |
| Video files | Status `unsupported`, skip |
| Binary/executable | Status `unsupported`, skip |
| Corrupt PDF | Docling error → status `failed`, store error_message |
| VPS down | Job stays in Redis, auto-retry on VPS recovery |
| File > 100MB | Reject at upload API level |
| Extraction timeout | BullMQ job timeout (5min), retry 3x, then `failed` |
| Empty extraction | Store empty text, status `completed`, no vectorize |

### Security

- Internal API authenticated via shared secret (not exposed publicly)
- VPS downloads files via presigned R2 URLs (time-limited, 15min)
- No file content stored on VPS permanently (process in memory/tmp, cleanup)
- Rate limit on internal endpoint

---

## SP2: Storage UI/UX Enhancements

### Sidebar Storage Icon
- `HardDrive` icon (from lucide-react) in left sidebar, below existing icons
- Click → opens slide-out drawer (right side, 400px wide)
- Badge showing upload count or extraction-in-progress count

### Storage Drawer
- Header: "Storage" + upload button + close
- Search/filter bar (by filename, content_type)
- File grid (thumbnails for images, icons for others)
- Each file card shows: filename, size, extraction_status indicator, date
- Click file → preview (images inline, PDF in iframe, text in code block)
- Actions: download, delete, copy URL, link to document

### Global Drop Zone
- Drag file anywhere in app → full-screen overlay with "Drop to upload"
- Visual indicator (border highlight, icon)
- Drop → upload to R2, show progress in Storage drawer (auto-open)
- Support multi-file drag
- 100MB limit per file, show error for oversized

### Upload Progress
- Progress bar per file in drawer
- After upload completes → show extraction_status spinner
- Status transitions: uploading → extracting → ready / failed / unsupported

### Tech Decisions
- Zustand store for drawer open/close state
- TanStack Query for upload list (with polling for extraction_status)
- `react-dropzone` or native drag events for global drop zone

---

## SP3: CLI/MCP Storage Search

### CLI Enhancement
```bash
# Search within uploaded files' extracted text
agentwiki search "quarterly report" --source storage
agentwiki search "quarterly report" --source docs
agentwiki search "quarterly report" --source all  # default

# List uploads with extraction status
agentwiki upload list [--status completed|pending|failed]
```

### MCP Enhancement
- Add `source` parameter to existing `search` tools: `"docs"` | `"storage"` | `"all"`
- New tool: `storage_search` — dedicated search within file extractions
- Update `upload_list` tool to include extraction_status

### API Search Enhancement
- Extend `GET /api/search` with `source` query param
- When source includes "storage":
  - Keyword search: query `file_extractions.extracted_text`
  - Semantic search: query Vectorize with storage-specific namespace/filter
  - RRF merge with document results

---

## Evaluated Approaches (Extraction Service)

### Approach A: CF Queue + Worker Proxy ❌
- **Pro:** Stays in CF ecosystem
- **Con:** Worker 30s timeout (paid: 15min) may not be enough for large PDFs. Double hop (Queue → Worker → VPS → Worker). More complex error handling.

### Approach B: VPS Polls API ❌
- **Pro:** Simplest, no queue infra
- **Con:** Polling latency (10s+), wasted requests, harder to scale, no backpressure

### Approach C: Redis Queue on VPS ✅ (Selected)
- **Pro:** Robust job management (retries, timeouts, dead-letter), BullMQ dashboard, VPS already has Redis, natural backpressure
- **Con:** Workers must HTTP POST to VPS (not pure queue push from CF)
- **Mitigation:** VPS exposes simple `/jobs` endpoint, Workers POST async (fire-and-forget with retry)

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| VPS downtime | Extraction backlog | Redis persists jobs, auto-retry on recovery |
| Large file processing OOM | Worker crash | BullMQ concurrency limit (2-3), memory monitoring |
| Docling version issues | Extraction failures | Pin Docling version, integration tests |
| Gemini API rate limits | Image extraction delays | Exponential backoff, batch grouping |
| R2 presigned URL expiry | Download failures | 15min TTL, regenerate on retry |
| D1 row size limit | Can't store huge text | file_extractions separate table, chunk if needed |

---

## Success Metrics

- Files with extractable content have `extraction_status = completed` within 60s of upload
- Extracted content searchable via hybrid search (keyword + semantic)
- Storage drawer loads < 500ms
- Global drag & drop works on all major browsers
- CLI `--source storage` returns relevant results from file content

---

## Implementation Order

1. **SP1: Text Extraction Pipeline** (2-3 phases)
   - Phase 1: DB schema + internal API + VPS service skeleton
   - Phase 2: Docling/Gemini extraction logic + vectorize/summarize integration
   - Phase 3: Error handling, retries, monitoring

2. **SP2: Storage UI/UX** (2 phases)
   - Phase 1: Sidebar icon + drawer + file list
   - Phase 2: Global drop zone + upload progress + extraction status

3. **SP3: CLI/MCP Search** (1 phase)
   - Add source param to search API, CLI, MCP tools

---

## Next Steps

- [ ] Create detailed implementation plan for SP1
- [ ] Create detailed implementation plan for SP2
- [ ] Create detailed implementation plan for SP3
