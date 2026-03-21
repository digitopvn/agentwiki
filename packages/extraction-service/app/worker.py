"""BullMQ worker that processes extraction jobs from Redis queue."""

import asyncio
import logging
import httpx
from bullmq import Worker

from app.config import (
    REDIS_URL,
    AGENTWIKI_API_URL,
    AGENTWIKI_INTERNAL_SECRET,
    WORKER_CONCURRENCY,
    JOB_TIMEOUT_MS,
)
from app.models import ExtractionJob, ExtractionResult
from app.extractors.text_extractor import extract_text
from app.extractors.document_extractor import extract_document
from app.extractors.image_extractor import extract_image

logger = logging.getLogger(__name__)

# Content type routing sets
TEXT_TYPES = {"text/plain", "text/markdown", "text/csv", "text/html"}
DOCUMENT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}


async def process_job(job, _token) -> str:
    """Process a single extraction job."""
    data = job.data
    extraction_job = ExtractionJob(**data)
    logger.info("Processing job %s: %s (%s)", job.id, extraction_job.filename, extraction_job.content_type)

    extracted_text = ""
    method = "unsupported"
    error = None

    try:
        ct = extraction_job.content_type

        if ct in TEXT_TYPES:
            extracted_text = await extract_text(extraction_job.file_url, ct)
            method = "direct"
        elif ct in DOCUMENT_TYPES:
            extracted_text = await extract_document(extraction_job.file_url, extraction_job.filename)
            method = "docling"
        elif ct in IMAGE_TYPES:
            extracted_text = await extract_image(extraction_job.file_url)
            method = "gemini"
        else:
            method = "unsupported"

    except Exception as e:
        logger.error("Extraction failed for %s: %s", extraction_job.upload_id, e)
        error = str(e)
        method = method if method != "unsupported" else "direct"

    # Post result back to AgentWiki API
    result = ExtractionResult(
        uploadId=extraction_job.upload_id,
        tenantId=extraction_job.tenant_id,
        extractedText=extracted_text,
        extractionMethod=method,
        error=error,
    )

    await post_result(result)
    return f"Processed: {extraction_job.filename} ({method})"


async def post_result(result: ExtractionResult):
    """POST extraction result back to AgentWiki internal API."""
    url = f"{AGENTWIKI_API_URL}/api/internal/extraction-result"
    headers = {
        "Content-Type": "application/json",
        "X-Internal-Secret": AGENTWIKI_INTERNAL_SECRET,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json=result.model_dump(), headers=headers)
        if response.status_code != 200:
            logger.error("Failed to post result for %s: %s %s", result.uploadId, response.status_code, response.text)
            response.raise_for_status()

    logger.info("Posted result for %s: status=%s", result.uploadId, result.extractionMethod)


def parse_redis_opts(url: str) -> dict:
    """Parse Redis URL into BullMQ connection options."""
    # redis://host:port or redis://password@host:port
    from urllib.parse import urlparse
    parsed = urlparse(url)
    opts = {"host": parsed.hostname or "localhost", "port": parsed.port or 6379}
    if parsed.password:
        opts["password"] = parsed.password
    return opts


async def start_worker():
    """Start the BullMQ worker to consume extraction queue."""
    redis_opts = parse_redis_opts(REDIS_URL)
    logger.info("Starting extraction worker (concurrency=%d, timeout=%dms)", WORKER_CONCURRENCY, JOB_TIMEOUT_MS)

    worker = Worker(
        "extraction",
        process_job,
        {
            "connection": redis_opts,
            "concurrency": WORKER_CONCURRENCY,
            "limiter": {"max": WORKER_CONCURRENCY, "duration": 1000},
        },
    )

    # Keep worker running
    while True:
        await asyncio.sleep(1)
