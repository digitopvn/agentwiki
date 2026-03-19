/** TanStack Query hooks for share link CRUD */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/api-client'

interface ShareLink {
  id: string
  token: string
  accessLevel: string
  expiresAt: string | null
  createdAt: string
}

interface CreateShareLinkResponse {
  id: string
  token: string
  url: string
}

export function useShareLinks(documentId: string | null) {
  return useQuery<{ links: ShareLink[] }>({
    queryKey: ['share-links', documentId],
    queryFn: () => apiClient.get<{ links: ShareLink[] }>(`/api/share/links/${documentId}`),
    enabled: !!documentId,
  })
}

export function useCreateShareLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { documentId: string; expiresInDays?: number }) =>
      apiClient.post<CreateShareLinkResponse>('/api/share/links', body),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['share-links', variables.documentId] })
    },
  })
}

export function useDeleteShareLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { id: string; documentId: string }) =>
      apiClient.delete<{ ok: boolean }>(`/api/share/links/${params.id}`),
    onSuccess: (_, params) => {
      qc.invalidateQueries({ queryKey: ['share-links', params.documentId] })
    },
  })
}
