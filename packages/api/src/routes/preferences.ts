/** User preferences routes */

import { Hono } from 'hono'
import { setPreferenceSchema } from '@agentwiki/shared'
import { getPreferences, setPreference } from '../services/preference-service'
import { authGuard } from '../middleware/auth-guard'
import type { Env } from '../env'
import type { AuthContext } from '@agentwiki/shared'

type AuthEnv = { Bindings: Env; Variables: { auth: AuthContext } }

const preferencesRouter = new Hono<AuthEnv>()
preferencesRouter.use('*', authGuard)

// Get all preferences for current user+tenant
preferencesRouter.get('/', async (c) => {
  const { userId, tenantId } = c.get('auth')
  const preferences = await getPreferences(c.env, userId, tenantId)
  return c.json({ preferences })
})

// Upsert a single preference
preferencesRouter.put('/:key', async (c) => {
  const { userId, tenantId } = c.get('auth')
  const key = c.req.param('key')
  const body = setPreferenceSchema.parse(await c.req.json())
  const result = await setPreference(c.env, userId, tenantId, key, body.value)
  if ('error' in result) return c.json(result, 400)
  return c.json(result)
})

export { preferencesRouter }
