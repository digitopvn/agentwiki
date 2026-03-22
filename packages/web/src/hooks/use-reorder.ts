/** Reorder mutation hook with optimistic updates for smooth DnD */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/api-client'

interface ReorderInput {
  type: 'folder' | 'document'
  id: string
  parentId: string | null
  afterId?: string
  beforeId?: string
}

export function useReorderItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ReorderInput) =>
      apiClient.patch<{ id: string; position: string }>('/api/reorder', input),
    onMutate: async (variables) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await qc.cancelQueries({ queryKey: ['folders'] })
      if (variables.type === 'document') {
        await qc.cancelQueries({ queryKey: ['documents'] })
      }
      // Snapshot previous data for rollback
      const prevFolders = qc.getQueryData(['folders'])
      const prevDocs = qc.getQueriesData({ queryKey: ['documents'] })
      return { prevFolders, prevDocs }
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.prevFolders) {
        qc.setQueryData(['folders'], context.prevFolders)
      }
      if (context?.prevDocs) {
        for (const [key, data] of context.prevDocs) {
          qc.setQueryData(key, data)
        }
      }
    },
    onSettled: (_, __, variables) => {
      // Refetch to ensure server state consistency
      qc.invalidateQueries({ queryKey: ['folders'] })
      if (variables.type === 'document') {
        qc.invalidateQueries({ queryKey: ['documents'] })
      }
    },
  })
}
