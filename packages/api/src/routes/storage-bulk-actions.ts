/** Bulk move/delete actions for storage files and folders */

import { Hono } from 'hono'
import { eq, and, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { uploads, storageFolders } from '../db/schema'
import { deleteStorageFolder, updateStorageFolder } from '../services/storage-folder-service'
import { authGuard } from '../middleware/auth-guard'
import { requirePermission } from '../middleware/require-permission'
import { bulkMoveSchema, bulkDeleteSchema } from '@agentwiki/shared'
import type { Env } from '../env'
import type { AuthContext } from '@agentwiki/shared'

type AuthEnv = { Bindings: Env; Variables: { auth: AuthContext } }

export const storageBulkRouter = new Hono<AuthEnv>()

// Bulk move files and folders to a target folder
storageBulkRouter.post('/move', authGuard, requirePermission('doc:update'), async (c) => {
  const { tenantId } = c.get('auth')
  const body = await c.req.json()
  const parsed = bulkMoveSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const { fileIds, folderIds, targetFolderId } = parsed.data
  const db = drizzle(c.env.DB)

  // Verify target folder belongs to tenant (if not root)
  if (targetFolderId) {
    const target = await db
      .select({ id: storageFolders.id })
      .from(storageFolders)
      .where(and(eq(storageFolders.id, targetFolderId), eq(storageFolders.tenantId, tenantId)))
      .limit(1)
    if (!target.length) return c.json({ error: 'Target folder not found' }, 404)
  }

  // Move files (batch update)
  if (fileIds.length) {
    await db
      .update(uploads)
      .set({ folderId: targetFolderId })
      .where(and(inArray(uploads.id, fileIds), eq(uploads.tenantId, tenantId)))
  }

  // Move folders via service (includes circular reference check)
  if (folderIds.length) {
    for (const fId of folderIds) {
      if (fId === targetFolderId) continue
      await updateStorageFolder(c.env, tenantId, fId, { parentId: targetFolderId })
    }
  }

  return c.json({ ok: true, moved: { files: fileIds.length, folders: folderIds.length } })
})

// Bulk delete files and folders
storageBulkRouter.post('/delete', authGuard, requirePermission('doc:delete'), async (c) => {
  const { tenantId } = c.get('auth')
  const body = await c.req.json()
  const parsed = bulkDeleteSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const { fileIds, folderIds } = parsed.data
  const db = drizzle(c.env.DB)

  // Delete files from R2 + D1
  if (fileIds.length) {
    const records = await db
      .select({ id: uploads.id, fileKey: uploads.fileKey })
      .from(uploads)
      .where(and(inArray(uploads.id, fileIds), eq(uploads.tenantId, tenantId)))

    for (const r of records) {
      await c.env.R2.delete(r.fileKey)
      await db.delete(uploads).where(eq(uploads.id, r.id))
    }
  }

  // Delete folders (cascade: files moved to root)
  if (folderIds.length) {
    for (const fId of folderIds) {
      await deleteStorageFolder(c.env, tenantId, fId)
    }
  }

  return c.json({ ok: true, deleted: { files: fileIds.length, folders: folderIds.length } })
})
