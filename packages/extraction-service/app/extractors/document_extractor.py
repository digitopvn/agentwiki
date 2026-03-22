"""Extract text from PDF, DOCX, PPTX, XLSX using Docling."""

import tempfile
import os
import httpx
from docling.document_converter import DocumentConverter


async def extract_document(file_url: str, filename: str) -> str:
    """Download file and convert to text using Docling."""
    # Download file to temp directory
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.get(file_url)
        response.raise_for_status()

    tmp_dir = tempfile.mkdtemp()
    safe_name = os.path.basename(filename.replace("..", "_"))
    tmp_path = os.path.join(tmp_dir, safe_name)

    try:
        with open(tmp_path, "wb") as f:
            f.write(response.content)

        # Convert document using Docling
        converter = DocumentConverter()
        result = converter.convert(tmp_path)
        return result.document.export_to_markdown()
    finally:
        # Cleanup temp files
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        if os.path.exists(tmp_dir):
            os.rmdir(tmp_dir)
