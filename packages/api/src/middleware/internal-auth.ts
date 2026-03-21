/** Middleware for internal API endpoints — validates shared secret from VPS extraction service */

import type { Context, Next } from 'hono'
import type { Env } from '../env'

/** Timing-safe string comparison — pads both to fixed length to avoid length leakage */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const aBuf = encoder.encode(a.padEnd(256, '\0'))
  const bBuf = encoder.encode(b.padEnd(256, '\0'))
  let result = a.length ^ b.length // include length difference in result
  for (let i = 0; i < aBuf.length; i++) {
    result |= aBuf[i] ^ bBuf[i]
  }
  return result === 0
}

/** Validate X-Internal-Secret header against EXTRACTION_INTERNAL_SECRET env var */
export async function internalAuth(c: Context<{ Bindings: Env }>, next: Next) {
  const secret = c.req.header('X-Internal-Secret')
  if (!secret || !timingSafeEqual(secret, c.env.EXTRACTION_INTERNAL_SECRET)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
}
