/** TanStack Query hooks for user preferences */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/api-client'

interface PreferencesResponse {
  preferences: Record<string, string>
}

export function usePreferences() {
  return useQuery<Record<string, string>>({
    queryKey: ['preferences'],
    queryFn: () => apiClient.get<PreferencesResponse>('/api/preferences').then((r) => r.preferences),
  })
}

export function useSetPreference() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      apiClient.put<{ ok: boolean }>(`/api/preferences/${key}`, { value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['preferences'] }),
  })
}

/** Convenience hook for sidebar sort preference */
export function useSidebarSort() {
  const { data: prefs, isLoading } = usePreferences()
  const setPref = useSetPreference()

  let sortMode: 'manual' | 'name' | 'date' = 'manual'
  let sortDirection: 'asc' | 'desc' = 'asc'

  if (prefs?.sidebar_sort) {
    try {
      const parsed = JSON.parse(prefs.sidebar_sort)
      if (parsed.mode) sortMode = parsed.mode
      if (parsed.direction) sortDirection = parsed.direction
    } catch {
      // Invalid JSON, use defaults
    }
  }

  const setSortPref = (mode: 'manual' | 'name' | 'date', direction: 'asc' | 'desc') => {
    setPref.mutate({ key: 'sidebar_sort', value: JSON.stringify({ mode, direction }) })
  }

  return { sortMode, sortDirection, setSortPref, isLoading }
}
