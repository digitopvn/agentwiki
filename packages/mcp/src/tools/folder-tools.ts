/** MCP tools for folder management (4 tools) */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createFolder, getFolderTree, updateFolder, deleteFolder } from '@agentwiki/api/services/folder-service'
import { checkPermission } from '../auth/api-key-auth'
import { logMcpAudit } from '../utils/audit-logger'
import { toolResult, toolError, safeToolCall } from '../utils/mcp-error-handler'
import type { Env, McpAuthContext } from '../env'

export function registerFolderTools(
  server: McpServer,
  env: Env,
  auth: McpAuthContext,
  ctx: ExecutionContext,
) {
  server.registerTool('folder_create', {
    description: 'Create a new folder for organizing documents',
    inputSchema: {
      name: z.string().describe('Folder name'),
      parentId: z.string().optional().describe('Parent folder ID (omit for root)'),
    },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'doc:create')) return toolError('Permission denied: doc:create required')
    return safeToolCall(async () => {
      const result = await createFolder(env as never, auth.tenantId, auth.userId, args.name, args.parentId)
      logMcpAudit(ctx, env, auth, 'folder.create', 'folder', result.id)
      return result
    })
  })

  server.registerTool('folder_list', {
    description: 'Get the full folder tree for the workspace',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    if (!checkPermission(auth.scopes, 'doc:read')) return toolError('Permission denied: doc:read required')
    return safeToolCall(() => getFolderTree(env as never, auth.tenantId))
  })

  server.registerTool('folder_update', {
    description: 'Rename, move, or reorder a folder',
    inputSchema: {
      id: z.string().describe('Folder ID'),
      name: z.string().optional().describe('New folder name'),
      parentId: z.string().nullable().optional().describe('Move to parent folder (null for root)'),
      position: z.number().int().optional().describe('Sort position'),
    },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'doc:update')) return toolError('Permission denied: doc:update required')
    const { id, ...updates } = args
    return safeToolCall(async () => {
      const result = await updateFolder(env as never, auth.tenantId, id, updates)
      logMcpAudit(ctx, env, auth, 'folder.update', 'folder', id)
      return result
    })
  })

  server.registerTool('folder_delete', {
    description: 'Delete an empty folder (must have no documents or subfolders)',
    inputSchema: { id: z.string().describe('Folder ID to delete') },
    annotations: { destructiveHint: true },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'doc:delete')) return toolError('Permission denied: doc:delete required')
    return safeToolCall(async () => {
      const result = await deleteFolder(env as never, auth.tenantId, args.id)
      if ('error' in result) return toolError(result.error as string)
      logMcpAudit(ctx, env, auth, 'folder.delete', 'folder', args.id)
      return result
    }, (r) => r as never)
  })
}
