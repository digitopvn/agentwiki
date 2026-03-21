/** Non-blocking audit log for MCP server (no Hono dependency) */

import { drizzle } from 'drizzle-orm/d1'
import { auditLogs } from '../../../api/src/db/schema'
import { generateId } from '../../../api/src/utils/crypto'
import type { Env, McpAuthContext } from '../env'

/** Log an audit event via ctx.waitUntil (non-blocking) */
export function logMcpAudit(
  ctx: ExecutionContext,
  env: Env,
  auth: McpAuthContext,
  action: string,
  resourceType?: string,
  resourceId?: string,
  metadata?: Record<string, unknown>,
) {
  ctx.waitUntil(
    (async () => {
      try {
        const db = drizzle(env.DB)
        await db.insert(auditLogs).values({
          id: generateId(),
          tenantId: auth.tenantId,
          userId: auth.userId,
          action,
          resourceType,
          resourceId,
          metadata: { ...metadata, source: 'mcp' },
          ip: null,
          userAgent: null,
          createdAt: new Date(),
        })
      } catch {
        // Audit log failure should not break the request
      }
    })(),
  )
}
