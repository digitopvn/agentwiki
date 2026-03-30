# Code Review: Fix Auth Duration (#31)

## Scope
- Files: `packages/shared/src/constants.ts`, `packages/api/src/routes/auth.ts`, `packages/web/src/lib/api-client.ts`, `packages/api/src/services/auth-service.ts` (dependency)
- LOC changed: ~43 (36 added, 8 removed)
- Focus: Auth token TTL extension + client-side auto-refresh interceptor

## Overall Assessment

Clean, well-scoped fix. TTL constants drive JWT `exp` correctly via `auth-service.ts`. Cookie maxAge values match TTL constants. Auto-refresh interceptor is solid with proper deduplication. Two medium issues found, no critical blockers.

## Critical Issues

None.

## High Priority

### H1. Cookie maxAge hardcoded — not derived from TOKEN_TTL

**Problem:** Cookie `maxAge` values (3600, 2592000) are hardcoded magic numbers in `auth.ts` instead of being derived from `TOKEN_TTL`. This creates a maintenance risk — if someone changes `TOKEN_TTL` in `constants.ts` they must remember to update 4 separate cookie lines in `auth.ts`.

**Impact:** Silent mismatch between JWT expiry and cookie expiry. JWT could expire before cookie is cleared (or vice versa).

**Fix:**
```typescript
import { TOKEN_TTL } from '@agentwiki/shared'

// Then in each setCookie call:
setCookie(c, 'access_token', accessToken, {
  ...getCookieOpts(c),
  maxAge: Math.floor(TOKEN_TTL.accessToken / 1000) // convert ms to seconds
})
setCookie(c, 'refresh_token', refreshToken, {
  ...getCookieOpts(c),
  maxAge: Math.floor(TOKEN_TTL.refreshToken / 1000)
})
```

**Locations:** Lines 77-78, 130-131, 162 in `auth.ts`.

### H2. Refresh endpoint does not rotate refresh token

**Problem:** `refreshAccessToken()` in `auth-service.ts` (line 196 comment: "keep same refresh token") reuses the same refresh token indefinitely for 30 days. With the TTL extended from 7 to 30 days, a stolen refresh token now has a much larger exploitation window.

**Impact:** If a refresh token is compromised, attacker has 30 days of persistent access with no way to detect or invalidate it (unless user explicitly logs out).

**Recommendation:** Implement refresh token rotation — issue a new refresh token on each refresh and invalidate the old one. This limits the window of a stolen token to a single refresh interval. Not blocking for this PR but should be tracked as a follow-up security hardening task.

## Medium Priority

### M1. No retry limit after refresh

**Problem:** In `api-client.ts`, after a successful refresh, the retried request could theoretically also return 401 (e.g., if the new access token is immediately invalid due to a server-side issue like revoked permissions). The code does not 401 again because the retry path doesn't re-enter the refresh logic, but this means the user silently gets an `ApiError(401)` with no indication that refresh was attempted.

**Impact:** Minor UX concern — user sees a generic error instead of being redirected to login.

**Suggestion:** Consider adding a redirect to login when refresh succeeds but the retried request still fails with 401. This indicates the session is truly invalid.

### M2. No redirect to login on failed refresh

**Problem:** When `tryRefresh()` returns `false` (refresh token expired/invalid), the original 401 error propagates as an `ApiError`. The user stays on the current page with a generic error.

**Suggestion:** Add a global handler or check in the interceptor:
```typescript
if (res.status === 401 && !path.startsWith('/api/auth/')) {
  const refreshed = await tryRefresh()
  if (refreshed) {
    res = await doFetch()
  } else {
    // Session fully expired — redirect to login
    window.location.href = '/login'
    throw new ApiError(401, 'Session expired')
  }
}
```

## Low Priority

None.

## Positive Observations

1. **Refresh deduplication** — `refreshPromise` singleton pattern correctly serializes concurrent 401 retries. Multiple parallel requests hitting 401 will share one refresh call.
2. **Auth path exclusion** — `!path.startsWith('/api/auth/')` prevents infinite refresh loops (refresh endpoint returning 401 would not trigger another refresh).
3. **Cookie security** — `httpOnly`, `secure` (in production), `sameSite: 'Lax'`, `path: '/'` are all correctly set.
4. **Consistent TTL** — `TOKEN_TTL` in shared constants is correctly consumed by `auth-service.ts` for JWT `exp` claim (line 154) and session `expiresAt` (line 165).
5. **Clean `.finally()` cleanup** — `refreshPromise` is nulled in `.finally()`, ensuring the lock is released even on error.

## Consistency Check

| Source | Access Token | Refresh Token |
|--------|-------------|---------------|
| `TOKEN_TTL` (ms) | 3,600,000 (1hr) | 2,592,000,000 (30d) |
| Cookie maxAge (sec) | 3,600 (1hr) | 2,592,000 (30d) |
| JWT `exp` (auth-service L154) | `now + TOKEN_TTL.accessToken` | N/A (opaque) |
| Session `expiresAt` (auth-service L165) | N/A | `now + TOKEN_TTL.refreshToken` |

Values are consistent across all layers.

## Recommended Actions (Priority Order)

1. **[H1]** Derive cookie maxAge from `TOKEN_TTL` constants to eliminate duplication
2. **[H2]** Track refresh token rotation as follow-up issue (security hardening)
3. **[M2]** Add login redirect on failed refresh for better UX
4. **[M1]** Consider logging/telemetry when refresh succeeds but retry still 401s

## Unresolved Questions

- Is 30-day refresh token acceptable for the app's threat model? Consumer apps often use 30d, but if this handles sensitive data, 14d with rotation may be more appropriate.
- Should there be a maximum session lifetime (absolute timeout) regardless of refresh activity?

---

**Status:** DONE
**Summary:** Auth duration fix is correct and consistent. Two high-priority recommendations: derive cookie maxAge from shared constants (DRY), and track refresh token rotation for security hardening. No critical blockers.
