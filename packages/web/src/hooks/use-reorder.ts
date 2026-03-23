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

interface FolderNode {
  id: string
  parentId?: string | null
  children?: FolderNode[]
}

/** Recursively reorder a folder within its sibling array in the tree */
function reorderFolderInTree(
  nodes: FolderNode[],
  folderId: string,
  afterId: string | undefined,
): FolderNode[] | null {
  // Try reordering at this level
  const idx = nodes.findIndex((f) => f.id === folderId)
  if (idx !== -1) {
    const items = [...nodes]
    const [moved] = items.splice(idx, 1)
    if (afterId) {
      const afterIdx = items.findIndex((f) => f.id === afterId)
      if (afterIdx === -1) return null
      items.splice(afterIdx + 1, 0, moved)
    } else {
      items.splice(0, 0, moved)
    }
    return items
  }
  // Recurse into children
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (node.children?.length) {
      const result = reorderFolderInTree(node.children, folderId, afterId)
      if (result) {
        const updated = [...nodes]
        updated[i] = { ...node, children: result }
        return updated
      }
    }
  }
  return null
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
            if (variables.afterId) {
              const afterIdx = items.findIndex((d) => d.id === variables.afterId)
              if (afterIdx === -1) return old // afterId not in this cache slice
              items.splice(afterIdx + 1, 0, moved)
            } else {
              items.splice(0, 0, moved)
            }
            return { ...old, data: items }
          },
        )
      } else {
        // Optimistic reorder for folders (supports nested subfolders)
        qc.setQueryData<{ folders: FolderNode[] }>(['folders'], (old) => {
          if (!old?.folders) return old as { folders: FolderNode[] }
          const result = reorderFolderInTree(old.folders, variables.id, variables.afterId)
          if (!result) return old
          return { ...old, folders: result }
        })
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
      if (variables.type === 'folder') {
        qc.invalidateQueries({ queryKey: ['folders'] })
      } else {
        qc.invalidateQueries({ queryKey: ['documents'] })
      }
    },
  })
}
