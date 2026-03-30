/** TanStack Query hooks for storage folders and uploads */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/api-client'
import type { StorageFolderTree, Upload } from '@agentwiki/shared'

// ── Folder queries ──

export function useStorageFolderTree() {
  return useQuery<{ folders: StorageFolderTree[] }>({
    queryKey: ['storage-folders'],
    queryFn: () => apiClient.get('/api/storage-folders'),
  })
}

export function useCreateStorageFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; parentId?: string | null }) =>
      apiClient.post('/api/storage-folders', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['storage-folders'] })
    },
  })
}

export function useUpdateStorageFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; parentId?: string | null; position?: number }) =>
      apiClient.put(`/api/storage-folders/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['storage-folders'] })
    },
  })
}

export function useDeleteStorageFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/storage-folders/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['storage-folders'] })
      qc.invalidateQueries({ queryKey: ['storage-files'] })
    },
  })
}

// ── File queries ──

export function useStorageFiles(folderId: string | null) {
  const param = folderId === null ? 'root' : folderId
  return useQuery<{ files: Upload[] }>({
    queryKey: ['storage-files', folderId],
    queryFn: () => apiClient.get(`/api/uploads?folderId=${param}`),
  })
}

export function useUploadFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, folderId }: { file: File; folderId?: string | null }) => {
      const formData = new FormData()
      formData.append('file', file)
      if (folderId) formData.append('folderId', folderId)

      // Use fetch directly for multipart (apiClient sets JSON content-type)
      const res = await fetch('/api/uploads', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Upload failed')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['storage-files'] })
    },
  })
}

export function useDeleteUpload() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/uploads/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['storage-files'] })
    },
  })
}

export function useMoveUpload() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      apiClient.put(`/api/uploads/${id}/move`, { folderId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['storage-files'] })
    },
  })
}

// ── Bulk actions ──

export function useBulkMove() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { fileIds: string[]; folderIds: string[]; targetFolderId: string | null }) =>
      apiClient.post('/api/storage/bulk/move', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['storage-files'] })
      qc.invalidateQueries({ queryKey: ['storage-folders'] })
    },
  })
}

export function useBulkDelete() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { fileIds: string[]; folderIds: string[] }) =>
      apiClient.post('/api/storage/bulk/delete', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['storage-files'] })
      qc.invalidateQueries({ queryKey: ['storage-folders'] })
    },
  })
}
