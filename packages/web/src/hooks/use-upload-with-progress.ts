/** Upload hook with progress tracking via XMLHttpRequest — updates Zustand upload queue */

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { API_BASE } from '../lib/api-client'
import { useAppStore } from '../stores/app-store'

/** Returns an upload function that tracks progress in the global upload queue */
export function useUploadWithProgress() {
  const { addToUploadQueue, updateUploadProgress, updateUploadStatus, removeFromUploadQueue } = useAppStore()
  const queryClient = useQueryClient()

  return useCallback(async (file: File) => {
    // Add to queue
    const queueId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    useAppStore.setState((s) => ({
      uploadQueue: [...s.uploadQueue, { id: queueId, file, progress: 0, status: 'uploading' as const }],
    }))

    return new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest()
      const formData = new FormData()
      formData.append('file', file)

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100)
          updateUploadProgress(queueId, pct)
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          updateUploadStatus(queueId, 'complete')
          queryClient.invalidateQueries({ queryKey: ['uploads'] })
          // Auto-remove from queue after 3s
          setTimeout(() => removeFromUploadQueue(queueId), 3000)
        } else {
          updateUploadStatus(queueId, 'error', `Upload failed (${xhr.status})`)
        }
        resolve()
      })

      xhr.addEventListener('error', () => {
        updateUploadStatus(queueId, 'error', 'Network error')
        resolve()
      })

      xhr.open('POST', `${API_BASE}/api/uploads`)
      xhr.withCredentials = true
      xhr.send(formData)
    })
  }, [updateUploadProgress, updateUploadStatus, removeFromUploadQueue, queryClient])
}
