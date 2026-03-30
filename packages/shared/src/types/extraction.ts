/** Shared types for file text extraction pipeline */

export type ExtractionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'unsupported'

export type ExtractionMethod = 'docling' | 'gemini' | 'direct' | 'unsupported'

/** Payload sent from VPS extraction service back to API */
export interface ExtractionResultPayload {
  uploadId: string
  tenantId: string
  extractedText: string
  extractionMethod: ExtractionMethod
  error?: string
}

/** Content types that the extraction service can process */
export const EXTRACTABLE_CONTENT_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

export const IMAGE_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])
