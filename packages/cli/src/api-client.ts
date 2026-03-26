/** CLI API client — wraps all AgentWiki API endpoints */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const CONFIG_DIR = join(homedir(), '.agentwiki')
const CREDENTIALS_FILE = join(CONFIG_DIR, 'credentials.json')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

interface Credentials {
  apiKey?: string
  accessToken?: string
  refreshToken?: string
  apiUrl: string
}

/** Get stored credentials */
export function getCredentials(): Credentials {
  if (!existsSync(CREDENTIALS_FILE)) {
    return { apiUrl: 'https://api.agentwiki.cc' }
  }
  return JSON.parse(readFileSync(CREDENTIALS_FILE, 'utf-8'))
}

/** Save credentials */
export function saveCredentials(creds: Partial<Credentials>) {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
  const existing = getCredentials()
  writeFileSync(CREDENTIALS_FILE, JSON.stringify({ ...existing, ...creds }, null, 2))
}

/** Make authenticated API request */
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const creds = getCredentials()
  const url = `${creds.apiUrl}/api${path}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }

  if (creds.apiKey) {
    headers['Authorization'] = `Bearer ${creds.apiKey}`
  } else if (creds.accessToken) {
    headers['Authorization'] = `Bearer ${creds.accessToken}`
  }

  const res = await fetch(url, { ...options, headers })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API error ${res.status}: ${body}`)
  }

  return res.json() as Promise<T>
}

/** Upload file via multipart form data */
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const creds = getCredentials()
  const url = `${creds.apiUrl}/api${path}`

  const headers: Record<string, string> = {}
  if (creds.apiKey) headers['Authorization'] = `Bearer ${creds.apiKey}`
  else if (creds.accessToken) headers['Authorization'] = `Bearer ${creds.accessToken}`

  const res = await fetch(url, { method: 'POST', headers, body: formData })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Upload error ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

/** Stream SSE events from an endpoint, calling handler for each event */
export async function streamSSE(
  path: string,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
  const creds = getCredentials()
  const url = `${creds.apiUrl}/api${path}`

  const headers: Record<string, string> = {}
  if (creds.apiKey) headers['Authorization'] = `Bearer ${creds.apiKey}`
  else if (creds.accessToken) headers['Authorization'] = `Bearer ${creds.accessToken}`

  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`SSE error ${res.status}`)
  if (!res.body) return

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6))
          onEvent(event)
          if (event.type === 'complete' || event.type === 'error') return
        } catch { /* malformed JSON — skip */ }
      }
    }
  }
}
