# Phase 2: VPS Extraction Service

## Context
- [SP1 Plan](./plan.md)
- [Phase 1](./phase-01-db-schema-internal-api.md) must be completed first
- VPS has Docker + Redis already running

## Overview
- **Priority:** P0
- **Status:** Completed
- **Description:** Build Python FastAPI service with BullMQ (redis) for text extraction. Supports PDF/DOCX/PPTX via Docling, images via Gemini Flash, plain text via direct read. Deployed as Docker container on VPS.

## Key Insights
- Docling is a Python library by IBM for document conversion (PDF, DOCX, PPTX → text/markdown)
- BullMQ has a Python port (`bullmq` package) for Redis-based job queues
- Gemini Flash is cost-effective for image description (~$0.01 per image)
- FastAPI provides the HTTP endpoint for receiving jobs from CF Workers

## Requirements

### Functional
- Accept extraction jobs via HTTP POST /jobs
- Queue jobs in Redis via BullMQ
- Process jobs by content_type routing
- POST extracted text back to AgentWiki API internal endpoint
- Health check endpoint GET /health

### Non-functional
- Max job processing time: 5 minutes
- BullMQ concurrency: 2-3 workers (prevent OOM on VPS)
- Retry failed jobs 3 times with exponential backoff
- Clean up temp files after processing
- Redis persistence (AOF) for job durability

## Architecture

```
┌──────────────────────────────────────────────┐
│ FastAPI Server (:8100)                        │
│  POST /jobs  → validate → push to BullMQ     │
│  GET /health → { status: ok, queue_size: N }  │
└──────────────────────┬───────────────────────┘
                       │
                  Redis (BullMQ)
                       │
┌──────────────────────▼───────────────────────┐
│ BullMQ Worker (concurrent: 2)                 │
│                                               │
│  1. Download file from R2 presigned URL       │
│  2. Route by content_type:                    │
│     ├─ text/* → direct read (utf-8)           │
│     ├─ application/pdf → Docling              │
│     ├─ application/vnd.openxml* → Docling     │
│     ├─ image/* → Gemini Flash API             │
│     └─ other → mark unsupported               │
│  3. POST result to AgentWiki internal API     │
│  4. Cleanup temp files                        │
└──────────────────────────────────────────────┘
```

## Related Code Files

### Create (on VPS, new project)
```
extraction-service/
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── app/
│   ├── main.py              # FastAPI app + /jobs + /health
│   ├── worker.py             # BullMQ worker + job processing
│   ├── extractors/
│   │   ├── __init__.py
│   │   ├── text.py           # Plain text extraction
│   │   ├── document.py       # PDF/DOCX/PPTX via Docling
│   │   └── image.py          # Image description via Gemini
│   ├── config.py             # Environment config
│   └── models.py             # Pydantic models
└── .env.example
```

## Implementation Steps

1. **Project scaffold**
   - Create `extraction-service/` directory (can be in repo root or separate repo)
   - Create `requirements.txt`:
     ```
     fastapi>=0.115.0
     uvicorn>=0.34.0
     bullmq>=2.0.0
     docling>=2.0.0
     google-genai>=1.0.0
     httpx>=0.28.0
     python-dotenv>=1.0.0
     ```

2. **Config module (`config.py`)**
   ```python
   # Environment variables:
   REDIS_URL = "redis://redis:6379"
   AGENTWIKI_API_URL = "https://api.agentwiki.cc"
   AGENTWIKI_INTERNAL_SECRET = "..."
   GEMINI_API_KEY = "..."
   WORKER_CONCURRENCY = 2
   JOB_TIMEOUT_MS = 300_000  # 5 min
   MAX_RETRIES = 3
   ```

3. **Pydantic models (`models.py`)**
   ```python
   class ExtractionJob(BaseModel):
       upload_id: str
       tenant_id: str
       file_url: str  # R2 presigned URL
       content_type: str
       filename: str

   class ExtractionResult(BaseModel):
       uploadId: str
       tenantId: str
       extractedText: str
       extractionMethod: str  # docling, gemini, direct, unsupported
       error: str | None = None
   ```

4. **FastAPI app (`main.py`)**
   - `POST /jobs` — validate ExtractionJob, push to BullMQ queue "extraction"
   - `GET /health` — return queue size, worker status
   - Startup: launch BullMQ worker in background

5. **Text extractor (`extractors/text.py`)**
   - Download file from URL
   - Read as UTF-8 (fallback: latin-1)
   - Return text content

6. **Document extractor (`extractors/document.py`)**
   - Download file to temp dir
   - Use Docling's `DocumentConverter` to convert to text/markdown
   - Return converted text
   - Cleanup temp file

7. **Image extractor (`extractors/image.py`)**
   - Download image
   - Send to Gemini Flash API with prompt: "Describe this image in detail for knowledge base indexing. Include all visible text, diagrams, charts, and visual elements."
   - Return description text

8. **BullMQ worker (`worker.py`)**
   - Connect to Redis
   - Process "extraction" queue
   - Route by content_type to appropriate extractor
   - POST result to AgentWiki internal API via httpx
   - Handle errors: set extraction_method=unsupported or report error
   - Concurrency: 2, timeout: 5min, retries: 3

9. **Dockerfile**
   ```dockerfile
   FROM python:3.11-slim
   WORKDIR /app
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   COPY app/ ./app/
   CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]
   ```

10. **docker-compose.yml**
    - extraction-api service (build, ports, env, depends_on redis)
    - Redis service (if not using existing Redis)
    - Volumes for Redis persistence

11. **Test locally**
    - `docker compose up --build`
    - POST a test job with a sample PDF URL
    - Verify extraction + callback to mock API

## Content Type Routing

| Content Type | Method | Library |
|-------------|--------|---------|
| `text/plain`, `text/markdown`, `text/csv`, `text/html` | direct | Built-in |
| `application/pdf` | docling | Docling |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | docling | Docling |
| `application/vnd.openxmlformats-officedocument.presentationml.presentation` | docling | Docling |
| `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | docling | Docling |
| `image/png`, `image/jpeg`, `image/webp`, `image/gif` | gemini | google-genai |
| Everything else | unsupported | — |

## Todo List

- [x] Create project scaffold
- [x] Implement config + models
- [x] Implement FastAPI app (POST /jobs, GET /health)
- [x] Implement text extractor
- [x] Implement document extractor (Docling)
- [x] Implement image extractor (Gemini Flash)
- [x] Implement BullMQ worker with routing
- [x] Create Dockerfile + docker-compose.yml
- [x] Test locally with sample files
- [x] Deploy to VPS

## Success Criteria

- POST /jobs accepts job and returns 202
- BullMQ worker processes jobs within 5 minutes
- PDF/DOCX/PPTX text extracted correctly
- Image descriptions generated via Gemini
- Results POSTed back to AgentWiki API
- Service recovers after restart (Redis persistence)

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Docling OOM on large PDFs | Memory limit in Docker, BullMQ concurrency=2 |
| Gemini rate limits | Exponential backoff, batch grouping |
| Network timeout downloading from R2 | httpx timeout 60s, retry in BullMQ |
| Corrupt files crashing extractors | Try/except per extractor, report error gracefully |

## Security Considerations

- VPS endpoint should be behind firewall, only accessible from CF Workers IPs
- Internal secret not logged or exposed
- Temp files cleaned up after processing
- No persistent storage of extracted content on VPS
