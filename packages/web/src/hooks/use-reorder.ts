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

      // Write optimistic reorder to cache so UI updates immediately
      if (variables.type === 'document') {
        qc.setQueriesData<{ data: Array<{ id: string; position?: string }> }>(
          { queryKey: ['documents'] },
          (old) => {
            if (!old?.data) return old as { data: Array<{ id: string; position?: string }> }
            const items = [...old.data]
            const idx = items.findIndex((d) => d.id === variables.id)
            if (idx === -1) return old
            const [moved] = items.splice(idx, 1)
            // Place after afterId or at start
            if (variables.afterId) {
              const afterIdx = items.findIndex((d) => d.id === variables.afterId)
              items.splice(afterIdx + 1, 0, moved)
            } else {
              items.splice(0, 0, moved)
            }
            return { ...old, data: items }
          },
        )
      }

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
