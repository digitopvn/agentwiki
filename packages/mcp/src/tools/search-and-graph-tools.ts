/** MCP tool for hybrid search (graph tools moved to graph-traversal-tools.ts) */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { searchDocuments } from '@agentwiki/api/services/search-service'
import { checkPermission } from '../auth/api-key-auth'
import { toolError, safeToolCall } from '../utils/mcp-error-handler'
import type { Env, McpAuthContext } from '../env'

export function registerSearchAndGraphTools(
  server: McpServer,
  env: Env,
  auth: McpAuthContext,
  _ctx: ExecutionContext,
) {
  server.registerTool('search', {
    description: 'Search documents and/or uploaded files using keyword, semantic, or hybrid search. Returns ranked results with snippets.',
    inputSchema: {
      query: z.string().min(1).max(500).describe('Search query'),
      type: z.enum(['hybrid', 'keyword', 'semantic']).default('hybrid').describe('Search strategy'),
      source: z.enum(['docs', 'storage', 'all']).default('docs').describe('Search source: docs (wiki documents), storage (uploaded files), all (both)'),
      limit: z.number().int().min(1).max(50).default(10).describe('Max results'),
      category: z.string().optional().describe('Filter by category'),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'doc:read')) return toolError('Permission denied: doc:read required')
    return safeToolCall(() =>
      searchDocuments(env as never, {
        tenantId: auth.tenantId,
        query: args.query,
        type: args.type,
        source: args.source,
        limit: args.limit,
        category: args.category,
      }),
    )
  })
}
