/** KV-based sliding window rate limiter */

import { createMiddleware } from 'hono/factory'
import type { Env } from '../env'

interface RateLimitConfig {
  limit: number
  windowSec: number
}

/** Create rate limiter middleware */
export function rateLimiter(config: RateLimitConfig) {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    // Use IP + user ID as identifier
    const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
    const userId = (c.get('auth' as never) as { userId?: string })?.userId ?? ip
    const window = Math.floor(Date.now() / (config.windowSec * 1000))
    const key = `rl:${userId}:${window}`

    const current = parseInt((await c.env.KV.get(key)) ?? '0', 10)

    if (current >= config.limit) {
      return c.json(
        { error: 'Rate limit exceeded', retryAfter: config.windowSec },
        429,
      )
    }

    // Increment non-blocking
    c.executionCtx.waitUntil(
      c.env.KV.put(key, String(current + 1), { expirationTtl: config.windowSec * 2 }),
    )

    c.header('X-RateLimit-Limit', String(config.limit))
    c.header('X-RateLimit-Remaining', String(config.limit - current - 1))

    return next()
  })
}
