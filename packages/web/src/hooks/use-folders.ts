/** TanStack Query hooks for folder CRUD */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/api-client'
import type { Folder } from '@agentwiki/shared'

export interface FolderTree extends Folder {
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
    mutationFn: ({ id, ...body }: { id: string; name?: string; parentId?: string | null; position?: number }) =>
      apiClient.put<Folder>(`/api/folders/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folders'] })
    },
  })
}

export function useDeleteFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<{ ok: boolean }>(`/api/folders/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folders'] })
      qc.invalidateQueries({ queryKey: ['documents'] })
    },
  })
}
