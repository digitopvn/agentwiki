---
title: "SP1: Text Extraction Pipeline"
description: "Extract text from uploaded files (PDF/DOCX/PPTX/images/text) via VPS Python service, vectorize + summarize for search & AI context"
status: completed
priority: P0
effort: 32h
branch: feat/text-extraction-pipeline
tags: [storage, extraction, docling, gemini, redis, bullmq, vectorize, r2]
created: 2026-03-21
issue: https://github.com/digitopvn/agentwiki/issues/22
brainstorm: plans/reports/brainstorm-260321-1139-storage-cloudflare-r2.md
blockedBy: []
blocks: [260321-1139-sp2-storage-ui-ux, 260321-1139-sp3-cli-mcp-storage-search]
---

# SP1: Text Extraction Pipeline

Extract text from uploaded files via VPS Python service (Docling + Gemini), store extracted text, vectorize for semantic search, and summarize for quick display.

## Current State

- Upload: R2 storage with D1 metadata (10MB limit, no processing)
- Queue: CF Queues for document embed/summarize jobs (working)
- Vectorize: BAAI BGE embeddings via Workers AI (working)
- No text extraction, no file content indexing

## Architecture

```
Upload → API Worker
  ├─ R2.put(file)
  ├─ D1: uploads row (extraction_status=pending)
  └─ HTTP POST → VPS /jobs endpoint
                    ↓
              Redis (BullMQ)
                    ↓
              FastAPI Worker
              ├─ text/* → direct read
              ├─ PDF/DOCX/PPTX → Docling
              ├─ image/* → Gemini Flash
              └─ other → unsupported
                    ↓
              POST /api/internal/extraction-result
                    ↓
              API Worker:
              ├─ D1: file_extractions table
              ├─ D1: uploads.extraction_status
              ├─ CF Queue → embed extracted text
              └─ CF Queue → summarize extracted text
```

## Phases

| # | Phase | Effort | Status | File |
|---|-------|--------|--------|------|
| 1 | DB Schema + Internal API | 8h | Completed | [phase-01](./phase-01-db-schema-internal-api.md) |
| 2 | VPS Extraction Service | 12h | Completed | [phase-02](./phase-02-vps-extraction-service.md) |
| 3 | Upload Flow Integration + Queue | 8h | Completed | [phase-03](./phase-03-upload-flow-integration.md) |
| 4 | Error Handling + Monitoring | 4h | Completed | [phase-04](./phase-04-error-handling-monitoring.md) |

## Key Dependencies

- VPS with Docker + Redis already available
- Cloudflare Queues consumer already working (handler.ts)
- Vectorize + Workers AI embedding pipeline already working
- Gemini API key required for image extraction

## Success Criteria

- Uploaded text/PDF/DOCX/PPTX files → extracted text stored in < 60s
- Uploaded images → Gemini description stored in < 30s
- Extracted content indexed in Vectorize for semantic search
- Unsupported formats gracefully marked, no errors
- VPS service recoverable after downtime (Redis persistence)
