/** OAuth2 authentication routes (Arctic v3 with PKCE) */

import { Hono } from 'hono'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import { generateState, generateCodeVerifier } from 'arctic'
import {
  createGoogleAuth,
  createGithubAuth,
  fetchGoogleProfile,
  fetchGithubProfile,
  findOrCreateUser,
  issueTokens,
  refreshAccessToken,
  revokeSession,
  updateUserProfile,
} from '../services/auth-service'
import { sendWelcomeEmail } from '../services/email-service'
import { verifyJwt } from '../utils/crypto'
import { logAudit } from '../utils/audit'
import { authGuard } from '../middleware/auth-guard'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { users } from '../db/schema'
import type { Env } from '../env'
import type { AuthContext } from '@agentwiki/shared'

type AuthEnv = { Bindings: Env; Variables: { auth: AuthContext } }

const auth = new Hono<AuthEnv>()

/** Cookie options — secure only in production (HTTPS) */
function getCookieOpts(c: { env: { APP_URL: string } }) {
  const isProduction = c.env.APP_URL.startsWith('https')
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'Lax' as const,
    path: '/',
  }
}

// --- Google OAuth ---

auth.get('/google', async (c) => {
  const google = createGoogleAuth(c.env)
  const state = generateState()
  const codeVerifier = generateCodeVerifier()
  const url = google.createAuthorizationURL(state, codeVerifier, ['openid', 'email', 'profile'])

  setCookie(c, 'oauth_state', state, { ...getCookieOpts(c), maxAge: 600 })
  setCookie(c, 'code_verifier', codeVerifier, { ...getCookieOpts(c), maxAge: 600 })
  return c.redirect(url.toString())
})

auth.get('/google/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, 'oauth_state')
  const codeVerifier = getCookie(c, 'code_verifier')

  if (!code || !state || state !== storedState || !codeVerifier) {
    return c.json({ error: 'Invalid OAuth state' }, 400)
  }
  deleteCookie(c, 'oauth_state')
  deleteCookie(c, 'code_verifier')

  try {
    const google = createGoogleAuth(c.env)
    const tokens = await google.validateAuthorizationCode(code, codeVerifier)
    const profile = await fetchGoogleProfile(tokens.accessToken())

    const { user, tenantId, role, isNewUser } = await findOrCreateUser(c.env, profile)
    if (!tenantId) return c.json({ error: 'No tenant found' }, 500)

    const { accessToken, refreshToken } = await issueTokens(c.env, user.id, tenantId, role)

    setCookie(c, 'access_token', accessToken, { ...getCookieOpts(c), maxAge: 900 })
    setCookie(c, 'refresh_token', refreshToken, { ...getCookieOpts(c), maxAge: 604800 })

    logAudit(c as never, 'auth.login', 'user', user.id, { provider: 'google' })

    // Send welcome email for new signups (non-blocking)
    if (isNewUser) {
      c.executionCtx.waitUntil(
        sendWelcomeEmail(c.env, user.email, user.name ?? 'there').catch((err) =>
          console.error('Welcome email failed:', err)
        )
      )
    }

    return c.redirect(c.env.APP_URL)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('Google OAuth error:', errMsg, err instanceof Error ? err.stack : '')
    return c.json({ error: 'Authentication failed', detail: errMsg }, 500)
  }
})

// --- GitHub OAuth ---

auth.get('/github', async (c) => {
  const github = createGithubAuth(c.env)
  const state = generateState()
  const url = github.createAuthorizationURL(state, ['user:email'])

  setCookie(c, 'oauth_state', state, { ...getCookieOpts(c), maxAge: 600 })
  return c.redirect(url.toString())
})

auth.get('/github/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, 'oauth_state')

  if (!code || !state || state !== storedState) {
    return c.json({ error: 'Invalid OAuth state' }, 400)
  }
  deleteCookie(c, 'oauth_state')

  try {
    const github = createGithubAuth(c.env)
    const tokens = await github.validateAuthorizationCode(code)
    const profile = await fetchGithubProfile(tokens.accessToken())

    const { user, tenantId, role, isNewUser } = await findOrCreateUser(c.env, profile)
    if (!tenantId) return c.json({ error: 'No tenant found' }, 500)

    const { accessToken, refreshToken } = await issueTokens(c.env, user.id, tenantId, role)

    setCookie(c, 'access_token', accessToken, { ...getCookieOpts(c), maxAge: 900 })
    setCookie(c, 'refresh_token', refreshToken, { ...getCookieOpts(c), maxAge: 604800 })

    logAudit(c as never, 'auth.login', 'user', user.id, { provider: 'github' })

    // Send welcome email for new signups (non-blocking)
    if (isNewUser) {
      c.executionCtx.waitUntil(
        sendWelcomeEmail(c.env, user.email, user.name ?? 'there').catch((err) =>
          console.error('Welcome email failed:', err)
        )
      )
    }

    return c.redirect(c.env.APP_URL)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    const errStack = err instanceof Error ? err.stack : undefined
    console.error('GitHub OAuth error:', errMsg, errStack)
    return c.json({ error: 'Authentication failed', detail: errMsg }, 500)
  }
})

// --- Token refresh ---

auth.post('/refresh', async (c) => {
  const refreshToken = getCookie(c, 'refresh_token')
  if (!refreshToken) return c.json({ error: 'No refresh token' }, 401)

  const newAccessToken = await refreshAccessToken(c.env, refreshToken)
  if (!newAccessToken) return c.json({ error: 'Invalid refresh token' }, 401)

  setCookie(c, 'access_token', newAccessToken, { ...getCookieOpts(c), maxAge: 900 })
  return c.json({ ok: true })
})

// --- Logout ---

auth.post('/logout', async (c) => {
  const refreshToken = getCookie(c, 'refresh_token')
  if (refreshToken) {
    await revokeSession(c.env, refreshToken)
  }

  deleteCookie(c, 'access_token', { path: '/' })
  deleteCookie(c, 'refresh_token', { path: '/' })

  logAudit(c as never, 'auth.logout', 'user', undefined)

  return c.json({ ok: true })
})

// --- Current user info ---

auth.get('/me', async (c) => {
  const token = getCookie(c, 'access_token') ?? c.req.header('Authorization')?.slice(7)
  if (!token) return c.json({ error: 'Not authenticated' }, 401)

  const payload = await verifyJwt(token, c.env.JWT_SECRET)
  if (!payload) return c.json({ error: 'Invalid token' }, 401)

  const db = drizzle(c.env.DB)
  const user = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1)
  if (!user.length) return c.json({ error: 'User not found' }, 404)

  return c.json({
    user: { id: user[0].id, email: user[0].email, name: user[0].name, avatarUrl: user[0].avatarUrl },
    tenantId: payload.tid,
    role: payload.role,
  })
})

// --- Update current user profile ---

auth.patch('/me', authGuard, async (c) => {
  const { userId } = c.get('auth')
  const body = await c.req.json() as { name?: string }
  const updated = await updateUserProfile(c.env, userId, body)
  if (!updated) return c.json({ error: 'User not found' }, 404)
  return c.json({ user: { id: updated.id, email: updated.email, name: updated.name, avatarUrl: updated.avatarUrl } })
})

export { auth as authRoutes }
