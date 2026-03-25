/** RBAC permission definitions */
export const ROLES = ['admin', 'editor', 'viewer', 'agent'] as const
export type Role = (typeof ROLES)[number]

export const PERMISSIONS: Record<Role, string[]> = {
  admin: ['tenant:manage', 'user:manage', 'doc:*', 'key:*', 'audit:read'],
  editor: ['doc:create', 'doc:read', 'doc:update', 'doc:delete', 'doc:share'],
  viewer: ['doc:read'],
  agent: ['doc:read', 'doc:search'],
}

/** Rate limit configs */
export const RATE_LIMITS = {
  api: { limit: 100, windowSec: 60 },
  search: { limit: 50, windowSec: 60 },
  searchExpand: { limit: 10, windowSec: 60 }, // stricter limit when expand=true (AI cost surface)
  suggest: { limit: 100, windowSec: 60 },
  web: { limit: 1000, windowSec: 60 },
} as const

/** Access levels for documents */
export const ACCESS_LEVELS = ['private', 'specific', 'public'] as const
export type AccessLevel = (typeof ACCESS_LEVELS)[number]

/** Auth token TTLs */
export const TOKEN_TTL = {
  accessToken: 60 * 60 * 1000, // 1 hour
  refreshToken: 30 * 24 * 60 * 60 * 1000, // 30 days
  shareLink: 90 * 24 * 60 * 60 * 1000, // 90 days
} as const

/** API key prefix */
export const API_KEY_PREFIX = 'aw_'

/** Supported AI providers with available models */
export const AI_PROVIDERS = {
  openai: { name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  anthropic: { name: 'Anthropic', models: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'] },
  google: { name: 'Google Gemini', models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro'] },
  openrouter: { name: 'OpenRouter', models: ['auto'] },
  minimax: { name: 'MiniMax', models: ['MiniMax-M1', 'MiniMax-T1'] },
  alibaba: { name: 'Alibaba', models: ['qwen-turbo', 'qwen-plus', 'qwen-max'] },
} as const

/** AI rate limit: requests per user per minute */
export const AI_RATE_LIMIT = { maxRequests: 15, intervalMs: 60_000 } as const
