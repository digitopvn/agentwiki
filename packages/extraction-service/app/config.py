"""Environment configuration for extraction service."""

import os
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
AGENTWIKI_API_URL = os.getenv("AGENTWIKI_API_URL", "https://api.agentwiki.cc")
AGENTWIKI_INTERNAL_SECRET = os.getenv("AGENTWIKI_INTERNAL_SECRET", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
WORKER_CONCURRENCY = int(os.getenv("WORKER_CONCURRENCY", "2"))
JOB_TIMEOUT_MS = int(os.getenv("JOB_TIMEOUT_MS", "300000"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))
