/** TanStack Query hooks for file upload CRUD */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, API_BASE } from '../lib/api-client'

export interface Upload {
  id: string
  tenantId: string
  documentId: string | null
  fileKey: string
  filename: string
  contentType: string
  sizeBytes: number
  uploadedBy: string
  extractionStatus: string | null // pending | processing | completed | failed | unsupported
  summary: string | null
  createdAt: string
}

export function useUploads() {
  return useQuery<{ files: Upload[] }>({
    queryKey: ['uploads'],
    queryFn: () => apiClient.get<{ files: Upload[] }>('/api/uploads'),
  })
}

export function useUploadFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${API_BASE}/api/uploads`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Upload failed')
      return res.json() as Promise<{ id: string; fileKey: string; filename: string }>
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['uploads'] }),
  })
}

export function useDeleteUpload() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<{ ok: boolean }>(`/api/uploads/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['uploads'] }),
  })
}
