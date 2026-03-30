# SP1 Text Extraction Pipeline Completion

**Date**: 2026-03-21 14:45
**Severity**: Medium
**Component**: Document extraction, uploads service
**Status**: Resolved

## What Happened

Completed implementation of SP1 text extraction pipeline for AgentWiki. Successfully built async document processing system handling PDFs, DOCX, PPTX with OCR for images via Gemini Flash.

## The Brutal Truth

Code review revealed **2 security vulnerabilities** that almost shipped to production. The public file endpoint had zero authentication checks — any R2 object would be served. The VPS extraction endpoint was completely exposed to SSRF attacks. These aren't theoretical risks; they're critical gaps that could compromise data access.

## Technical Details

**Implemented:**
- Extended uploads schema: extraction_status, summary fields; new file_extractions table for large text blobs
- VPS FastAPI service with Docling + Gemini Flash integration
- Redis BullMQ job queue (KV unavailable for VPS consumption)
- CF Workers queue handler dispatching to embed/summarize jobs
- Download tokens via KV (15min TTL) instead of R2 presigned URLs
- Retry cron: 5min intervals, max 2h window, then mark failed
- File size limit increased: 10MB → 100MB
- Internal API: POST /api/internal/extraction-result with shared secret

**Critical Fixes:**
- **C1**: Length-leaking timing attack in secret comparison → fixed with constant-time comparison
- **C2**: Public endpoint served any R2 object without auth → added 401 guard
- **C3**: VPS /jobs endpoint unprotected (SSRF vector) → added X-Internal-Secret validation
- **H1**: TOCTOU race on download tokens → delete before serving
- **M2**: Path traversal in Python extractor → sanitized with os.path.basename

## What We Tried

Initial design used CF Queues for VPS consumption. That failed—CF Queues can only be read by CF Workers. Switched to Redis BullMQ on VPS, which works but adds infrastructure dependency. Worth the trade-off.

## Root Cause Analysis

Security gaps happened because extraction endpoints weren't reviewed early enough. VPS is external infrastructure, and the internal API should have required auth from day one. Download token race condition was a threading assumption that didn't hold under load.

## Lessons Learned

1. **Auth-first mindset**: External service endpoints are attack surface. Default to deny, prove trust.
2. **Infrastructure constraints matter early**: Redis vs CF Queues decision should inform architecture upfront, not emerge in implementation.
3. **Race conditions hide under scale**: TOCTOU bugs only manifest under concurrent load. Add load testing to code review checklist.

## Next Steps

- Monitor VPS extraction latency in production (Docling extraction can hit 30s+ for large docs)
- Track failed extractions weekly; improve model handling for unsupported formats
- Consider extraction timeout tuning based on real data distribution

---

**Files Modified:**
- `/api/src/db/schema.ts` — uploads table extension, file_extractions table
- `/api/src/workers/queues.ts` — CF Queues handlers
- `/api/src/routes/admin.ts` — extraction status/retry endpoints
- `/api/src/routes/upload.ts` — internal API, download token logic
- VPS: Python FastAPI service (new deployment)
