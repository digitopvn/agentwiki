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

export function useReorderAISettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (order: { providerId: string; priority: number }[]) =>
      apiClient.patch('/api/ai/settings/order', { order }),
    // Optimistic update: apply new order immediately to prevent snap-back during drag
    onMutate: async (order) => {
      await qc.cancelQueries({ queryKey: ['ai-settings'] })
      const prev = qc.getQueryData<{ settings: AIProviderSetting[] }>(['ai-settings'])
      if (prev) {
        const orderMap = new Map(order.map((o) => [o.providerId, o.priority]))
        const updated = prev.settings.map((s) => ({
          ...s,
          priority: orderMap.get(s.providerId) ?? s.priority,
        }))
        qc.setQueryData(['ai-settings'], { settings: updated })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['ai-settings'], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['ai-settings'] }),
  })
}
