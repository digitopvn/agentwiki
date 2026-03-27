/** Hooks for knowledge graph data fetching */

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../lib/api-client'
import type { GraphResponse, GraphStats, SimilarDoc, PathResult } from '@agentwiki/shared'

interface GraphFilters {
  category?: string
  tag?: string
  types?: string[]
  includeImplicit?: boolean
}

/** Build query string from filters */
function buildGraphUrl(base: string, params: Record<string, string | boolean | undefined>) {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      searchParams.set(key, String(value))
    }
  }
  const qs = searchParams.toString()
  return qs ? `${base}?${qs}` : base
}

/** Fetch full knowledge graph */
export function useGraphData(filters: GraphFilters = {}) {
  const url = buildGraphUrl('/api/graph', {
    category: filters.category,
    tag: filters.tag,
    types: filters.types?.join(','),
    include_implicit: (filters.includeImplicit ?? true) ? 'true' : undefined,
  })

  return useQuery<GraphResponse>({
    queryKey: ['graph', filters],
    queryFn: () => apiClient.get<GraphResponse>(url),
    staleTime: 60_000,
  })
}

/** Fetch graph statistics */
export function useGraphStats() {
  return useQuery<GraphStats>({
    queryKey: ['graph-stats'],
    queryFn: () => apiClient.get<GraphStats>('/api/graph/stats'),
    staleTime: 60_000,
  })
}

/** Fetch similar documents for a given document */
export function useGraphSimilar(docId: string | null, limit = 10) {
  const url = docId ? buildGraphUrl(`/api/graph/similar/${docId}`, { limit: String(limit) }) : ''
  return useQuery<{ results: SimilarDoc[]; documentId: string }>({
    queryKey: ['graph-similar', docId, limit],
    queryFn: () => apiClient.get(url),
    enabled: !!docId,
    staleTime: 60_000,
  })
}

/** Fetch shortest path between two documents */
export function useGraphPath(fromId: string | null, toId: string | null) {
  const url = fromId && toId ? `/api/graph/path/${fromId}/${toId}` : ''
  return useQuery<PathResult>({
    queryKey: ['graph-path', fromId, toId],
    queryFn: () => apiClient.get(url),
    enabled: !!fromId && !!toId,
    staleTime: 60_000,
  })
}
