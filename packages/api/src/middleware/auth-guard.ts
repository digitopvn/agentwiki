/** Auth middleware — verify JWT or API key, set user context */

import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { verifyJwt } from '../utils/crypto'
import { validateApiKey } from '../services/api-key-service'
import { API_KEY_PREFIX } from '@agentwiki/shared'
import type { Env } from '../env'
import type { AuthContext } from '@agentwiki/shared'

type AuthEnv = { Bindings: Env; Variables: { auth: AuthContext } }

/** Require authentication — JWT (cookie/header) or API key */
export const authGuard = createMiddleware<AuthEnv>(async (c, next) => {
  // 1. Check Authorization header
  const authHeader = c.req.header('Authorization')
  let token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  // 2. Check API key
  if (token && token.startsWith(API_KEY_PREFIX)) {
    const result = await validateApiKey(c.env, token)
    if (!result) return c.json({ error: 'Invalid API key' }, 401)

    c.set('auth', {
      userId: result.id,
      tenantId: result.tenantId,
      role: 'agent',
      isApiKey: true,
    })
    return next()
  }

  // 3. Fallback to cookie
  if (!token) {
    token = getCookie(c, 'access_token') ?? null
  }

  if (!token) return c.json({ error: 'Authentication required' }, 401)

  // 4. Verify JWT
  const payload = await verifyJwt(token, c.env.JWT_SECRET)
  if (!payload) return c.json({ error: 'Invalid or expired token' }, 401)

  c.set('auth', {
    userId: payload.sub,
    tenantId: payload.tid,
    role: payload.role,
    isApiKey: false,
  })

  return next()
})

/** Optional auth — sets context if present, continues if not */
export const optionalAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const token = getCookie(c, 'access_token') ?? c.req.header('Authorization')?.slice(7)

  if (token) {
    if (token.startsWith(API_KEY_PREFIX)) {
      const result = await validateApiKey(c.env, token)
      if (result) {
        c.set('auth', { userId: result.id, tenantId: result.tenantId, role: 'agent', isApiKey: true })
      }
    } else {
      const payload = await verifyJwt(token, c.env.JWT_SECRET)
      if (payload) {
        c.set('auth', { userId: payload.sub, tenantId: payload.tid, role: payload.role, isApiKey: false })
      }
    }
  }

  return next()
})
