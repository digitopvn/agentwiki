/** Knowledge graph type definitions — edge types, graph responses */

/** Fixed edge relationship types for knowledge graph */
export const EDGE_TYPES = [
  'relates-to',
  'depends-on',
  'extends',
  'references',
  'contradicts',
  'implements',
] as const
export type EdgeType = (typeof EDGE_TYPES)[number]

/** Inference status: 0=user-explicit, 1=ai-inferred, 2=user-confirmed */
export type InferredStatus = 0 | 1 | 2

/** Graph node (document) for Cytoscape.js visualization */
export interface GraphNode {
  id: string
  label: string
  category: string | null
  tags: string[]
  summary?: string | null
  degree?: number
  folderId?: string | null
}

/** Graph edge (explicit wikilink or implicit similarity) */
export interface GraphEdge {
  id: string
  source: string
  target: string
  type: EdgeType
  weight: number
  implicit: boolean
  context?: string | null
  score?: number
}

/** Full graph response for Cytoscape.js */
export interface GraphResponse {
  nodes: Array<{ data: GraphNode }>
  edges: Array<{ data: GraphEdge }>
  stats: {
    nodeCount: number
    edgeCount: number
    explicitEdges: number
    implicitEdges: number
  }
}

/** Graph traversal options */
export interface TraversalOptions {
  depth?: number
  types?: EdgeType[]
  direction?: 'outbound' | 'inbound' | 'both'
  includeImplicit?: boolean
  maxNodes?: number
}

/** Shortest path result */
export interface PathResult {
  path: Array<{ id: string; title: string }>
  edges: GraphEdge[]
  hops: number
}

/** Graph statistics */
export interface GraphStats {
  nodeCount: number
  edgeCount: number
  avgDegree: number
  density: number
  topConnected: Array<{ id: string; title: string; degree: number }>
  orphanCount: number
  edgeTypeDistribution: Record<string, number>
}

/** Similar document result */
export interface SimilarDoc {
  id: string
  title: string
  slug: string
  category?: string | null
  score: number
}
