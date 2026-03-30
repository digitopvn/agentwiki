/** Storage folder CRUD routes */

import { Hono } from 'hono'
import {
  createStorageFolder,
  getStorageFolderTree,
  updateStorageFolder,
  deleteStorageFolder,
} from '../services/storage-folder-service'
import { authGuard } from '../middleware/auth-guard'
import { requirePermission } from '../middleware/require-permission'
import { createStorageFolderSchema, updateStorageFolderSchema } from '@agentwiki/shared'
import type { Env } from '../env'
import type { AuthContext } from '@agentwiki/shared'

type AuthEnv = { Bindings: Env; Variables: { auth: AuthContext } }

export const storageFoldersRouter = new Hono<AuthEnv>()

// Get folder tree
storageFoldersRouter.get('/', authGuard, requirePermission('doc:read'), async (c) => {
  const { tenantId } = c.get('auth')
  const tree = await getStorageFolderTree(c.env, tenantId)
  return c.json({ folders: tree })
})

// Create folder
storageFoldersRouter.post('/', authGuard, requirePermission('doc:create'), async (c) => {
  const { tenantId, userId } = c.get('auth')
  const body = await c.req.json()
  const parsed = createStorageFolderSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const result = await createStorageFolder(c.env, tenantId, userId, parsed.data.name, parsed.data.parentId)
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json(result, 201)
})

// Update folder (rename, move, reorder)
storageFoldersRouter.put('/:id', authGuard, requirePermission('doc:update'), async (c) => {
  const { tenantId } = c.get('auth')
  const folderId = c.req.param('id')
  const body = await c.req.json()
  const parsed = updateStorageFolderSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const result = await updateStorageFolder(c.env, tenantId, folderId, parsed.data)
  if ('error' in result) return c.json({ error: result.error }, 400)
  return c.json(result)
})

// Delete folder (moves files to root)
storageFoldersRouter.delete('/:id', authGuard, requirePermission('doc:delete'), async (c) => {
  const { tenantId } = c.get('auth')
  const folderId = c.req.param('id')

  const result = await deleteStorageFolder(c.env, tenantId, folderId)
  if ('error' in result) return c.json({ error: result.error }, 404)
  return c.json(result)
})
