/** Folder management routes */

import { Hono } from 'hono'
import { createFolderSchema, reorderFolderSchema } from '@agentwiki/shared'
import {
  createFolder,
  getFolderTree,
  updateFolder,
  deleteFolder,
} from '../services/folder-service'
import { authGuard } from '../middleware/auth-guard'
import { requirePermission } from '../middleware/require-permission'
import type { Env } from '../env'
import type { AuthContext } from '@agentwiki/shared'

type AuthEnv = { Bindings: Env; Variables: { auth: AuthContext } }

const foldersRouter = new Hono<AuthEnv>()
foldersRouter.use('*', authGuard)

// Create folder
foldersRouter.post('/', requirePermission('doc:create'), async (c) => {
  const body = createFolderSchema.parse(await c.req.json())
  const { tenantId, userId } = c.get('auth')
  const result = await createFolder(c.env, tenantId, userId, body.name, body.parentId)
  return c.json(result, 201)
})

// Get folder tree
foldersRouter.get('/', requirePermission('doc:read'), async (c) => {
  const { tenantId } = c.get('auth')
  const tree = await getFolderTree(c.env, tenantId)
  return c.json({ folders: tree })
})

// Update folder (rename / move / reorder)
foldersRouter.put('/:id', requirePermission('doc:update'), async (c) => {
  const { tenantId } = c.get('auth')
  const body = await c.req.json()
  const result = await updateFolder(c.env, tenantId, c.req.param('id'), body)
  return c.json(result)
})

// Delete folder
foldersRouter.delete('/:id', requirePermission('doc:delete'), async (c) => {
  const { tenantId } = c.get('auth')
  const result = await deleteFolder(c.env, tenantId, c.req.param('id'))
  if ('error' in result) return c.json(result, 400)
  return c.json(result)
})

export { foldersRouter }
