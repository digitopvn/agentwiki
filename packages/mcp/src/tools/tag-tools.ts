/** MCP tools for tag and category listing (2 tools) */

import { z } from 'zod'
import { eq, and, isNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { documents, documentTags } from '../../../api/src/db/schema'
import { checkPermission } from '../auth/api-key-auth'
import { toolResult, toolError, safeToolCall } from '../utils/mcp-error-handler'
import type { Env, McpAuthContext } from '../env'

export function registerTagTools(
  server: McpServer,
  env: Env,
  auth: McpAuthContext,
  _ctx: ExecutionContext,
) {
  server.registerTool('tag_list', {
    description: 'List all tags with document counts for the workspace',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    if (!checkPermission(auth.scopes, 'doc:read')) return toolError('Permission denied: doc:read required')
    return safeToolCall(async () => {
      const db = drizzle(env.DB)
      const tags = await db
        .select({ tag: documentTags.tag, count: sql<number>`count(*)` })
        .from(documentTags)
        .innerJoin(documents, eq(documentTags.documentId, documents.id))
        .where(eq(documents.tenantId, auth.tenantId))
        .groupBy(documentTags.tag)
        .orderBy(sql`count(*) desc`)
      return { tags }
    })
  })

  server.registerTool('category_list', {
    description: 'List all distinct document categories for the workspace',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    if (!checkPermission(auth.scopes, 'doc:read')) return toolError('Permission denied: doc:read required')
    return safeToolCall(async () => {
      const db = drizzle(env.DB)
      const result = await db
        .selectDistinct({ category: documents.category })
        .from(documents)
        .where(and(eq(documents.tenantId, auth.tenantId), isNull(documents.deletedAt)))
      return { categories: result.map((r) => r.category).filter(Boolean) }
    })
  })
}
