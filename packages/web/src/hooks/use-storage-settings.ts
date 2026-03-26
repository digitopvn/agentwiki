/** Hooks for storage configuration CRUD — custom R2 credentials */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/api-client'

export interface StorageConfig {
  id: string
  accountId: string
  bucketName: string
  endpointUrl: string | null
  isVerified: boolean
  hasAccessKey: boolean
  hasSecretKey: boolean
}

export function useStorageConfig() {
  return useQuery<{ config: StorageConfig | null }>({
    queryKey: ['storage-settings'],
    queryFn: () => apiClient.get('/api/storage/settings'),
  })
}

export function useUpdateStorageConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { accountId: string; accessKey: string; secretKey: string; bucketName: string }) =>
      apiClient.put('/api/storage/settings', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['storage-settings'] }),
  })
}

export function useDeleteStorageConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.delete('/api/storage/settings'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['storage-settings'] }),
  })
}

export function useTestStorageConnection() {
  return useMutation<{ success: boolean; error?: string }>({
    mutationFn: () => apiClient.post('/api/storage/test'),
  })
}
