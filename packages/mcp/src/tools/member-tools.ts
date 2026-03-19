/** MCP tools for tenant member management (3 tools) */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { listMembers, updateMemberRole, removeMember } from '../../../api/src/services/member-service'
import { checkPermission } from '../auth/api-key-auth'
import { logMcpAudit } from '../utils/audit-logger'
import { toolResult, toolError, safeToolCall } from '../utils/mcp-error-handler'
import type { Env, McpAuthContext } from '../env'

export function registerMemberTools(
  server: McpServer,
  env: Env,
  auth: McpAuthContext,
  ctx: ExecutionContext,
) {
  server.registerTool('member_list', {
    description: 'List all members of the workspace with their roles',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    if (!checkPermission(auth.scopes, 'tenant:manage')) return toolError('Permission denied: tenant:manage required')
    return safeToolCall(() => listMembers(env as never, auth.tenantId))
  })

  server.registerTool('member_update_role', {
    description: 'Update a member\'s role (admin, editor, viewer, agent)',
    inputSchema: {
      membershipId: z.string().describe('Membership record ID'),
      role: z.enum(['admin', 'editor', 'viewer', 'agent']).describe('New role'),
    },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'user:manage')) return toolError('Permission denied: user:manage required')
    return safeToolCall(async () => {
      const result = await updateMemberRole(env as never, args.membershipId, args.role)
      if (!result) return toolError('Membership not found')
      logMcpAudit(ctx, env, auth, 'member.update_role', 'membership', args.membershipId, { role: args.role })
      return result
    }, (r) => r as never)
  })

  server.registerTool('member_remove', {
    description: 'Remove a member from the workspace',
    inputSchema: { membershipId: z.string().describe('Membership record ID') },
    annotations: { destructiveHint: true },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'user:manage')) return toolError('Permission denied: user:manage required')
    return safeToolCall(async () => {
      await removeMember(env as never, args.membershipId)
      logMcpAudit(ctx, env, auth, 'member.remove', 'membership', args.membershipId)
      return { removed: true, membershipId: args.membershipId }
    })
  })
}
