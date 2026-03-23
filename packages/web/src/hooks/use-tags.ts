/** TanStack Query hooks for tags and categories */

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../lib/api-client'

export function useTags() {
  return useQuery<{ tags: string[] }>({
    queryKey: ['tags'],
    queryFn: () => apiClient.get<{ tags: string[] }>('/api/tags'),
  })
}

export function useCategories() {
  return useQuery<{ categories: string[] }>({
    queryKey: ['categories'],
    queryFn: () => apiClient.get<{ categories: string[] }>('/api/tags/categories'),
  })
}
