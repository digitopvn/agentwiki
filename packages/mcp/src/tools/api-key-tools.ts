/** MCP tools for API key management (3 tools) */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createApiKey, listApiKeys, revokeApiKey } from '@agentwiki/api/services/api-key-service'
import { checkPermission } from '../auth/api-key-auth'
import { logMcpAudit } from '../utils/audit-logger'
import { toolResult, toolError, safeToolCall } from '../utils/mcp-error-handler'
import type { Env, McpAuthContext } from '../env'

export function registerApiKeyTools(
  server: McpServer,
  env: Env,
  auth: McpAuthContext,
  ctx: ExecutionContext,
) {
  server.registerTool('api_key_create', {
    description: 'Create a new API key. WARNING: The plaintext key is shown only once in the response — save it immediately.',
    inputSchema: {
      name: z.string().describe('Descriptive name for the key'),
      scopes: z.array(z.string()).describe('Permission scopes (e.g. doc:read, doc:create, doc:*)'),
      expiresInDays: z.number().int().min(1).max(365).optional().describe('Expiry in days (omit for no expiry)'),
    },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'key:*')) return toolError('Permission denied: key:* required')
    // Prevent scope escalation: new key's scopes must be subset of caller's scopes
    for (const scope of args.scopes) {
      if (!checkPermission(auth.scopes, scope)) {
        return toolError(`Scope escalation denied: you cannot grant '${scope}' — not in your own scopes`)
      }
    }
    return safeToolCall(async () => {
      const expiresAt = args.expiresInDays
        ? new Date(Date.now() + args.expiresInDays * 86400000)
        : undefined
      const result = await createApiKey(env as never, auth.tenantId, args.name, args.scopes, auth.userId, expiresAt)
      logMcpAudit(ctx, env, auth, 'api_key.create', 'api_key', result.id)
      return { ...result, warning: 'Save the key now — it cannot be retrieved later.' }
    })
  })

  server.registerTool('api_key_list', {
    description: 'List all API keys for the workspace (secrets are masked)',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    if (!checkPermission(auth.scopes, 'key:*')) return toolError('Permission denied: key:* required')
    return safeToolCall(() => listApiKeys(env as never, auth.tenantId))
  })

  server.registerTool('api_key_revoke', {
    description: 'Revoke an API key (permanently disables it)',
    inputSchema: { keyId: z.string().describe('API key ID to revoke') },
    annotations: { destructiveHint: true },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'key:*')) return toolError('Permission denied: key:* required')
    return safeToolCall(async () => {
      await revokeApiKey(env as never, args.keyId, auth.tenantId)
      logMcpAudit(ctx, env, auth, 'api_key.revoke', 'api_key', args.keyId)
      return { revoked: true, keyId: args.keyId }
    })
  })
}
