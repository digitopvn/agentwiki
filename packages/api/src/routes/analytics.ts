/** Analytics routes — admin-only search analytics dashboard API */

import { Hono } from 'hono'
import { getAnalyticsSummary, pruneOldAnalytics } from '../services/analytics-service'
import { authGuard } from '../middleware/auth-guard'
import { rateLimiter } from '../middleware/rate-limiter'
import { RATE_LIMITS } from '@agentwiki/shared'
import type { Env } from '../env'
import type { AuthContext } from '@agentwiki/shared'

type AuthEnv = { Bindings: Env; Variables: { auth: AuthContext } }

const analyticsRouter = new Hono<AuthEnv>()
analyticsRouter.use('*', authGuard)
analyticsRouter.use('*', rateLimiter(RATE_LIMITS.api))

// Get search analytics summary (admin only)
analyticsRouter.get('/search', async (c) => {
  const auth = c.get('auth')
  if (auth.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403)
  }

  const period = (c.req.query('period') ?? '7d') as '7d' | '30d'
  const summary = await getAnalyticsSummary(c.env, auth.tenantId, period)
  return c.json(summary)
})

// Prune old analytics (admin only)
analyticsRouter.post('/search/prune', async (c) => {
  const auth = c.get('auth')
  if (auth.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403)
  }

  const days = parseInt(c.req.query('days') ?? '90', 10)
  await pruneOldAnalytics(c.env, auth.tenantId, days)
  return c.json({ ok: true, prunedBefore: `${days} days ago` })
})

export { analyticsRouter }
