/** Hooks for AI provider settings and usage CRUD */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/api-client'
import type { AIProviderSetting, AIUsageRecord } from '@agentwiki/shared'

export function useAISettings() {
  return useQuery<{ settings: AIProviderSetting[] }>({
    queryKey: ['ai-settings'],
    queryFn: () => apiClient.get('/api/ai/settings'),
  })
}

export function useUpdateAISetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { providerId: string; apiKey: string; defaultModel: string; isEnabled: boolean }) =>
      apiClient.put('/api/ai/settings', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-settings'] }),
  })
}

export function useDeleteAISetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (providerId: string) => apiClient.delete(`/api/ai/settings/${providerId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-settings'] }),
  })
}

export function useAIUsage() {
  return useQuery<{ usage: AIUsageRecord[] }>({
    queryKey: ['ai-usage'],
    queryFn: () => apiClient.get('/api/ai/usage'),
  })
}
