"""Extract text from plain text files (text/plain, text/markdown, text/csv, text/html)."""

import httpx


async def extract_text(file_url: str, _content_type: str) -> str:
    """Download and read text file content directly."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(file_url)
        response.raise_for_status()

    # Try UTF-8 first, fallback to latin-1
    try:
        return response.content.decode("utf-8")
    except UnicodeDecodeError:
        return response.content.decode("latin-1")
