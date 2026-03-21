/** Middleware for internal API endpoints — validates shared secret from VPS extraction service */

import type { Context, Next } from 'hono'
import type { Env } from '../env'

/** Timing-safe string comparison using native crypto.subtle.timingSafeEqual (CF Workers) */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const maxLen = Math.max(a.length, b.length) || 1
  // Pad to equal byte length (required by timingSafeEqual)
  const aBuf = encoder.encode(a.padEnd(maxLen, '\0'))
  const bBuf = encoder.encode(b.padEnd(maxLen, '\0'))
  // Native constant-time comparison + length check (different lengths → padded bytes differ)
  return crypto.subtle.timingSafeEqual(aBuf, bBuf)
}

/** Validate X-Internal-Secret header against EXTRACTION_INTERNAL_SECRET env var */
export async function internalAuth(c: Context<{ Bindings: Env }>, next: Next) {
  const secret = c.req.header('X-Internal-Secret')
  if (!secret || !timingSafeEqual(secret, c.env.EXTRACTION_INTERNAL_SECRET)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
}
