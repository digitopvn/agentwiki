/** TanStack Query hook for hybrid search via /api/search */

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../lib/api-client'

interface SearchResult {
  id: string
  title: string
  slug: string
  snippet?: string
  score?: number
  category?: string
}

interface SearchResponse {
  results: SearchResult[]
}

export function useSearch(query: string) {
  return useQuery<SearchResponse>({
    queryKey: ['search', query],
    queryFn: () =>
      apiClient.get<SearchResponse>(
        `/api/search?q=${encodeURIComponent(query)}&type=hybrid&limit=10`,
      ),
    enabled: query.length >= 2,
    staleTime: 30_000,
  })
}
