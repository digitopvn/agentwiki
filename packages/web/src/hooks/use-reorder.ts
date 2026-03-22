/** Reorder mutation hook for drag-and-drop position updates */

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
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['folders'] })
      if (variables.type === 'document') {
        qc.invalidateQueries({ queryKey: ['documents'] })
      }
    },
  })
}
