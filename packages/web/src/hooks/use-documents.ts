/** TanStack Query hooks for document CRUD */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/api-client'
import type { Document, DocumentVersion } from '@agentwiki/shared'

interface ListDocumentsParams {
  folderId?: string
  search?: string
  tag?: string
  category?: string
  page?: number
  limit?: number
}

interface PaginatedDocuments {
  data: Document[]
  total: number
  page: number
  limit: number
}

interface CreateDocumentBody {
  title: string
  folderId?: string | null
  category?: string | null
  accessLevel?: string
  content?: string
  contentJson?: unknown
}

interface UpdateDocumentBody {
  title?: string
  folderId?: string | null
  category?: string | null
  accessLevel?: string
  content?: string
  contentJson?: unknown
  summary?: string | null
}

export function useDocuments(params: ListDocumentsParams = {}) {
  const search = new URLSearchParams()
  if (params.folderId) search.set('folderId', params.folderId)
  if (params.search) search.set('search', params.search)
  if (params.tag) search.set('tag', params.tag)
  if (params.category) search.set('category', params.category)
  if (params.page) search.set('page', String(params.page))
  if (params.limit) search.set('limit', String(params.limit))

  return useQuery<PaginatedDocuments>({
    queryKey: ['documents', params],
    queryFn: () => apiClient.get<PaginatedDocuments>(`/api/documents?${search}`),
  })
}

export function useDocument(id: string | null) {
  return useQuery<Document>({
    queryKey: ['documents', id],
    queryFn: () => apiClient.get<Document>(`/api/documents/${id}`),
    enabled: !!id,
  })
}

export function useDocumentVersions(id: string | null) {
  return useQuery<{ versions: DocumentVersion[] }>({
    queryKey: ['documents', id, 'versions'],
    queryFn: () => apiClient.get<{ versions: DocumentVersion[] }>(`/api/documents/${id}/versions`),
    enabled: !!id,
  })
}

export function useCreateDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateDocumentBody) => apiClient.post<Document>('/api/documents', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
    },
  })
}

export function useUpdateDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateDocumentBody & { id: string }) =>
      apiClient.put<Document>(`/api/documents/${id}`, body),
    onSuccess: (doc) => {
      qc.setQueryData(['documents', doc.id], doc)
      qc.invalidateQueries({ queryKey: ['documents'] })
    },
  })
}

export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<{ ok: boolean }>(`/api/documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
    },
  })
}
