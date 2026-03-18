import type { Role } from '../constants'

export interface User {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  provider: 'google' | 'github'
  providerId: string
  createdAt: Date
}

export interface Tenant {
  id: string
  name: string
  slug: string
  plan: string
  createdAt: Date
}

export interface TenantMembership {
  id: string
  tenantId: string
  userId: string
  role: Role
  joinedAt: Date
}

export interface Session {
  id: string
  userId: string
  tokenHash: string
  expiresAt: Date
  createdAt: Date
}

export interface ApiKey {
  id: string
  tenantId: string
  name: string
  keyPrefix: string
  scopes: string[]
  lastUsedAt: Date | null
  expiresAt: Date | null
  createdAt: Date
}

/** JWT payload claims */
export interface JwtPayload {
  sub: string // user_id
  tid: string // tenant_id
  role: Role
  exp: number
  iat: number
}

/** Auth context set by middleware */
export interface AuthContext {
  userId: string
  tenantId: string
  role: Role
  isApiKey: boolean
}
