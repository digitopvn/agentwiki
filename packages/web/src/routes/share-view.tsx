/** Public share view — read-only document accessed via share token */

import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../lib/api-client'
import { PublicDocLayout } from '../components/shared/public-doc-layout'

interface SharedDoc {
  document: {
    id: string
    title: string
    content: string
    summary?: string
    category?: string
    createdAt: string
    updatedAt: string
  }
  shareLink: { expiresAt: string | null; accessLevel: string }
}

export function ShareView() {
  const { token } = useParams<{ token: string }>()

  const { data, isLoading, error } = useQuery<SharedDoc>({
    queryKey: ['share', token],
    queryFn: () => apiClient.get<SharedDoc>(`/api/share/public/${token}`),
    enabled: !!token,
  })

  return (
    <PublicDocLayout
      title={data?.document.title ?? ''}
      content={data?.document.content ?? ''}
      category={data?.document.category}
      label="Shared document"
      isLoading={isLoading}
      error={!!error || !data}
    />
  )
}
