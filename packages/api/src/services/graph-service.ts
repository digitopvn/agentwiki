/** Knowledge graph service — traversal, path finding, statistics */

import { eq, and, isNull, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { documents, documentLinks, documentTags, documentSimilarities } from '../db/schema'
import type { Env } from '../env'
import type { EdgeType, GraphResponse, GraphEdge, GraphNode, GraphStats, PathResult } from '@agentwiki/shared'

// ── Internal helpers ──

interface RawLink {
  id: string
  sourceDocId: string
  targetDocId: string
  context: string | null
  type: string
  weight: number | null
}

interface RawDoc {
  id: string
  title: string
  slug: string
  category: string | null
  folderId: string | null
  summary: string | null
}

/** Build adjacency list from raw links */
function buildAdjacencyList(
  links: RawLink[],
  direction: 'outbound' | 'inbound' | 'both',
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>()

  const addEdge = (from: string, to: string) => {
    if (!adj.has(from)) adj.set(from, new Set())
    adj.get(from)!.add(to)
  }

  for (const link of links) {
    if (direction === 'outbound' || direction === 'both') {
      addEdge(link.sourceDocId, link.targetDocId)
    }
    if (direction === 'inbound' || direction === 'both') {
      addEdge(link.targetDocId, link.sourceDocId)
    }
  }

  return adj
}

/** BFS traversal — returns visited node IDs up to max depth */
function bfsTraverse(
  adj: Map<string, Set<string>>,
  startId: string,
  maxDepth: number,
  maxNodes: number,
): Set<string> {
  const visited = new Set<string>([startId])
  let frontier = [startId]

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: string[] = []
    for (const nodeId of frontier) {
      const neighbors = adj.get(nodeId)
      if (!neighbors) continue
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n)
          next.push(n)
          if (visited.size >= maxNodes) return visited
        }
      }
    }
    frontier = next
  }

  return visited
}

/** BFS shortest path — returns node IDs in path order or null */
function bfsShortestPath(
  adj: Map<string, Set<string>>,
  fromId: string,
  toId: string,
  maxHops: number,
): string[] | null {
  if (fromId === toId) return [fromId]

  const visited = new Set<string>([fromId])
  const parent = new Map<string, string>()
  let frontier = [fromId]

  for (let depth = 0; depth < maxHops && frontier.length > 0; depth++) {
    const next: string[] = []
    for (const nodeId of frontier) {
      const neighbors = adj.get(nodeId)
      if (!neighbors) continue
      for (const n of neighbors) {
        if (visited.has(n)) continue
        visited.add(n)
        parent.set(n, nodeId)
        if (n === toId) {
          // Reconstruct path
          const path: string[] = [toId]
          let current = toId
          while (parent.has(current)) {
            current = parent.get(current)!
            path.unshift(current)
          }
          return path
        }
        next.push(n)
      }
    }
    frontier = next
  }

  return null
}

/** Compute degree (connection count) for each node */
function computeDegrees(links: RawLink[]): Map<string, number> {
  const degrees = new Map<string, number>()
  for (const link of links) {
    degrees.set(link.sourceDocId, (degrees.get(link.sourceDocId) ?? 0) + 1)
    degrees.set(link.targetDocId, (degrees.get(link.targetDocId) ?? 0) + 1)
  }
  return degrees
}

/** Format raw data into GraphResponse */
function formatGraphResponse(
  docs: RawDoc[],
  links: RawLink[],
  tagMap: Map<string, string[]>,
  implicitEdges: Array<{ id: string; sourceDocId: string; targetDocId: string; score: number }>,
): GraphResponse {
  const degrees = computeDegrees(links)
  const docIds = new Set(docs.map((d) => d.id))

  const nodes = docs.map((d) => ({
    data: {
      id: d.id,
      label: d.title,
      category: d.category,
      tags: tagMap.get(d.id) ?? [],
      summary: d.summary,
      degree: degrees.get(d.id) ?? 0,
      folderId: d.folderId,
    } satisfies GraphNode,
  }))

  const explicitEdgeData: Array<{ data: GraphEdge }> = links
    .filter((l) => docIds.has(l.sourceDocId) && docIds.has(l.targetDocId))
    .map((e) => ({
      data: {
        id: e.id,
        source: e.sourceDocId,
        target: e.targetDocId,
        type: e.type as EdgeType,
        weight: e.weight ?? 1.0,
        implicit: false,
        context: e.context,
      },
    }))

  const implicitEdgeData: Array<{ data: GraphEdge }> = implicitEdges
    .filter((s) => docIds.has(s.sourceDocId) && docIds.has(s.targetDocId))
    .map((s) => ({
      data: {
        id: `sim-${s.id}`,
        source: s.sourceDocId,
        target: s.targetDocId,
        type: 'relates-to' as EdgeType,
        weight: s.score,
        implicit: true,
        score: s.score,
      },
    }))

  return {
    nodes,
    edges: [...explicitEdgeData, ...implicitEdgeData],
    stats: {
      nodeCount: nodes.length,
      edgeCount: explicitEdgeData.length + implicitEdgeData.length,
      explicitEdges: explicitEdgeData.length,
      implicitEdges: implicitEdgeData.length,
    },
  }
}

// ── Public API ──

/** Fetch all tenant docs matching conditions */
async function fetchTenantDocs(
  db: ReturnType<typeof drizzle>,
  tenantId: string,
  category?: string,
) {
  const conditions = [eq(documents.tenantId, tenantId), isNull(documents.deletedAt)]
  if (category) conditions.push(eq(documents.category, category))

  return db
    .select({
      id: documents.id,
      title: documents.title,
      slug: documents.slug,
      category: documents.category,
      folderId: documents.folderId,
      summary: documents.summary,
    })
    .from(documents)
    .where(and(...conditions))
}

/** Fetch tags for a list of document IDs */
async function fetchTagMap(
  db: ReturnType<typeof drizzle>,
  docIds: string[],
): Promise<Map<string, string[]>> {
  if (!docIds.length) return new Map()
  const tagRows = await db
    .select({ documentId: documentTags.documentId, tag: documentTags.tag })
    .from(documentTags)
    .where(inArray(documentTags.documentId, docIds))

  const tagMap = new Map<string, string[]>()
  for (const t of tagRows) {
    if (!tagMap.has(t.documentId)) tagMap.set(t.documentId, [])
    tagMap.get(t.documentId)!.push(t.tag)
  }
  return tagMap
}

/** Fetch explicit links for a set of doc IDs, optionally filtered by edge type */
async function fetchLinks(
  db: ReturnType<typeof drizzle>,
  docIds: string[],
  types?: EdgeType[],
): Promise<RawLink[]> {
  if (!docIds.length) return []
  const links = await db.select().from(documentLinks).where(inArray(documentLinks.sourceDocId, docIds))

  const docIdSet = new Set(docIds)
  let filtered = links.filter((l) => docIdSet.has(l.targetDocId))
  if (types?.length) {
    filtered = filtered.filter((l) => types.includes(l.type as EdgeType))
  }
  return filtered as RawLink[]
}

/** Fetch cached similarities for a set of doc IDs */
async function fetchSimilarities(
  db: ReturnType<typeof drizzle>,
  docIds: string[],
) {
  if (!docIds.length) return []
  return db.select().from(documentSimilarities).where(inArray(documentSimilarities.sourceDocId, docIds))
}

/** Get full knowledge graph with typed edges */
export async function getFullGraph(
  env: Env,
  tenantId: string,
  opts: {
    category?: string
    tag?: string
    types?: EdgeType[]
    includeImplicit?: boolean
  } = {},
): Promise<GraphResponse> {
  const db = drizzle(env.DB)
  const docs = await fetchTenantDocs(db, tenantId, opts.category)
  if (!docs.length) return { nodes: [], edges: [], stats: { nodeCount: 0, edgeCount: 0, explicitEdges: 0, implicitEdges: 0 } }

  const docIds = docs.map((d) => d.id)
  const tagMap = await fetchTagMap(db, docIds)

  // Filter by tag if specified
  let filteredDocs = docs
  if (opts.tag) {
    filteredDocs = docs.filter((d) => tagMap.get(d.id)?.includes(opts.tag!))
  }

  const filteredIds = filteredDocs.map((d) => d.id)
  const links = await fetchLinks(db, filteredIds, opts.types)
  const implicit = opts.includeImplicit ? await fetchSimilarities(db, filteredIds) : []

  return formatGraphResponse(filteredDocs, links, tagMap, implicit)
}

/** Get N-hop neighbors from a starting document */
export async function getNeighbors(
  env: Env,
  tenantId: string,
  docId: string,
  opts: {
    depth?: number
    types?: EdgeType[]
    direction?: 'outbound' | 'inbound' | 'both'
    includeImplicit?: boolean
    maxNodes?: number
  } = {},
): Promise<GraphResponse> {
  const depth = Math.min(opts.depth ?? 1, 3)
  const direction = opts.direction ?? 'both'
  const maxNodes = Math.min(opts.maxNodes ?? 50, 200)
  const db = drizzle(env.DB)

  // Fetch all tenant docs + links (for BFS we need full adjacency)
  const allDocs = await fetchTenantDocs(db, tenantId)
  const allDocIds = allDocs.map((d) => d.id)
  const allLinks = await fetchLinks(db, allDocIds, opts.types)

  // BFS from starting node
  const adj = buildAdjacencyList(allLinks, direction)
  const visited = bfsTraverse(adj, docId, depth, maxNodes)

  // Filter to visited nodes
  const neighborDocs = allDocs.filter((d) => visited.has(d.id))
  const neighborIds = neighborDocs.map((d) => d.id)
  const neighborLinks = allLinks.filter(
    (l) => visited.has(l.sourceDocId) && visited.has(l.targetDocId),
  )

  const tagMap = await fetchTagMap(db, neighborIds)
  const implicit = opts.includeImplicit ? await fetchSimilarities(db, neighborIds) : []

  return formatGraphResponse(neighborDocs, neighborLinks, tagMap, implicit)
}

/** Get ego-network subgraph centered on a document */
export async function getSubgraph(
  env: Env,
  tenantId: string,
  docId: string,
  opts: { depth?: number; maxNodes?: number } = {},
): Promise<GraphResponse> {
  return getNeighbors(env, tenantId, docId, {
    depth: opts.depth ?? 2,
    maxNodes: opts.maxNodes ?? 50,
    direction: 'both',
    includeImplicit: true,
  })
}

/** Find shortest path between two documents via BFS */
export async function findPath(
  env: Env,
  tenantId: string,
  fromId: string,
  toId: string,
  opts: { maxHops?: number; types?: EdgeType[] } = {},
): Promise<PathResult | null> {
  const maxHops = Math.min(opts.maxHops ?? 5, 10)
  const db = drizzle(env.DB)

  const allDocs = await fetchTenantDocs(db, tenantId)
  const allDocIds = allDocs.map((d) => d.id)
  const allLinks = await fetchLinks(db, allDocIds, opts.types)

  // BFS with both directions for path finding
  const adj = buildAdjacencyList(allLinks, 'both')
  const pathIds = bfsShortestPath(adj, fromId, toId, maxHops)
  if (!pathIds) return null

  const docMap = new Map(allDocs.map((d) => [d.id, d]))
  const path = pathIds.map((id) => ({
    id,
    title: docMap.get(id)?.title ?? 'Unknown',
  }))

  // Collect edges along the path
  const pathEdges: GraphEdge[] = []
  for (let i = 0; i < pathIds.length - 1; i++) {
    const link = allLinks.find(
      (l) =>
        (l.sourceDocId === pathIds[i] && l.targetDocId === pathIds[i + 1]) ||
        (l.sourceDocId === pathIds[i + 1] && l.targetDocId === pathIds[i]),
    )
    if (link) {
      pathEdges.push({
        id: link.id,
        source: link.sourceDocId,
        target: link.targetDocId,
        type: link.type as EdgeType,
        weight: link.weight ?? 1.0,
        implicit: false,
        context: link.context,
      })
    }
  }

  return { path, edges: pathEdges, hops: pathIds.length - 1 }
}

/** Get graph statistics */
export async function getGraphStats(env: Env, tenantId: string): Promise<GraphStats> {
  const db = drizzle(env.DB)
  const allDocs = await fetchTenantDocs(db, tenantId)
  const allDocIds = allDocs.map((d) => d.id)
  const allLinks = await fetchLinks(db, allDocIds)

  const degrees = computeDegrees(allLinks)
  const connectedIds = new Set([...allLinks.map((l) => l.sourceDocId), ...allLinks.map((l) => l.targetDocId)])
  const orphanCount = allDocs.filter((d) => !connectedIds.has(d.id)).length

  // Edge type distribution
  const edgeTypeDistribution: Record<string, number> = {}
  for (const link of allLinks) {
    edgeTypeDistribution[link.type] = (edgeTypeDistribution[link.type] ?? 0) + 1
  }

  // Top connected docs
  const topConnected = [...degrees.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, degree]) => ({
      id,
      title: allDocs.find((d) => d.id === id)?.title ?? 'Unknown',
      degree,
    }))

  const nodeCount = allDocs.length
  const edgeCount = allLinks.length
  const avgDegree = nodeCount > 0 ? (edgeCount * 2) / nodeCount : 0
  const maxEdges = nodeCount * (nodeCount - 1)
  const density = maxEdges > 0 ? edgeCount / maxEdges : 0

  return {
    nodeCount,
    edgeCount,
    avgDegree: Math.round(avgDegree * 100) / 100,
    density: Math.round(density * 10000) / 10000,
    topConnected,
    orphanCount,
    edgeTypeDistribution,
  }
}
