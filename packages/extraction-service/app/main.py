"""FastAPI app — receives extraction jobs from CF Workers and exposes health check."""

import asyncio
import logging
from contextlib import asynccontextmanager

import hmac
from fastapi import FastAPI, Header, HTTPException
from bullmq import Queue

from app.config import REDIS_URL, AGENTWIKI_INTERNAL_SECRET
from app.models import ExtractionJob
from app.worker import start_worker, parse_redis_opts

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

queue: Queue | None = None
worker_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start BullMQ queue and worker on app startup."""
    global queue, worker_task
    redis_opts = parse_redis_opts(REDIS_URL)
    queue = Queue("extraction", {"connection": redis_opts})
    worker_task = asyncio.create_task(start_worker())
    logger.info("Extraction service started")
    yield
    # Cleanup
    if worker_task:
        worker_task.cancel()
    if queue:
        await queue.close()


app = FastAPI(title="AgentWiki Extraction Service", lifespan=lifespan)


@app.post("/jobs", status_code=202)
async def create_job(job: ExtractionJob, x_internal_secret: str = Header(...)):
    """Receive extraction job from CF Worker, push to BullMQ queue."""
    if not hmac.compare_digest(x_internal_secret, AGENTWIKI_INTERNAL_SECRET):
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not queue:
        return {"error": "Queue not initialized"}, 500

    await queue.add(
        f"extract-{job.upload_id}",
        job.model_dump(),
        {"attempts": 3, "backoff": {"type": "exponential", "delay": 5000}},
    )

    logger.info("Queued extraction job: %s (%s)", job.filename, job.content_type)
    return {"status": "queued", "upload_id": job.upload_id}


@app.get("/health")
async def health():
    """Health check with queue status."""
    queue_counts = {}
    if queue:
        try:
            counts = await queue.getJobCounts("active", "waiting", "failed", "completed")
            queue_counts = counts
        except Exception:
            queue_counts = {"error": "unable to fetch"}

    return {"status": "ok", "queue": queue_counts}
