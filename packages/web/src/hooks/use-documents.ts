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
  sort?: string
  order?: string
  enabled?: boolean
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
  const { enabled, ...queryParams } = params
  const search = new URLSearchParams()
  if (queryParams.folderId) search.set('folderId', queryParams.folderId)
  if (queryParams.search) search.set('search', queryParams.search)
  if (queryParams.tag) search.set('tag', queryParams.tag)
  if (queryParams.category) search.set('category', queryParams.category)
  if (queryParams.page) search.set('page', String(queryParams.page))
  if (queryParams.limit) search.set('limit', String(queryParams.limit))
  if (queryParams.sort) search.set('sort', queryParams.sort)
  if (queryParams.order) search.set('order', queryParams.order)

  return useQuery<PaginatedDocuments>({
    queryKey: ['documents', queryParams],
    queryFn: () => apiClient.get<PaginatedDocuments>(`/api/documents?${search}`),
    enabled: enabled ?? true,
  })
}

export function useDocument(id: string | null) {
  return useQuery<Document>({
    queryKey: ['documents', id],
    queryFn: () => apiClient.get<Document>(`/api/documents/${id}`),
    enabled: !!id,
  })
}

export function useDocumentBySlug(slug: string | undefined) {
  return useQuery<Document>({
    queryKey: ['documents', 'by-slug', slug],
    queryFn: () => apiClient.get<Document>(`/api/documents/by-slug/${slug}`),
    enabled: !!slug,
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
    onSuccess: (doc) => {
      // Cache the newly created document so subsequent useDocument(id) hits cache
      // instead of firing a GET that may 404 due to D1 eventual consistency
      qc.setQueryData(['documents', doc.id], doc)
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
