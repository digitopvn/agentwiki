/** Knowledge Graph routes — provide node/edge data for Cytoscape.js */

import { Hono } from 'hono'
import { eq, and, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { documents, documentLinks, documentTags } from '../db/schema'
import { authGuard } from '../middleware/auth-guard'
import { requirePermission } from '../middleware/require-permission'
import type { Env } from '../env'
import type { AuthContext } from '@agentwiki/shared'

type AuthEnv = { Bindings: Env; Variables: { auth: AuthContext } }

const graphRouter = new Hono<AuthEnv>()
graphRouter.use('*', authGuard)

/** Get full knowledge graph for tenant (nodes + edges) */
graphRouter.get('/', requirePermission('doc:read'), async (c) => {
  const { tenantId } = c.get('auth')
  const category = c.req.query('category')
  const tag = c.req.query('tag')
  const db = drizzle(c.env.DB)

  // Get all documents as nodes
  const conditions = [eq(documents.tenantId, tenantId), isNull(documents.deletedAt)]
  if (category) conditions.push(eq(documents.category, category))

  const docs = await db
    .select({
      id: documents.id,
      title: documents.title,
      slug: documents.slug,
      category: documents.category,
      folderId: documents.folderId,
      updatedAt: documents.updatedAt,
    })
    .from(documents)
    .where(and(...conditions))

  const docIds = new Set(docs.map((d) => d.id))

  // Get tags for coloring/filtering
  const tags = await db.select().from(documentTags)
  const tagMap = new Map<string, string[]>()
  for (const t of tags) {
    if (!tagMap.has(t.documentId)) tagMap.set(t.documentId, [])
    tagMap.get(t.documentId)!.push(t.tag)
  }

  // Filter by tag if specified
  let filteredDocs = docs
  if (tag) {
    filteredDocs = docs.filter((d) => tagMap.get(d.id)?.includes(tag))
  }

  // Get all links between these documents
  const links = await db.select().from(documentLinks)
  const edges = links.filter(
    (l) => docIds.has(l.sourceDocId) && docIds.has(l.targetDocId),
  )

  // Format for Cytoscape.js
  const nodes = filteredDocs.map((d) => ({
    data: {
      id: d.id,
      label: d.title,
      category: d.category,
      tags: tagMap.get(d.id) ?? [],
      folderId: d.folderId,
    },
  }))

  const cytoscapeEdges = edges.map((e) => ({
    data: {
      id: e.id,
      source: e.sourceDocId,
      target: e.targetDocId,
      context: e.context,
    },
  }))

  return c.json({
    nodes,
    edges: cytoscapeEdges,
    stats: {
      nodeCount: nodes.length,
      edgeCount: cytoscapeEdges.length,
    },
  })
})

export { graphRouter }
