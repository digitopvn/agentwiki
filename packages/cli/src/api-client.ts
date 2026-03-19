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
    return { apiUrl: 'https://app.agentwiki.cc' }
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
