/** API key management routes */

import { Hono } from 'hono'
import { createApiKeySchema } from '@agentwiki/shared'
import { createApiKey, listApiKeys, revokeApiKey } from '../services/api-key-service'
import { authGuard } from '../middleware/auth-guard'
import { requirePermission } from '../middleware/require-permission'
import { logAudit } from '../utils/audit'
import type { Env } from '../env'
import type { AuthContext } from '@agentwiki/shared'

type AuthEnv = { Bindings: Env; Variables: { auth: AuthContext } }

const apiKeysRouter = new Hono<AuthEnv>()

apiKeysRouter.use('*', authGuard)

// List API keys
apiKeysRouter.get('/', requirePermission('key:*'), async (c) => {
  const { tenantId } = c.get('auth')
  const keys = await listApiKeys(c.env, tenantId)
  return c.json({ keys })
})

// Create API key
apiKeysRouter.post('/', requirePermission('key:*'), async (c) => {
  const body = createApiKeySchema.parse(await c.req.json())
  const { tenantId, userId } = c.get('auth')

  const expiresAt = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 86400000)
    : undefined

  const result = await createApiKey(c.env, tenantId, body.name, body.scopes, userId, expiresAt)

  logAudit(c as never, 'apikey.create', 'api_key', result.id, { name: body.name })

  return c.json(result, 201)
})

// Revoke API key
apiKeysRouter.delete('/:id', requirePermission('key:*'), async (c) => {
  const keyId = c.req.param('id')
  const { tenantId } = c.get('auth')

  await revokeApiKey(c.env, keyId, tenantId)
  logAudit(c as never, 'apikey.revoke', 'api_key', keyId)

  return c.json({ ok: true })
})

export { apiKeysRouter }
