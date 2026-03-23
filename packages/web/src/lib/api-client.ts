/** API client with credentials support, error handling, and auto-refresh */

/** API base URL — empty in dev (Vite proxy), absolute in production */
export const API_BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Serialize a single refresh attempt so concurrent 401s don't fire multiple refreshes */
let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  refreshPromise = fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshPromise = null
    })
  return refreshPromise
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const doFetch = () =>
    fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })

  let res = await doFetch()

  // Auto-refresh on 401 (skip for auth endpoints to avoid infinite loops)
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      res = await doFetch()
    }
  }

  if (!res.ok) {
    let data: unknown
    try {
      data = await res.json()
    } catch {
      data = null
    }
    const message =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as Record<string, unknown>).error)
        : res.statusText
    throw new ApiError(res.status, message, data)
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
