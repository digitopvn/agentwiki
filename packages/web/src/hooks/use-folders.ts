/** TanStack Query hooks for folder CRUD */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/api-client'
import { useAppStore } from '../stores/app-store'
import type { Folder } from '@agentwiki/shared'

interface FolderTree extends Folder {
  children: FolderTree[]
}

export function useFolderTree() {
  return useQuery<{ folders: FolderTree[] }>({
    queryKey: ['folders'],
    queryFn: () => apiClient.get<{ folders: FolderTree[] }>('/api/folders'),
  })
}

export function useCreateFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; parentId?: string | null }) =>
      apiClient.post<Folder>('/api/folders', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folders'] })
    },
  })
}

export function useUpdateFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; parentId?: string | null }) =>
      apiClient.put<Folder>(`/api/folders/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folders'] })
    },
  })
}

export function useDeleteFolder() {
  const qc = useQueryClient()
  const setFolderExpanded = useAppStore((s) => s.setFolderExpanded)
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<{ ok: boolean }>(`/api/folders/${id}`),
    onSuccess: (_data, deletedId) => {
      // Prune deleted folder from persisted expanded state
      setFolderExpanded(deletedId, false)
      qc.invalidateQueries({ queryKey: ['folders'] })
      qc.invalidateQueries({ queryKey: ['documents'] })
    },
  })
}
