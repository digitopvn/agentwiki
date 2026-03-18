/** TanStack Query hook for current authenticated user */

import { useQuery } from '@tanstack/react-query'
import { apiClient, ApiError } from '../lib/api-client'
import type { User } from '@agentwiki/shared'

export function useAuth() {
  const query = useQuery<User, ApiError>({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient.get<User>('/api/auth/me'),
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
    isAuthenticated: !!query.data,
    error: query.error,
    refetch: query.refetch,
  }
}
