/** R2 file upload/download service */

import { eq, and, desc } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { uploads, fileExtractions } from '../db/schema'
import { generateId } from '../utils/crypto'
import { dispatchExtractionJob } from './extraction-job-dispatcher'
import type { Env } from '../env'

/** Upload a file to R2, store metadata, and dispatch extraction job */
export async function uploadFile(
  env: Env,
  tenantId: string,
  userId: string,
  filename: string,
  contentType: string,
  body: ReadableStream | ArrayBuffer,
  documentId?: string,
  ctx?: ExecutionContext,
) {
  const id = generateId()
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const fileKey = `${tenantId}/media/${id}/${safeFilename}`

  // Upload to R2
  try {
    await env.R2.put(fileKey, body, {
      httpMetadata: { contentType },
      customMetadata: { tenantId, uploadedBy: userId },
    })
  } catch (err) {
    console.error('R2 upload failed:', err)
    throw new Error('Failed to upload file to storage')
  }

  // Get object size (non-critical)
  let sizeBytes = 0
  try {
    const head = await env.R2.head(fileKey)
    sizeBytes = head?.size ?? 0
  } catch {
    // proceed with size 0
  }

  // Store metadata in D1
  try {
    const db = drizzle(env.DB)
    await db.insert(uploads).values({
      id,
      tenantId,
      documentId: documentId ?? null,
      fileKey,
      filename: safeFilename,
      contentType,
      sizeBytes,
      uploadedBy: userId,
      extractionStatus: 'pending',
      createdAt: new Date(),
    })
  } catch (err) {
    // Cleanup R2 object if DB insert fails
    try { await env.R2.delete(fileKey) } catch { /* ignore cleanup error */ }
    console.error('DB insert failed for upload:', err)
    throw new Error('Failed to save upload metadata')
  }

  // Dispatch extraction job async (fire-and-forget)
  const extractionPromise = dispatchExtractionJob(env, { id, tenantId, fileKey, contentType, filename: safeFilename })
  if (ctx) {
    ctx.waitUntil(extractionPromise)
  } else {
    extractionPromise.catch((err) => console.error('Extraction dispatch failed:', err))
  }

  return {
    id,
    url: `/api/files/${fileKey}`,
    filename: safeFilename,
    contentType,
    sizeBytes,
  }
}

/** Serve a file from R2 */
export async function getFile(env: Env, fileKey: string, tenantId: string) {
  // Verify tenant has access
  if (!fileKey.startsWith(`${tenantId}/`)) return null

  const object = await env.R2.get(fileKey)
  if (!object) return null

  return {
    body: object.body,
    contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
    size: object.size,
  }
}

/** List uploads for a tenant with pagination */
export async function listUploads(
  env: Env,
  tenantId: string,
  documentId?: string,
  limit = 50,
  offset = 0,
) {
  const db = drizzle(env.DB)
  const conditions = [eq(uploads.tenantId, tenantId)]
  if (documentId) conditions.push(eq(uploads.documentId, documentId))

  return db
    .select({
      id: uploads.id,
      fileKey: uploads.fileKey,
      filename: uploads.filename,
      contentType: uploads.contentType,
      sizeBytes: uploads.sizeBytes,
      extractionStatus: uploads.extractionStatus,
      summary: uploads.summary,
      createdAt: uploads.createdAt,
    })
    .from(uploads)
    .where(and(...conditions))
    .orderBy(desc(uploads.createdAt))
    .limit(limit)
    .offset(offset)
}

/** Delete a file from R2 + D1 + Vectorize vectors */
export async function deleteFile(env: Env, uploadId: string, tenantId: string) {
  const db = drizzle(env.DB)
  const record = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.id, uploadId), eq(uploads.tenantId, tenantId)))
    .limit(1)

  if (!record.length) return false

  // Delete R2 object
  await env.R2.delete(record[0].fileKey)

  // Delete Vectorize vectors for this upload (best-effort)
  // Use exact chunkCount stored during embedding, fallback to charCount estimate
  const vectorPrefix = `upload-${uploadId}`
  let maxChunks = 50
  const extractionRecord = await db
    .select({ chunkCount: fileExtractions.chunkCount, charCount: fileExtractions.charCount })
    .from(fileExtractions)
    .where(eq(fileExtractions.uploadId, uploadId))
    .limit(1)
  if (extractionRecord.length) {
    const { chunkCount, charCount } = extractionRecord[0]
    if (chunkCount && chunkCount > 0) {
      maxChunks = chunkCount
    } else if (charCount && charCount > 0) {
      maxChunks = Math.ceil(charCount / 400) + 10
    }
  }
  const vectorIds = Array.from({ length: maxChunks }, (_, i) => `${vectorPrefix}-${i}`)
  try { await env.VECTORIZE.deleteByIds(vectorIds) } catch { /* may not exist */ }

  // Delete from D1 (file_extractions cascade via FK)
  await db.delete(uploads).where(eq(uploads.id, uploadId))
  return true
}
