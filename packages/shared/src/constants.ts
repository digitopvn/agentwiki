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
  suggest: { limit: 100, windowSec: 60 },
  web: { limit: 1000, windowSec: 60 },
} as const

/** Access levels for documents */
export const ACCESS_LEVELS = ['private', 'specific', 'public'] as const
export type AccessLevel = (typeof ACCESS_LEVELS)[number]

/** Auth token TTLs */
export const TOKEN_TTL = {
  accessToken: 15 * 60 * 1000, // 15 minutes
  refreshToken: 7 * 24 * 60 * 60 * 1000, // 7 days
  shareLink: 90 * 24 * 60 * 60 * 1000, // 90 days
} as const

/** API key prefix */
export const API_KEY_PREFIX = 'aw_'
