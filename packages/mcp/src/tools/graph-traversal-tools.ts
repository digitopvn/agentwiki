/** MCP tools for knowledge graph traversal (5 new tools + enhanced graph_get) */

import { z } from 'zod'
import { eq, and, or } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getFullGraph, getNeighbors, findPath, getGraphStats } from '@agentwiki/api/services/graph-service'
import { querySimilarDocs } from '@agentwiki/api/services/similarity-service'
import { documents, documentLinks } from '@agentwiki/api/db/schema'
import { checkPermission } from '../auth/api-key-auth'
import { toolError, safeToolCall } from '../utils/mcp-error-handler'
import { EDGE_TYPES } from '@agentwiki/shared'
import type { Env, McpAuthContext } from '../env'

const edgeTypeEnum = z.enum(EDGE_TYPES as unknown as [string, ...string[]])

export function registerGraphTraversalTools(
  server: McpServer,
  env: Env,
  auth: McpAuthContext,
) {
  /** Enhanced graph_get with typed edges and implicit similarity support */
  server.registerTool('graph_get', {
    description: 'Get knowledge graph with typed edges (relates-to, depends-on, extends, references, contradicts, implements). Supports filtering by edge type and including implicit AI-inferred similarity edges.',
    inputSchema: {
      category: z.string().optional().describe('Filter nodes by category'),
      tag: z.string().optional().describe('Filter nodes by tag'),
      types: z.array(edgeTypeEnum).optional().describe('Filter edges by type (e.g., ["depends-on", "extends"])'),
      include_implicit: z.boolean().default(false).describe('Include AI-inferred similarity edges (implicit connections)'),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'doc:read')) return toolError('Permission denied: doc:read required')
    return safeToolCall(async () => {
      return getFullGraph(env as never, auth.tenantId, {
        category: args.category,
        tag: args.tag,
        types: args.types as never,
        includeImplicit: args.include_implicit,
      })
    })
  })

  /** Multi-hop graph traversal from a starting document */
  server.registerTool('graph_traverse', {
    description: 'Traverse the knowledge graph from a starting document. Returns all reachable docs within N hops, filtered by edge type. Use for dependency analysis, impact assessment, or discovering related knowledge clusters.',
    inputSchema: {
      startDocId: z.string().describe('Document ID to start traversal from'),
      depth: z.number().int().min(1).max(3).default(2).describe('Max hops from start (1-3)'),
      edgeTypes: z.array(edgeTypeEnum).optional().describe('Only follow these edge types'),
      direction: z.enum(['outbound', 'inbound', 'both']).default('both').describe('Follow outbound links, inbound backlinks, or both'),
      include_implicit: z.boolean().default(false).describe('Include similarity edges in traversal'),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'doc:read')) return toolError('Permission denied: doc:read required')
    return safeToolCall(async () => {
      return getNeighbors(env as never, auth.tenantId, args.startDocId, {
        depth: args.depth,
        types: args.edgeTypes as never,
        direction: args.direction,
        includeImplicit: args.include_implicit,
      })
    })
  })

  /** Find shortest path between two documents */
  server.registerTool('graph_find_path', {
    description: 'Find the shortest path between two documents in the knowledge graph. Returns the chain of documents connecting them with edge types. Useful for understanding how concepts relate across the knowledge base.',
    inputSchema: {
      fromDocId: z.string().describe('Starting document ID'),
      toDocId: z.string().describe('Target document ID'),
      maxHops: z.number().int().min(1).max(10).default(5).describe('Maximum path length (1-10)'),
      edgeTypes: z.array(edgeTypeEnum).optional().describe('Only follow these edge types'),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'doc:read')) return toolError('Permission denied: doc:read required')
    return safeToolCall(async () => {
      const result = await findPath(env as never, auth.tenantId, args.fromDocId, args.toDocId, {
        maxHops: args.maxHops,
        types: args.edgeTypes as never,
      })
      if (!result) return { error: 'No path found between these documents' }
      return result
    })
  })

  /** Suggest missing links for a document */
  server.registerTool('graph_suggest_links', {
    description: 'AI suggests missing links for a document by finding semantically similar docs that are not yet explicitly linked. Useful for enriching the knowledge graph and discovering hidden connections.',
    inputSchema: {
      docId: z.string().describe('Document ID to get suggestions for'),
      limit: z.number().int().min(1).max(20).default(5).describe('Maximum suggestions to return'),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'doc:read')) return toolError('Permission denied: doc:read required')
    return safeToolCall(async () => {
      const similar = await querySimilarDocs(env as never, args.docId, auth.tenantId, args.limit + 10, 0.5)
      if (!similar.length) return { suggestions: [], message: 'No similar documents found' }

      // Filter out already-linked docs (both directions)
      const db = drizzle(env.DB)
      const existingLinks = await db.select({
        sourceId: documentLinks.sourceDocId,
        targetId: documentLinks.targetDocId,
      })
        .from(documentLinks)
        .where(or(
          eq(documentLinks.sourceDocId, args.docId),
          eq(documentLinks.targetDocId, args.docId),
        ))
      const linkedIds = new Set(existingLinks.flatMap((l) => [l.sourceId, l.targetId]))
      linkedIds.delete(args.docId) // remove self

      const suggestions = similar
        .filter((s) => !linkedIds.has(s.id))
        .slice(0, args.limit)

      return { suggestions, documentId: args.docId }
    })
  })

  /** Explain connection between two documents */
  server.registerTool('graph_explain_connection', {
    description: 'Explain why two documents are related. Shows direct links, shortest path, and similarity score between them. Useful for understanding knowledge relationships and dependencies.',
    inputSchema: {
      docId1: z.string().describe('First document ID'),
      docId2: z.string().describe('Second document ID'),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    if (!checkPermission(auth.scopes, 'doc:read')) return toolError('Permission denied: doc:read required')
    return safeToolCall(async () => {
      const db = drizzle(env.DB)

      // 1. Check direct link
      const directLinks = await db.select()
        .from(documentLinks)
        .where(and(
          eq(documentLinks.sourceDocId, args.docId1),
          eq(documentLinks.targetDocId, args.docId2),
        ))
      const reverseLinks = await db.select()
        .from(documentLinks)
        .where(and(
          eq(documentLinks.sourceDocId, args.docId2),
          eq(documentLinks.targetDocId, args.docId1),
        ))

      // 2. Find shortest path + check similarity concurrently
      const [pathResult, similar] = await Promise.all([
        findPath(env as never, auth.tenantId, args.docId1, args.docId2, { maxHops: 5 }),
        querySimilarDocs(env as never, args.docId1, auth.tenantId, 20, 0.3),
      ])
      const similarity = similar.find((s) => s.id === args.docId2)

      return {
        directLinks: directLinks.map((l) => ({ type: l.type, context: l.context, direction: 'forward' })),
        reverseLinks: reverseLinks.map((l) => ({ type: l.type, context: l.context, direction: 'reverse' })),
        path: pathResult,
        similarity: similarity ? { score: similarity.score } : null,
        connected: directLinks.length > 0 || reverseLinks.length > 0 || pathResult !== null,
      }
    })
  })

  /** Get graph statistics */
  server.registerTool('graph_stats', {
    description: 'Get knowledge graph statistics: node/edge counts, density, most connected documents, orphan nodes, and edge type distribution. Useful for understanding the overall structure and health of the knowledge base.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    if (!checkPermission(auth.scopes, 'doc:read')) return toolError('Permission denied: doc:read required')
    return safeToolCall(async () => getGraphStats(env as never, auth.tenantId))
  })
}
