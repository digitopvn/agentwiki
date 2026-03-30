/** R2 file upload/download service */

import { eq, and, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { uploads, storageFolders } from '../db/schema'
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
  folderId?: string,
) {
  // Verify folderId belongs to this tenant
  if (folderId) {
    const db = drizzle(env.DB)
    const folder = await db
      .select({ id: storageFolders.id })
      .from(storageFolders)
      .where(and(eq(storageFolders.id, folderId), eq(storageFolders.tenantId, tenantId)))
      .limit(1)
    if (!folder.length) return { error: 'Target folder not found' }
  }

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
    folderId: folderId ?? null,
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

/** List uploads for a tenant, optionally filtered by documentId or folderId */
export async function listUploads(
  env: Env,
  tenantId: string,
  options?: { documentId?: string; folderId?: string | null },
) {
  const db = drizzle(env.DB)
  const conditions = [eq(uploads.tenantId, tenantId)]
  if (options?.documentId) conditions.push(eq(uploads.documentId, options.documentId))
  // folderId: null = root files only, string = specific folder, undefined = all files
  if (options?.folderId !== undefined) {
    if (options.folderId === null) {
      conditions.push(isNull(uploads.folderId))
    } else {
      conditions.push(eq(uploads.folderId, options.folderId))
    }
  }

  return db
    .select({
      id: uploads.id,
      folderId: uploads.folderId,
      fileKey: uploads.fileKey,
      filename: uploads.filename,
      contentType: uploads.contentType,
      sizeBytes: uploads.sizeBytes,
      uploadedBy: uploads.uploadedBy,
      createdAt: uploads.createdAt,
    })
    .from(uploads)
    .where(and(...conditions))
}

/** Move a file to a different storage folder */
export async function moveUploadToFolder(
  env: Env,
  uploadId: string,
  tenantId: string,
  folderId: string | null,
) {
  const db = drizzle(env.DB)

  // Verify target folder belongs to tenant
  if (folderId) {
    const folder = await db
      .select({ id: storageFolders.id })
      .from(storageFolders)
      .where(and(eq(storageFolders.id, folderId), eq(storageFolders.tenantId, tenantId)))
      .limit(1)
    if (!folder.length) return { error: 'Target folder not found' }
  }

  // Verify upload exists and belongs to tenant
  const upload = await db
    .select({ id: uploads.id })
    .from(uploads)
    .where(and(eq(uploads.id, uploadId), eq(uploads.tenantId, tenantId)))
    .limit(1)
  if (!upload.length) return { error: 'Upload not found' }

  await db
    .update(uploads)
    .set({ folderId })
    .where(eq(uploads.id, uploadId))
  return { ok: true }
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
