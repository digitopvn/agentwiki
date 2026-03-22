/** Reorder route — drag-and-drop position updates */

import { Hono } from 'hono'
import { reorderItemSchema } from '@agentwiki/shared'
import { reorderItem } from '../services/reorder-service'
import { authGuard } from '../middleware/auth-guard'
import { requirePermission } from '../middleware/require-permission'
import type { Env } from '../env'
import type { AuthContext } from '@agentwiki/shared'

type AuthEnv = { Bindings: Env; Variables: { auth: AuthContext } }

const reorderRouter = new Hono<AuthEnv>()
reorderRouter.use('*', authGuard)

// Reorder a folder or document
reorderRouter.patch('/', requirePermission('doc:update'), async (c) => {
  const body = reorderItemSchema.parse(await c.req.json())
  const { tenantId } = c.get('auth')
  const result = await reorderItem(c.env, tenantId, body)
  return c.json(result)
})

export { reorderRouter }
