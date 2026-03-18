/** Non-blocking audit log helper */

import { drizzle } from 'drizzle-orm/d1'
import { auditLogs } from '../db/schema'
import { generateId } from './crypto'
import type { Context } from 'hono'
import type { Env } from '../env'

/** Log an audit event (non-blocking via waitUntil) */
export function logAudit(
  c: Context<{ Bindings: Env }>,
  action: string,
  resourceType?: string,
  resourceId?: string,
  metadata?: Record<string, unknown>,
) {
  const auth = c.get('auth' as never) as { userId?: string; tenantId?: string } | undefined

  c.executionCtx.waitUntil(
    (async () => {
      const db = drizzle(c.env.DB)
      await db.insert(auditLogs).values({
        id: generateId(),
        tenantId: auth?.tenantId ?? 'system',
        userId: auth?.userId,
        action,
        resourceType,
        resourceId,
        metadata,
        ip: c.req.header('CF-Connecting-IP') ?? null,
        userAgent: c.req.header('User-Agent') ?? null,
        createdAt: new Date(),
      })
    })(),
  )
}
