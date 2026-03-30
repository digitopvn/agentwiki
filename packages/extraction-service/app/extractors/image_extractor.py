"""Describe images using Gemini Flash API for knowledge base indexing."""

import httpx
from google import genai

from app.config import GEMINI_API_KEY

DESCRIPTION_PROMPT = (
    "Describe this image in detail for knowledge base indexing. "
    "Include all visible text, diagrams, charts, tables, and visual elements. "
    "Be thorough and factual."
)


async def extract_image(file_url: str) -> str:
    """Download image and generate detailed description via Gemini Flash."""
    # Download image bytes
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(file_url)
        response.raise_for_status()

    image_bytes = response.content
    content_type = response.headers.get("content-type", "image/png")

    # Call Gemini Flash API
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    gemini_response = gemini_client.models.generate_content(
        model="gemini-2.0-flash",
        contents=[
            DESCRIPTION_PROMPT,
            genai.types.Part.from_bytes(data=image_bytes, mime_type=content_type),
        ],
    )

    return gemini_response.text or ""
