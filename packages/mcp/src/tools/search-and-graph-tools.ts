/** MCP tools for hybrid search and knowledge graph (2 tools) */

import { z } from 'zod'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { searchDocuments } from '../../../api/src/services/search-service'
import { documents, documentLinks, documentTags } from '../../../api/src/db/schema'
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
    description: 'Search documents using keyword, semantic, or hybrid search. Returns ranked results with snippets.',
    inputSchema: {
      query: z.string().min(1).max(500).describe('Search query'),
      type: z.enum(['hybrid', 'keyword', 'semantic']).default('hybrid').describe('Search strategy'),
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
        limit: args.limit,
        category: args.category,
      }),
    )
  })

  server.registerTool('graph_get', {
    description: 'Get knowledge graph showing document relationships via wikilinks. Returns nodes (documents) and edges (links).',
    inputSchema: {
      category: z.string().optional().describe('Filter nodes by category'),
      tag: z.string().optional().describe('Filter nodes by tag'),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'doc:read')) return toolError('Permission denied: doc:read required')
    return safeToolCall(async () => {
      const db = drizzle(env.DB)
      const conditions: ReturnType<typeof eq>[] = [
        eq(documents.tenantId, auth.tenantId),
        isNull(documents.deletedAt),
      ]
      if (args.category) conditions.push(eq(documents.category, args.category))

      const docs = await db
        .select({ id: documents.id, title: documents.title, slug: documents.slug, category: documents.category, folderId: documents.folderId })
        .from(documents)
        .where(and(...conditions))

      if (!docs.length) return { nodes: [], edges: [], stats: { nodeCount: 0, edgeCount: 0 } }

      const docIdList = docs.map((d) => d.id)
      const docIds = new Set(docIdList)

      // Tenant-scoped tag query — only tags for this tenant's documents
      const tagRows = await db
        .select({ documentId: documentTags.documentId, tag: documentTags.tag })
        .from(documentTags)
        .where(inArray(documentTags.documentId, docIdList))
      const tagMap = new Map<string, string[]>()
      for (const t of tagRows) {
        if (!tagMap.has(t.documentId)) tagMap.set(t.documentId, [])
        tagMap.get(t.documentId)!.push(t.tag)
      }

      let filteredDocs = docs
      if (args.tag) {
        filteredDocs = docs.filter((d) => tagMap.get(d.id)?.includes(args.tag!))
      }

      // Tenant-scoped link query — only links between this tenant's documents
      const linkRows = await db
        .select()
        .from(documentLinks)
        .where(inArray(documentLinks.sourceDocId, docIdList))
      const edges = linkRows
        .filter((l) => docIds.has(l.targetDocId))
        .map((e) => ({ id: e.id, source: e.sourceDocId, target: e.targetDocId, context: e.context }))

      const nodes = filteredDocs.map((d) => ({
        id: d.id,
        label: d.title,
        category: d.category,
        tags: tagMap.get(d.id) ?? [],
      }))

      return { nodes, edges, stats: { nodeCount: nodes.length, edgeCount: edges.length } }
    })
  })
}
