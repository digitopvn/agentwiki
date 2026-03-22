/** Handles extraction results from VPS service — stores text, triggers vectorize + summarize */

import { eq, and } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { uploads, fileExtractions } from '../db/schema'
import { generateId } from '../utils/crypto'
import type { Env } from '../env'
import type { ExtractionResultPayload } from '@agentwiki/shared'

/** Process extraction result callback from VPS extraction service */
export async function handleExtractionResult(env: Env, payload: ExtractionResultPayload) {
  const db = drizzle(env.DB)
  const { uploadId, tenantId, extractedText, extractionMethod, error } = payload

  // Verify upload exists and belongs to tenant
  const upload = await db
    .select({ id: uploads.id })
    .from(uploads)
    .where(and(eq(uploads.id, uploadId), eq(uploads.tenantId, tenantId)))
    .limit(1)

  if (!upload.length) {
    throw new Error(`Upload ${uploadId} not found for tenant ${tenantId}`)
  }

  const now = new Date()
  const isError = !!error || extractionMethod === 'unsupported'
  const status = error ? 'failed' : extractionMethod === 'unsupported' ? 'unsupported' : 'completed'

  // Upsert file extraction record
  const existingExtraction = await db
    .select({ id: fileExtractions.id })
    .from(fileExtractions)
    .where(eq(fileExtractions.uploadId, uploadId))
    .limit(1)

  const extractionId = existingExtraction.length ? existingExtraction[0].id : generateId()
  const vectorId = `upload-${uploadId}`

  if (existingExtraction.length) {
    await db.update(fileExtractions).set({
      extractedText,
      charCount: extractedText.length,
      vectorId,
      extractionMethod,
      errorMessage: error ?? null,
      updatedAt: now,
    }).where(eq(fileExtractions.id, extractionId))
  } else {
    await db.insert(fileExtractions).values({
      id: extractionId,
      uploadId,
      tenantId,
      extractedText,
      charCount: extractedText.length,
      vectorId,
      extractionMethod,
      errorMessage: error ?? null,
      createdAt: now,
      updatedAt: now,
    })
  }

  // Update upload status
  await db.update(uploads).set({
    extractionStatus: status,
  }).where(eq(uploads.id, uploadId))

  // Enqueue vectorize + summarize jobs if extraction succeeded with text
  if (!isError && extractedText.length > 0) {
    await env.QUEUE.send({ type: 'embed-upload', uploadId, tenantId })
    await env.QUEUE.send({ type: 'summarize-upload', uploadId, tenantId })
  }

  return { extractionId, status }
}
