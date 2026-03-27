/** Knowledge Graph routes — typed edges, traversal, path finding, stats */

import { Hono } from 'hono'
import { authGuard } from '../middleware/auth-guard'
import { requirePermission } from '../middleware/require-permission'
import { getFullGraph, getNeighbors, getSubgraph, findPath, getGraphStats } from '../services/graph-service'
import { querySimilarDocs } from '../services/similarity-service'
import { eq, or, and, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { documentLinks, documents } from '../db/schema'
import { syncWikilinks } from '../services/document-service'
import type { Env } from '../env'
import { EDGE_TYPES } from '@agentwiki/shared'
import type { AuthContext, EdgeType } from '@agentwiki/shared'

type AuthEnv = { Bindings: Env; Variables: { auth: AuthContext } }

const graphRouter = new Hono<AuthEnv>()
graphRouter.use('*', authGuard)

const VALID_DIRECTIONS = ['outbound', 'inbound', 'both'] as const

/** Parse comma-separated edge types from query param */
function parseEdgeTypes(param?: string): EdgeType[] | undefined {
  if (!param) return undefined
  return param.split(',').filter((t) => (EDGE_TYPES as readonly string[]).includes(t)) as EdgeType[]
}

/** Parse numeric query param with fallback */
function parseNum(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isNaN(n) ? fallback : n
}

/** Get full knowledge graph for tenant (nodes + typed edges) */
graphRouter.get('/', requirePermission('doc:read'), async (c) => {
  try {
    const { tenantId } = c.get('auth')
    const category = c.req.query('category')
    const tag = c.req.query('tag')
    const types = parseEdgeTypes(c.req.query('types'))
    const includeImplicit = c.req.query('include_implicit') === 'true'

    const result = await getFullGraph(c.env, tenantId, {
      category: category ?? undefined,
      tag: tag ?? undefined,
      types,
      includeImplicit,
    })
    return c.json(result)
  } catch (err) {
    console.error('Graph fetch error:', err)
    return c.json({ error: 'Failed to fetch graph data' }, 500)
  }
})

/** Get N-hop neighbors from a document */
graphRouter.get('/neighbors/:id', requirePermission('doc:read'), async (c) => {
  try {
    const docId = c.req.param('id')
    const { tenantId } = c.get('auth')
    const depth = Math.min(parseNum(c.req.query('depth'), 1), 3)
    const types = parseEdgeTypes(c.req.query('types'))
    const rawDir = c.req.query('direction')
    const direction = VALID_DIRECTIONS.includes(rawDir as never) ? (rawDir as 'outbound' | 'inbound' | 'both') : 'both'
    const includeImplicit = c.req.query('include_implicit') === 'true'
    const maxNodes = Math.min(parseNum(c.req.query('max_nodes'), 50), 200)

    const result = await getNeighbors(c.env, tenantId, docId, {
      depth, types, direction, includeImplicit, maxNodes,
    })
    return c.json(result)
  } catch (err) {
    console.error('Neighbors fetch error:', err)
    return c.json({ error: 'Failed to fetch neighbors' }, 500)
  }
})

/** Get ego-network subgraph centered on a document */
graphRouter.get('/subgraph/:id', requirePermission('doc:read'), async (c) => {
  try {
    const docId = c.req.param('id')
    const { tenantId } = c.get('auth')
    const depth = Math.min(parseNum(c.req.query('depth'), 2), 3)
    const maxNodes = Math.min(parseNum(c.req.query('max_nodes'), 50), 200)

    const result = await getSubgraph(c.env, tenantId, docId, { depth, maxNodes })
    return c.json(result)
  } catch (err) {
    console.error('Subgraph fetch error:', err)
    return c.json({ error: 'Failed to fetch subgraph' }, 500)
  }
})

/** Find shortest path between two documents */
graphRouter.get('/path/:from/:to', requirePermission('doc:read'), async (c) => {
  try {
    const fromId = c.req.param('from')
    const toId = c.req.param('to')
    const { tenantId } = c.get('auth')
    const maxHops = Math.min(parseNum(c.req.query('max_hops'), 5), 10)
    const types = parseEdgeTypes(c.req.query('types'))

    const result = await findPath(c.env, tenantId, fromId, toId, { maxHops, types })
    if (!result) return c.json({ error: 'No path found', from: fromId, to: toId }, 404)
    return c.json(result)
  } catch (err) {
    console.error('Path find error:', err)
    return c.json({ error: 'Failed to find path' }, 500)
  }
})

/** Suggest missing links for a document (similar docs not yet explicitly linked) */
graphRouter.get('/suggest-links/:id', requirePermission('doc:read'), async (c) => {
  try {
    const docId = c.req.param('id')
    const { tenantId } = c.get('auth')
    const limit = Math.min(parseNum(c.req.query('limit'), 5), 20)

    const similar = await querySimilarDocs(c.env, docId, tenantId, limit + 10, 0.5)
    if (!similar.length) return c.json({ suggestions: [], documentId: docId })

    // Filter out already-linked docs (both directions)
    const db = drizzle(c.env.DB)
    const existing = await db.select({
      sourceId: documentLinks.sourceDocId,
      targetId: documentLinks.targetDocId,
    })
      .from(documentLinks)
      .where(or(
        eq(documentLinks.sourceDocId, docId),
        eq(documentLinks.targetDocId, docId),
      ))
    const linkedIds = new Set(existing.flatMap((e) => [e.sourceId, e.targetId]))
    linkedIds.delete(docId) // remove self

    const suggestions = similar.filter((s) => !linkedIds.has(s.id)).slice(0, limit)
    return c.json({ suggestions, documentId: docId })
  } catch (err) {
    console.error('Suggest links error:', err)
    return c.json({ error: 'Failed to suggest links' }, 500)
  }
})

/** Get similar documents via on-demand Vectorize query */
graphRouter.get('/similar/:id', requirePermission('doc:read'), async (c) => {
  try {
    const docId = c.req.param('id')
    const { tenantId } = c.get('auth')
    const limit = Math.min(parseNum(c.req.query('limit'), 10), 50)
    const minScore = parseNum(c.req.query('min_score'), 0.5)

    const results = await querySimilarDocs(c.env, docId, tenantId, limit, minScore)
    return c.json({ results, documentId: docId })
  } catch (err) {
    console.error('Similar docs error:', err)
    return c.json({ error: 'Failed to fetch similar documents' }, 500)
  }
})

/** Get graph statistics */
graphRouter.get('/stats', requirePermission('doc:read'), async (c) => {
  try {
    const { tenantId } = c.get('auth')
    const stats = await getGraphStats(c.env, tenantId)
    return c.json(stats)
  } catch (err) {
    console.error('Graph stats error:', err)
    return c.json({ error: 'Failed to fetch graph statistics' }, 500)
  }
})

/** Backfill edges for existing documents (admin, batched to respect CPU limits) */
graphRouter.post('/backfill-edges', requirePermission('tenant:manage'), async (c) => {
  try {
    const { tenantId } = c.get('auth')
    const db = drizzle(c.env.DB)
    const BATCH_SIZE = 50
    const offset = parseNum(c.req.query('offset'), 0)

    const batch = await db
      .select({ id: documents.id, content: documents.content })
      .from(documents)
      .where(and(eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))
      .limit(BATCH_SIZE)
      .offset(offset)

    let processed = 0
    for (const doc of batch) {
      if (!doc.content) continue
      await syncWikilinks(db, doc.id, doc.content, tenantId)
      processed++
    }

    const hasMore = batch.length === BATCH_SIZE
    return c.json({
      ok: true,
      processed,
      offset,
      nextOffset: hasMore ? offset + BATCH_SIZE : null,
      hasMore,
    })
  } catch (err) {
    console.error('Backfill edges error:', err)
    return c.json({ error: 'Failed to backfill edges' }, 500)
  }
})

export { graphRouter }
