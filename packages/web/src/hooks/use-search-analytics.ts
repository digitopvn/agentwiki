/** React Query hooks for search analytics and click tracking */

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../lib/api-client'
import type { AnalyticsSummary } from '@agentwiki/shared'

/** Fetch search analytics summary (admin only) */
export function useSearchAnalytics(period: '7d' | '30d' = '7d') {
  return useQuery<AnalyticsSummary>({
    queryKey: ['search-analytics', period],
    queryFn: () => apiClient.get<AnalyticsSummary>(`/api/analytics/search?period=${period}`),
    staleTime: 5 * 60_000,
  })
}

/** Fire-and-forget click tracking */
export function trackSearchClick(searchId: string, documentId: string, position: number) {
  apiClient
    .post('/api/search/track', { searchId, documentId, position })
    .catch(() => {}) // swallow errors — analytics are best-effort
}
