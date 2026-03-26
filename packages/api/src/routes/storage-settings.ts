/** Storage configuration routes — custom R2 credentials management */

import { Hono } from 'hono'
import { authGuard } from '../middleware/auth-guard'
import { requireAdmin } from '../middleware/require-permission'
import * as storageService from '../services/storage-config-service'
import type { Env } from '../env'
import type { AuthContext } from '@agentwiki/shared'

type AuthEnv = { Bindings: Env; Variables: { auth: AuthContext } }

export const storageSettingsRouter = new Hono<AuthEnv>()
storageSettingsRouter.use('*', authGuard)

/** GET /api/storage/settings — get storage config (admin only) */
storageSettingsRouter.get('/settings', requireAdmin, async (c) => {
  const { tenantId } = c.get('auth')
  const config = await storageService.getStorageConfig(c.env, tenantId)
  return c.json({ config })
})

/** PUT /api/storage/settings — upsert storage config (admin only) */
storageSettingsRouter.put('/settings', requireAdmin, async (c) => {
  const { tenantId } = c.get('auth')
  const body = (await c.req.json()) as {
    accountId: string
    accessKey: string
    secretKey: string
    bucketName: string
  }

  if (!body.accountId || !body.bucketName) {
    return c.json({ error: 'accountId and bucketName are required' }, 400)
  }

  // On initial creation, access keys are mandatory
  const existing = await storageService.getStorageConfig(c.env, tenantId)
  if (!existing && (!body.accessKey || !body.secretKey || body.accessKey === '__unchanged__' || body.secretKey === '__unchanged__')) {
    return c.json({ error: 'Access key and secret key are required for initial setup' }, 400)
  }

  try {
    await storageService.upsertStorageConfig(c.env, tenantId, body)
    return c.json({ success: true })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to save' }, 500)
  }
})

/** DELETE /api/storage/settings — remove custom config, revert to default R2 binding (admin only) */
storageSettingsRouter.delete('/settings', requireAdmin, async (c) => {
  const { tenantId } = c.get('auth')
  await storageService.deleteStorageConfig(c.env, tenantId)
  return c.json({ success: true })
})

/** POST /api/storage/test — test R2 connection with saved credentials (admin only) */
storageSettingsRouter.post('/test', requireAdmin, async (c) => {
  const { tenantId } = c.get('auth')
  const result = await storageService.testStorageConnection(c.env, tenantId)
  return c.json(result)
})
