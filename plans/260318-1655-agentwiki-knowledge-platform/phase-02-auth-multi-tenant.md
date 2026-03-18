---
title: "Phase 2: Authentication & Multi-Tenant System"
status: pending
priority: P1
effort: 24h
---

# Phase 2: Authentication & Multi-Tenant System

## Context Links
- [Cloudflare Ecosystem Research — KV & Auth](../reports/researcher-01-260318-1655-cloudflare-ecosystem.md)
- [Architecture — Multi-Tenant & Security](../reports/researcher-02-260318-1655-knowledge-platform-architecture.md)
- [Phase 1](./phase-01-project-setup.md)

## Overview
<!-- Updated: Validation Session 1 - Use Arctic library for OAuth providers -->
OAuth2 SSO via **Arctic** library (Google + GitHub), custom JWT token management, multi-tenant isolation, RBAC, API key system, rate limiting. Domain: agentwiki.cc.

## Key Insights
- **Arctic** library for OAuth provider integration (lightweight, Workers-compatible) — custom JWT/session logic on top
- Short-lived access tokens (15min) + long-lived refresh tokens (7d) in D1
- KV for session cache (read-heavy) but D1 for auth-critical validation
- Database-per-tenant sharding for D1 — but start with shared DB + tenant_id filtering for MVP, migrate to per-tenant DBs when approaching 10GB
- API keys hashed with Web Crypto (PBKDF2 or SHA-256 with salt) — Argon2 not available in Workers runtime
- Rate limiting via KV counters with sliding window

## Requirements

### Functional
- OAuth2 login via Google and GitHub
- JWT access token (15min) + refresh token (7d)
- Tenant creation on first login (auto-provision)
- Invite users to tenant via email
- RBAC: Admin, Editor, Viewer, Agent roles
- API key CRUD: create, list, rotate, revoke, scope to collections
- Rate limiting per user/key
- Audit log for all auth events

### Non-Functional
- Token refresh < 50ms (KV cached)
- Auth middleware < 5ms overhead per request
- API key lookup < 10ms (KV cached hash)

## Architecture

### OAuth2 Flow
```
Browser                  Workers API              Google/GitHub
  │                         │                         │
  ├─ GET /auth/google ─────►│                         │
  │                         ├─ redirect ─────────────►│
  │                         │                         │
  │◄────────── redirect ────┤◄── callback + code ─────┤
  │  /auth/google/callback  │                         │
  │                         ├─ POST token exchange ──►│
  │                         │◄── access_token ────────┤
  │                         │                         │
  │                         ├─ Fetch user profile     │
  │                         ├─ Find/create user in D1 │
  │                         ├─ Issue JWT + refresh     │
  │◄── Set-Cookie (tokens) ─┤                         │
```

### Middleware Chain
```
Request → CORS → Rate Limiter → Auth Guard → Tenant Resolver → Route Handler
                                    │              │
                                    ▼              ▼
                              Verify JWT      Set tenant context
                              or API key      from token claims
```

### Token Storage
```
Access Token (JWT):
  - Payload: { sub: user_id, tid: tenant_id, role, exp, iat }
  - Signed with HMAC-SHA256 (JWT_SECRET)
  - Stored: httpOnly cookie + KV cache (key: token_hash → user data)

Refresh Token:
  - Opaque 64-char random string
  - Stored: D1 sessions table (token_hash, user_id, expires_at)
  - httpOnly, secure, sameSite strict cookie
```

## Related Code Files

### Files to Create
- `packages/api/src/middleware/auth-guard.ts` — JWT verification, cookie parsing
- `packages/api/src/middleware/tenant-resolver.ts` — extract tenant from JWT, set context
- `packages/api/src/middleware/rate-limiter.ts` — KV-based sliding window
- `packages/api/src/middleware/cors.ts` — CORS configuration
- `packages/api/src/routes/auth.ts` — /auth/google, /auth/github, /auth/callback, /auth/refresh, /auth/logout
- `packages/api/src/routes/tenants.ts` — tenant CRUD
- `packages/api/src/routes/users.ts` — user management within tenant
- `packages/api/src/routes/api-keys.ts` — API key CRUD
- `packages/api/src/services/auth-service.ts` — OAuth exchange, JWT sign/verify, token rotation
- `packages/api/src/services/tenant-service.ts` — tenant provisioning, isolation logic
- `packages/api/src/services/api-key-service.ts` — key generation, hashing, validation
- `packages/api/src/utils/crypto.ts` — JWT helpers, hash functions, random token generation
- `packages/shared/src/types/auth.ts` — auth-related types
- `packages/shared/src/schemas/auth.ts` — Zod schemas for auth requests/responses

### Files to Modify
- `packages/api/src/index.ts` — register auth routes + middleware
- `packages/api/src/db/schema.ts` — add tenant_memberships table
- `packages/api/src/env.ts` — add OAuth client ID/secret bindings

## Implementation Steps

### 1. Crypto Utilities (2h)
1. `utils/crypto.ts`:
   - `signJWT(payload, secret)` — HMAC-SHA256 via Web Crypto API
   - `verifyJWT(token, secret)` — decode + verify signature + check exp
   - `hashToken(token)` — SHA-256 hash for storing refresh tokens / API keys
   - `generateRandomToken(length)` — crypto.getRandomValues for opaque tokens
   - `hashApiKey(key, salt)` — PBKDF2 with unique salt per key

### 2. OAuth2 SSO Routes (4h)
1. `routes/auth.ts`:
   - `GET /auth/google` — redirect to Google OAuth consent screen
     - Params: client_id, redirect_uri, scope (email, profile), state (CSRF token)
   - `GET /auth/github` — redirect to GitHub OAuth
   - `GET /auth/google/callback` — exchange code for tokens:
     ```typescript
     // 1. Verify state (CSRF)
     // 2. Exchange code → Google access token
     // 3. Fetch user profile (email, name, avatar)
     // 4. Find or create user in D1
     // 5. Auto-provision tenant if first login
     // 6. Issue JWT access + refresh tokens
     // 7. Set httpOnly cookies, redirect to app
     ```
   - `GET /auth/github/callback` — same flow for GitHub
   - `POST /auth/refresh` — validate refresh token, issue new access token
   - `POST /auth/logout` — invalidate refresh token in D1, clear cookies

### 3. Auth Service (3h)
1. `services/auth-service.ts`:
   - `exchangeGoogleCode(code)` → Google access token → user profile
   - `exchangeGithubCode(code)` → GitHub access token → user profile
   - `findOrCreateUser(provider, profile, tenantId?)` → user record
   - `issueTokens(user)` → { accessToken, refreshToken }
   - `refreshAccessToken(refreshToken)` → new accessToken
   - `revokeSession(refreshTokenHash)` → delete from D1

### 4. Auth Middleware (3h)
1. `middleware/auth-guard.ts`:
   ```typescript
   // 1. Check Authorization header (Bearer token) OR cookie
   // 2. If API key format (prefix "aw_"), validate via api-key-service
   // 3. If JWT, verify signature + expiry
   // 4. Attach user context to Hono context: c.set('user', { id, tenantId, role })
   // 5. Return 401 if invalid
   ```
2. `middleware/tenant-resolver.ts`:
   - Extract tenant_id from JWT claims
   - Validate tenant exists + is active
   - Set tenant context for downstream handlers

### 5. Tenant System (3h)
1. `services/tenant-service.ts`:
   - `createTenant(name, ownerUserId)` — create tenant + assign owner as Admin
   - `inviteUser(tenantId, email, role)` — create invite token, store pending invite
   - `acceptInvite(token)` — add user to tenant with specified role
   - `listMembers(tenantId)` — list all tenant members
   - `updateMemberRole(tenantId, userId, role)` — Admin only
   - `removeMember(tenantId, userId)` — Admin only (cannot remove last admin)
2. Schema addition — `tenant_memberships`:
   ```
   tenant_memberships: id, tenant_id, user_id, role (admin|editor|viewer|agent), invited_by, joined_at
   ```

### 6. RBAC Permission System (3h)
1. Define permission matrix in `packages/shared/src/constants.ts`:
   ```typescript
   export const PERMISSIONS = {
     admin:  ['tenant:manage', 'user:manage', 'doc:*', 'key:*', 'audit:read'],
     editor: ['doc:create', 'doc:read', 'doc:update', 'doc:delete', 'doc:share'],
     viewer: ['doc:read'],
     agent:  ['doc:read', 'doc:search'],  // expandable via API key scopes
   }
   ```
2. Middleware helper: `requirePermission(permission)` — checks role-based access
3. Route-level guards: apply per-endpoint

### 7. API Key System (3h)
1. `services/api-key-service.ts`:
   - `createApiKey(tenantId, name, scopes, expiresAt)`:
     - Generate key: `aw_` + 48 random chars
     - Hash with PBKDF2 + unique salt
     - Store: key_prefix (first 8 chars for identification), key_hash, salt, scopes, tenant_id
     - Return plaintext key (shown once only)
   - `validateApiKey(key)` → extract prefix, find in DB, verify hash, return scopes
   - `rotateApiKey(keyId)` → generate new key, update hash, return new plaintext
   - `revokeApiKey(keyId)` → soft-delete (set revoked_at)
   - `listApiKeys(tenantId)` → list with prefix, name, scopes, last_used (no hashes)
2. KV cache for hot keys: `apikey:{prefix}` → `{ tenantId, scopes, userId }`

### 8. Rate Limiter (2h)
1. `middleware/rate-limiter.ts` — sliding window via KV:
   ```typescript
   // Key: ratelimit:{identifier}:{window}
   // Value: request count
   // TTL: window duration
   // Limits: 100 req/min (API), 50 search/min, 1000 req/min (web)
   async function rateLimit(c, identifier, limit, windowSec) {
     const key = `ratelimit:${identifier}:${Math.floor(Date.now() / (windowSec * 1000))}`
     const count = await c.env.KV.get(key) || 0
     if (count >= limit) return c.json({ error: 'Rate limited' }, 429)
     await c.env.KV.put(key, String(+count + 1), { expirationTtl: windowSec })
   }
   ```

### 9. Audit Logging (1h)
1. Helper: `logAudit(c, action, resourceType, resourceId, metadata?)`:
   - Insert into audit_logs: tenant_id, user_id, action, resource_type, resource_id, metadata, ip, user_agent, timestamp
   - Non-blocking (don't await — use `c.executionCtx.waitUntil()`)

## Todo List
- [ ] Implement crypto utilities (JWT sign/verify, hash, random tokens)
- [ ] Create OAuth2 routes for Google
- [ ] Create OAuth2 routes for GitHub
- [ ] Implement auth service (code exchange, user provisioning)
- [ ] Create auth guard middleware (JWT + API key)
- [ ] Create tenant resolver middleware
- [ ] Implement tenant service (create, invite, manage members)
- [ ] Add tenant_memberships table + migration
- [ ] Implement RBAC permission matrix + middleware
- [ ] Implement API key service (create, validate, rotate, revoke)
- [ ] Implement KV-based rate limiter
- [ ] Implement audit logging helper
- [ ] Add CORS middleware configuration
- [ ] Wire all middleware into Hono app
- [ ] Test OAuth flow end-to-end (local + Cloudflare)

## Success Criteria
- Google OAuth login works: redirect → callback → JWT issued → cookie set
- GitHub OAuth login works same flow
- JWT refresh works without re-login
- API key authentication works for CLI/agent access
- RBAC enforced: viewer cannot edit, agent cannot manage users
- Rate limiter returns 429 when exceeded
- Audit log captures all auth events
- Tenant isolation verified: user A cannot access tenant B data

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Workers Crypto API limitations | Medium | High | Use Web Crypto (available); no Argon2 — use PBKDF2 |
| OAuth callback URL mismatch | High | Medium | Document exact callback URLs per environment |
| Token theft via XSS | Low | Critical | httpOnly + secure + sameSite cookies; CSP headers |
| KV eventual consistency for rate limits | Medium | Low | Acceptable: brief over-limit requests are tolerable |

## Security Considerations
- JWT signed with HMAC-SHA256; secret stored in Wrangler secrets
- Refresh tokens hashed before storage (never store plaintext)
- API keys: only prefix stored readable; full key shown once at creation
- CSRF protection: state parameter in OAuth flow
- Cookie flags: httpOnly, secure, sameSite=strict, path=/
- Rate limiting prevents brute force on auth endpoints
- Audit trail for all auth events (login, logout, key create/revoke)

## Next Steps
- Phase 3: Core API & Database Layer (uses auth middleware from this phase)
