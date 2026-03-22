/** Knowledge Graph routes — typed edges, traversal, path finding, stats */

import { Hono } from 'hono'
import { authGuard } from '../middleware/auth-guard'
import { requirePermission } from '../middleware/require-permission'
import { getFullGraph, getNeighbors, getSubgraph, findPath, getGraphStats } from '../services/graph-service'
import { querySimilarDocs } from '../services/similarity-service'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { documentLinks } from '../db/schema'
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
})

/** Get N-hop neighbors from a document */
graphRouter.get('/neighbors/:id', requirePermission('doc:read'), async (c) => {
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
})

/** Get ego-network subgraph centered on a document */
graphRouter.get('/subgraph/:id', requirePermission('doc:read'), async (c) => {
  const docId = c.req.param('id')
  const { tenantId } = c.get('auth')
  const depth = Math.min(parseNum(c.req.query('depth'), 2), 3)
  const maxNodes = Math.min(parseNum(c.req.query('max_nodes'), 50), 200)

  const result = await getSubgraph(c.env, tenantId, docId, { depth, maxNodes })
  return c.json(result)
})

/** Find shortest path between two documents */
graphRouter.get('/path/:from/:to', requirePermission('doc:read'), async (c) => {
  const fromId = c.req.param('from')
  const toId = c.req.param('to')
  const { tenantId } = c.get('auth')
  const maxHops = Math.min(parseNum(c.req.query('max_hops'), 5), 10)
  const types = parseEdgeTypes(c.req.query('types'))

  const result = await findPath(c.env, tenantId, fromId, toId, { maxHops, types })
  if (!result) return c.json({ error: 'No path found', from: fromId, to: toId }, 404)
  return c.json(result)
})

/** Suggest missing links for a document (similar docs not yet explicitly linked) */
graphRouter.get('/suggest-links/:id', requirePermission('doc:read'), async (c) => {
  const docId = c.req.param('id')
  const { tenantId } = c.get('auth')
  const limit = Math.min(parseNum(c.req.query('limit'), 5), 20)

  const similar = await querySimilarDocs(c.env, docId, tenantId, limit + 10, 0.5)
  if (!similar.length) return c.json({ suggestions: [], documentId: docId })

  // Filter out already-linked docs
  const db = drizzle(c.env.DB)
  const existing = await db.select({ targetId: documentLinks.targetDocId })
    .from(documentLinks).where(eq(documentLinks.sourceDocId, docId))
  const linkedIds = new Set(existing.map((e) => e.targetId))

  const suggestions = similar.filter((s) => !linkedIds.has(s.id)).slice(0, limit)
  return c.json({ suggestions, documentId: docId })
})

/** Get similar documents via on-demand Vectorize query */
graphRouter.get('/similar/:id', requirePermission('doc:read'), async (c) => {
  const docId = c.req.param('id')
  const { tenantId } = c.get('auth')
  const limit = Math.min(parseNum(c.req.query('limit'), 10), 50)
  const minScore = parseNum(c.req.query('min_score'), 0.5)

  const results = await querySimilarDocs(c.env, docId, tenantId, limit, minScore)
  return c.json({ results, documentId: docId })
})

/** Get graph statistics */
graphRouter.get('/stats', requirePermission('doc:read'), async (c) => {
  const { tenantId } = c.get('auth')
  const stats = await getGraphStats(c.env, tenantId)
  return c.json(stats)
})

export { graphRouter }
