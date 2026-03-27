/** Public published document view — accessed via /pub/:slug */

import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../lib/api-client'
import { PublicDocLayout } from '../components/shared/public-doc-layout'

interface PublishedDoc {
  document: {
    id: string
    title: string
    content: string
    summary?: string
    category?: string
    createdAt: string
    updatedAt: string
  }
}

export function PublishedView() {
  const { slug } = useParams<{ slug: string }>()

  const { data, isLoading, error } = useQuery<PublishedDoc>({
    queryKey: ['published', slug],
    queryFn: () => apiClient.get<PublishedDoc>(`/api/share/published/${slug}`),
    enabled: !!slug,
  })

  return (
    <PublicDocLayout
      title={data?.document.title ?? ''}
      content={data?.document.content ?? ''}
      category={data?.document.category}
      label="Published document"
      isLoading={isLoading}
      error={!!error || !data}
    />
  )
}
