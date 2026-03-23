/** Authentication service — OAuth exchange, token management */

import { Google, GitHub } from 'arctic'
import { eq, and } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { users, sessions, tenants, tenantMemberships } from '../db/schema'
import { signJwt, hashToken, generateRandomToken, generateId } from '../utils/crypto'
import { TOKEN_TTL } from '@agentwiki/shared'
import type { Env } from '../env'
import type { JwtPayload, Role } from '@agentwiki/shared'

/**
 * OAuth callback URLs: use API_URL in dev (direct to Workers on 8787),
 * fall back to APP_URL in prod (same domain).
 */
function getCallbackBase(env: Env): string {
  return env.API_URL ?? env.APP_URL
}

export function createGoogleAuth(env: Env) {
  return new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, `${getCallbackBase(env)}/api/auth/google/callback`)
}

export function createGithubAuth(env: Env) {
  return new GitHub(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET, `${getCallbackBase(env)}/api/auth/github/callback`)
}

interface OAuthProfile {
  email: string
  name: string
  avatarUrl: string | null
  provider: 'google' | 'github'
  providerId: string
}

/** Fetch Google user profile from access token */
export async function fetchGoogleProfile(accessToken: string): Promise<OAuthProfile> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch Google profile')
  const data = (await res.json()) as { id: string; email: string; name: string; picture?: string }
  return {
    email: data.email,
    name: data.name,
    avatarUrl: data.picture ?? null,
    provider: 'google',
    providerId: data.id,
  }
}

/** Fetch GitHub user profile from access token */
export async function fetchGithubProfile(accessToken: string): Promise<OAuthProfile> {
  const [userRes, emailRes] = await Promise.all([
    fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'AgentWiki' },
    }),
    fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'AgentWiki' },
    }),
  ])
  if (!userRes.ok) throw new Error('Failed to fetch GitHub profile')

  const userData = (await userRes.json()) as { id: number; login: string; name?: string; avatar_url?: string; email?: string }

  // Emails endpoint may fail if scope not granted — fallback to profile email
  let primaryEmail = userData.email ?? `${userData.login}@users.noreply.github.com`
  if (emailRes.ok) {
    const emails = await emailRes.json()
    if (Array.isArray(emails)) {
      const found = emails.find((e: { email: string; primary: boolean }) => e.primary)
      if (found) primaryEmail = found.email
    }
  }

  return {
    email: primaryEmail,
    name: userData.name ?? userData.login,
    avatarUrl: userData.avatar_url ?? null,
    provider: 'github',
    providerId: String(userData.id),
  }
}

/** Find or create user + auto-provision tenant on first login */
export async function findOrCreateUser(env: Env, profile: OAuthProfile) {
  const db = drizzle(env.DB)
  const now = new Date()

  // Check existing user by email
  const existing = await db.select().from(users).where(eq(users.email, profile.email)).limit(1)

  if (existing.length > 0) {
    const user = existing[0]
    // Get tenant membership
    const membership = await db
      .select()
      .from(tenantMemberships)
      .where(eq(tenantMemberships.userId, user.id))
      .limit(1)
    return { user, tenantId: membership[0]?.tenantId, role: (membership[0]?.role ?? 'viewer') as Role, isNewUser: false }
  }

  // Create new user + tenant
  const userId = generateId()
  const tenantId = generateId()
  const membershipId = generateId()
  const tenantSlug = profile.email.split('@')[0].replace(/[^a-z0-9-]/g, '-')

  await db.batch([
    db.insert(tenants).values({
      id: tenantId,
      name: `${profile.name}'s Workspace`,
      slug: tenantSlug,
      createdAt: now,
    }),
    db.insert(users).values({
      id: userId,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      provider: profile.provider,
      providerId: profile.providerId,
      createdAt: now,
    }),
    db.insert(tenantMemberships).values({
      id: membershipId,
      tenantId,
      userId,
      role: 'admin',
      joinedAt: now,
    }),
  ])

  return {
    user: { id: userId, email: profile.email, name: profile.name, avatarUrl: profile.avatarUrl },
    tenantId,
    role: 'admin' as Role,
    isNewUser: true,
  }
}

/** Issue access + refresh token pair */
export async function issueTokens(env: Env, userId: string, tenantId: string, role: Role) {
  const db = drizzle(env.DB)
  const now = Date.now()

  // Access token (JWT)
  const payload: JwtPayload = {
    sub: userId,
    tid: tenantId,
    role,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + TOKEN_TTL.accessToken) / 1000),
  }
  const accessToken = await signJwt(payload, env.JWT_SECRET)

  // Refresh token (opaque, stored in D1)
  const refreshToken = generateRandomToken(64)
  const tokenHash = await hashToken(refreshToken)
  await db.insert(sessions).values({
    id: generateId(),
    userId,
    tokenHash,
    expiresAt: new Date(now + TOKEN_TTL.refreshToken),
    createdAt: new Date(now),
  })

  return { accessToken, refreshToken }
}

/** Refresh access token using refresh token */
export async function refreshAccessToken(env: Env, refreshToken: string) {
  const db = drizzle(env.DB)
  const tokenHash = await hashToken(refreshToken)

  const session = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1)

  if (!session.length || session[0].expiresAt < new Date()) {
    return null
  }

  const userId = session[0].userId
  const membership = await db
    .select()
    .from(tenantMemberships)
    .where(eq(tenantMemberships.userId, userId))
    .limit(1)

  if (!membership.length) return null

  // Issue new access token (keep same refresh token)
  const now = Date.now()
  const payload: JwtPayload = {
    sub: userId,
    tid: membership[0].tenantId,
    role: membership[0].role as Role,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + TOKEN_TTL.accessToken) / 1000),
  }

  return signJwt(payload, env.JWT_SECRET)
}

/** Revoke a session by refresh token */
export async function revokeSession(env: Env, refreshToken: string) {
  const db = drizzle(env.DB)
  const tokenHash = await hashToken(refreshToken)
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash))
}

/** Update mutable user profile fields */
export async function updateUserProfile(env: Env, userId: string, input: { name?: string }) {
  const db = drizzle(env.DB)
  if (input.name) {
    await db.update(users).set({ name: input.name }).where(eq(users.id, userId))
  }
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  return result[0] ?? null
}
