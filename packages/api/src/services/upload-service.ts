/** R2 file upload/download service */

import { eq, and } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { uploads } from '../db/schema'
import { generateId } from '../utils/crypto'
import type { Env } from '../env'

/** Upload a file to R2 (proxy through Worker) */
export async function uploadFile(
  env: Env,
  tenantId: string,
  userId: string,
  filename: string,
  contentType: string,
  body: ReadableStream | ArrayBuffer,
  documentId?: string,
) {
  const id = generateId()
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const fileKey = `${tenantId}/media/${id}/${safeFilename}`

  // Upload to R2
  await env.R2.put(fileKey, body, {
    httpMetadata: { contentType },
    customMetadata: { tenantId, uploadedBy: userId },
  })

  // Get object size
  const head = await env.R2.head(fileKey)
  const sizeBytes = head?.size ?? 0

  // Store metadata in D1
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
    createdAt: new Date(),
  })

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

/** List uploads for a tenant */
export async function listUploads(env: Env, tenantId: string, documentId?: string) {
  const db = drizzle(env.DB)
  const conditions = [eq(uploads.tenantId, tenantId)]
  if (documentId) conditions.push(eq(uploads.documentId, documentId))

  return db
    .select({
      id: uploads.id,
      filename: uploads.filename,
      contentType: uploads.contentType,
      sizeBytes: uploads.sizeBytes,
      createdAt: uploads.createdAt,
    })
    .from(uploads)
    .where(and(...conditions))
}

/** Delete a file from R2 + D1 */
export async function deleteFile(env: Env, uploadId: string, tenantId: string) {
  const db = drizzle(env.DB)
  const record = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.id, uploadId), eq(uploads.tenantId, tenantId)))
    .limit(1)

  if (!record.length) return false

  await env.R2.delete(record[0].fileKey)
  await db.delete(uploads).where(eq(uploads.id, uploadId))
  return true
}
