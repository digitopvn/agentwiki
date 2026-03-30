/** TanStack Query hooks for search and autocomplete suggestions */

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../lib/api-client'
import type { SearchResponse, SuggestResponse } from '@agentwiki/shared'

/** Hybrid search hook — triggers for queries >= 2 chars */
export function useSearch(query: string) {
  return useQuery<SearchResponse>({
    queryKey: ['search', query],
    queryFn: () =>
      apiClient.get<SearchResponse>(
        `/api/search?q=${encodeURIComponent(query)}&type=hybrid&limit=10`,
      ),
    enabled: query.length >= 2,
    staleTime: 30_000,
    placeholderData: (prev) => prev, // keep previous results while fetching new query
  })
}

/** Autocomplete suggestions hook — triggers for queries >= 1 char */
export function useSuggest(query: string) {
  return useQuery<SuggestResponse>({
    queryKey: ['suggest', query],
    queryFn: () =>
      apiClient.get<SuggestResponse>(
        `/api/search/suggest?q=${encodeURIComponent(query)}&limit=7`,
      ),
    enabled: query.length >= 1,
    staleTime: 60_000,
    placeholderData: (prev) => prev, // keep previous suggestions while fetching
  })
}
