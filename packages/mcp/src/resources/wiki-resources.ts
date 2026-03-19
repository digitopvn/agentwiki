/** MCP resources — read-only browseable data (6 resources) */

import { eq, and, isNull, inArray, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { listDocuments, getDocument } from '../../../api/src/services/document-service'
import { getFolderTree } from '../../../api/src/services/folder-service'
import { documents, documentTags, documentLinks } from '../../../api/src/db/schema'
import { checkPermission } from '../auth/api-key-auth'
import type { Env, McpAuthContext } from '../env'

/** Permission-gated error for resources */
function permissionDenied(uri: string) {
  return { contents: [{ uri, text: '{"error":"Permission denied: doc:read required"}', mimeType: 'application/json' }] }
}

export function registerWikiResources(
  server: McpServer,
  env: Env,
  auth: McpAuthContext,
) {
  // 1. All documents list
  server.registerResource('all-documents', 'agentwiki://documents', {
    description: 'List of all documents in the workspace',
    mimeType: 'application/json',
  }, async () => {
    if (!checkPermission(auth.scopes, 'doc:read')) return permissionDenied('agentwiki://documents')
    const { data, total } = await listDocuments(env as never, auth.tenantId, { limit: 100, offset: 0 })
    return { contents: [{ uri: 'agentwiki://documents', text: JSON.stringify({ data, total }, null, 2), mimeType: 'application/json' }] }
  })

  // 2. Document content by ID (dynamic URI template)
  server.registerResource(
    'document-content',
    new ResourceTemplate('agentwiki://documents/{id}', { list: undefined }),
    { description: 'Full markdown content of a document', mimeType: 'text/markdown' },
    async (uri, variables) => {
      if (!checkPermission(auth.scopes, 'doc:read')) return permissionDenied(uri.href)
      const id = variables.id as string
      const doc = await getDocument(env as never, auth.tenantId, id)
      if (!doc) return { contents: [{ uri: uri.href, text: 'Document not found', mimeType: 'text/plain' }] }
      return { contents: [{ uri: uri.href, text: `# ${doc.title}\n\n${doc.content}`, mimeType: 'text/markdown' }] }
    },
  )

  // 3. Document metadata by ID (dynamic URI template)
  server.registerResource(
    'document-metadata',
    new ResourceTemplate('agentwiki://documents/{id}/meta', { list: undefined }),
    { description: 'Document metadata (tags, dates, author)', mimeType: 'application/json' },
    async (uri, variables) => {
      if (!checkPermission(auth.scopes, 'doc:read')) return permissionDenied(uri.href)
      const id = variables.id as string
      const doc = await getDocument(env as never, auth.tenantId, id)
      if (!doc) return { contents: [{ uri: uri.href, text: '{"error":"not found"}', mimeType: 'application/json' }] }
      const { content, contentJson, ...meta } = doc
      return { contents: [{ uri: uri.href, text: JSON.stringify(meta, null, 2), mimeType: 'application/json' }] }
    },
  )

  // 4. Folder tree
  server.registerResource('folder-tree', 'agentwiki://folders', {
    description: 'Hierarchical folder structure of the workspace',
    mimeType: 'application/json',
  }, async () => {
    if (!checkPermission(auth.scopes, 'doc:read')) return permissionDenied('agentwiki://folders')
    const tree = await getFolderTree(env as never, auth.tenantId)
    return { contents: [{ uri: 'agentwiki://folders', text: JSON.stringify(tree, null, 2), mimeType: 'application/json' }] }
  })

  // 5. All tags with counts
  server.registerResource('all-tags', 'agentwiki://tags', {
    description: 'All tags in the workspace with document counts',
    mimeType: 'application/json',
  }, async () => {
    if (!checkPermission(auth.scopes, 'doc:read')) return permissionDenied('agentwiki://tags')
    const db = drizzle(env.DB)
    const tags = await db
      .select({ tag: documentTags.tag, count: sql<number>`count(*)` })
      .from(documentTags)
      .innerJoin(documents, eq(documentTags.documentId, documents.id))
      .where(eq(documents.tenantId, auth.tenantId))
      .groupBy(documentTags.tag)
      .orderBy(sql`count(*) desc`)
    return { contents: [{ uri: 'agentwiki://tags', text: JSON.stringify({ tags }, null, 2), mimeType: 'application/json' }] }
  })

  // 6. Knowledge graph — tenant-scoped queries (no cross-tenant data loading)
  server.registerResource('knowledge-graph', 'agentwiki://graph', {
    description: 'Knowledge graph with document nodes and wikilink edges',
    mimeType: 'application/json',
  }, async () => {
    if (!checkPermission(auth.scopes, 'doc:read')) return permissionDenied('agentwiki://graph')
    const db = drizzle(env.DB)
    const docs = await db
      .select({ id: documents.id, title: documents.title, category: documents.category })
      .from(documents)
      .where(and(eq(documents.tenantId, auth.tenantId), isNull(documents.deletedAt)))

    if (!docs.length) {
      return { contents: [{ uri: 'agentwiki://graph', text: JSON.stringify({ nodes: [], edges: [], stats: { nodeCount: 0, edgeCount: 0 } }), mimeType: 'application/json' }] }
    }

    const docIdList = docs.map((d) => d.id)
    // Tenant-scoped: only links where source belongs to this tenant
    const linkRows = await db.select().from(documentLinks).where(inArray(documentLinks.sourceDocId, docIdList))
    const docIds = new Set(docIdList)
    const edges = linkRows
      .filter((l) => docIds.has(l.targetDocId))
      .map((e) => ({ source: e.sourceDocId, target: e.targetDocId, context: e.context }))

    const graph = {
      nodes: docs.map((d) => ({ id: d.id, label: d.title, category: d.category })),
      edges,
      stats: { nodeCount: docs.length, edgeCount: edges.length },
    }
    return { contents: [{ uri: 'agentwiki://graph', text: JSON.stringify(graph, null, 2), mimeType: 'application/json' }] }
  })
}
