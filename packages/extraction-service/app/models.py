"""Pydantic models for extraction jobs and results."""

from pydantic import BaseModel


class ExtractionJob(BaseModel):
    """Job payload received from CF Worker via HTTP POST."""
    upload_id: str
    tenant_id: str
    file_url: str  # R2 download URL (presigned or internal-auth)
    content_type: str
    filename: str


class ExtractionResult(BaseModel):
    """Result payload sent back to AgentWiki API."""
    uploadId: str
    tenantId: str
    extractedText: str
    extractionMethod: str  # docling | gemini | direct | unsupported
    error: str | None = None
