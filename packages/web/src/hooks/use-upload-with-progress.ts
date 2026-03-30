/** Upload hook with progress tracking via XMLHttpRequest — updates Zustand upload queue */

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { API_BASE } from '../lib/api-client'
import { useAppStore } from '../stores/app-store'

/** Try to refresh the access token via cookie-based refresh endpoint */
async function tryRefreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    return res.ok
  } catch {
    return false
  }
}

/** Send XHR upload with progress tracking. Returns status code. */
function sendXhr(
  url: string,
  formData: FormData,
  onProgress: (pct: number) => void,
): Promise<number> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    })

    xhr.addEventListener('load', () => resolve(xhr.status))
    xhr.addEventListener('error', () => resolve(0)) // 0 = network error

    xhr.open('POST', url)
    xhr.withCredentials = true
    xhr.send(formData)
  })
}

/** Returns an upload function that tracks progress in the global upload queue */
export function useUploadWithProgress() {
  const { addToUploadQueue, updateUploadProgress, updateUploadStatus, removeFromUploadQueue } = useAppStore()
  const queryClient = useQueryClient()

  return useCallback(async (file: File) => {
    const queueId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    addToUploadQueue([{ id: queueId, file }])
    updateUploadStatus(queueId, 'uploading')

    const formData = new FormData()
    formData.append('file', file)
    const url = `${API_BASE}/api/uploads`
    const onProgress = (pct: number) => updateUploadProgress(queueId, pct)

    let status = await sendXhr(url, formData, onProgress)

    // Auto-refresh token on 401 and retry once
    if (status === 401) {
      const refreshed = await tryRefreshToken()
      if (refreshed) {
        updateUploadProgress(queueId, 0)
        const retryFormData = new FormData()
        retryFormData.append('file', file)
        status = await sendXhr(url, retryFormData, onProgress)
      }
    }

    if (status >= 200 && status < 300) {
      updateUploadStatus(queueId, 'complete')
      queryClient.invalidateQueries({ queryKey: ['uploads'] })
      setTimeout(() => removeFromUploadQueue(queueId), 3000)
    } else if (status === 0) {
      updateUploadStatus(queueId, 'error', 'Network error')
    } else {
      updateUploadStatus(queueId, 'error', `Upload failed (${status})`)
    }
  }, [addToUploadQueue, updateUploadProgress, updateUploadStatus, removeFromUploadQueue, queryClient])
}
