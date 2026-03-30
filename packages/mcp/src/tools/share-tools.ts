/** MCP tool for creating share links (1 tool) */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createShareLink } from '@agentwiki/api/services/share-service'
import { checkPermission } from '../auth/api-key-auth'
import { logMcpAudit } from '../utils/audit-logger'
import { toolResult, toolError, safeToolCall } from '../utils/mcp-error-handler'
import type { Env, McpAuthContext } from '../env'

export function registerShareTools(
  server: McpServer,
  env: Env,
  auth: McpAuthContext,
  ctx: ExecutionContext,
) {
  server.registerTool('share_link_create', {
    description: 'Create a public share link for a document (token-based, with expiry)',
    inputSchema: {
      documentId: z.string().describe('Document ID to share'),
      expiresInDays: z.number().int().min(1).max(365).default(30).describe('Link expiry in days'),
    },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'doc:share')) return toolError('Permission denied: doc:share required')
    return safeToolCall(async () => {
      const result = await createShareLink(env as never, args.documentId, auth.userId, args.expiresInDays)
      logMcpAudit(ctx, env, auth, 'share.create', 'share_link', result.id)
      return result
    })
  })
}
