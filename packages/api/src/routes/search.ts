/** Search routes — hybrid keyword + semantic */

import { Hono } from 'hono'
import { searchDocuments } from '../services/search-service'
import { authGuard } from '../middleware/auth-guard'
import { rateLimiter } from '../middleware/rate-limiter'
import { RATE_LIMITS } from '@agentwiki/shared'
import type { Env } from '../env'
import type { AuthContext } from '@agentwiki/shared'

type AuthEnv = { Bindings: Env; Variables: { auth: AuthContext } }

const searchRouter = new Hono<AuthEnv>()
searchRouter.use('*', authGuard)
searchRouter.use('*', rateLimiter(RATE_LIMITS.search))

// Search documents
searchRouter.get('/', async (c) => {
  const { tenantId } = c.get('auth')
  const query = c.req.query('q')
  if (!query) return c.json({ error: 'Query parameter "q" is required' }, 400)

  const type = (c.req.query('type') ?? 'hybrid') as 'hybrid' | 'keyword' | 'semantic'
  const limit = Math.min(50, parseInt(c.req.query('limit') ?? '10', 10))
  const category = c.req.query('category')

  const results = await searchDocuments(c.env, { tenantId, query, type, limit, category })

  return c.json({ results, query, type })
})

export { searchRouter }
