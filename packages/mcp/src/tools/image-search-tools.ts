/** MCP tool for searching uploaded images by text query */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { searchImages } from '@agentwiki/api/services/image-search-service'
import { checkPermission } from '../auth/api-key-auth'
import { toolError, safeToolCall } from '../utils/mcp-error-handler'
import type { Env, McpAuthContext } from '../env'

export function registerImageSearchTools(
  server: McpServer,
  env: Env,
  auth: McpAuthContext,
) {
  server.registerTool('search_images', {
    description: 'Search uploaded images using natural-language text query. Matches against AI-extracted image descriptions and captions. Returns ranked results with image metadata, preview URLs, and relevance scores.',
    inputSchema: {
      query: z.string().min(1).max(500).describe('Natural language description of the image to find (e.g. "architecture diagram", "screenshot of dashboard")'),
      type: z.enum(['hybrid', 'keyword', 'semantic']).default('hybrid').describe('Search strategy: hybrid (recommended), keyword, or semantic'),
      limit: z.number().int().min(1).max(50).default(10).describe('Maximum number of results'),
      documentId: z.string().optional().describe('Filter to images linked to a specific document'),
      dateFrom: z.string().optional().describe('Filter images uploaded after this date (ISO 8601)'),
      dateTo: z.string().optional().describe('Filter images uploaded before this date (ISO 8601)'),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'doc:read')) return toolError('Permission denied: doc:read required')
    return safeToolCall(() =>
      // MCP Env is a subset of API Env — safe at runtime (same pattern as all other MCP tools)
      searchImages(env as never, {
        tenantId: auth.tenantId,
        query: args.query,
        type: args.type,
        limit: args.limit,
        filters: {
          documentId: args.documentId,
          dateFrom: args.dateFrom,
          dateTo: args.dateTo,
        },
      }),
    )
  })
}
