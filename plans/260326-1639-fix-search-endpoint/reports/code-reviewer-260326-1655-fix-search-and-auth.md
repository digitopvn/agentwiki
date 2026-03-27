# Code Review: Fix Search Endpoint 500 + Auth/CLI Bugs

## Scope
- Files: 4 modified (`trigram-service.ts`, `auth.ts`, `api-client.ts`, `cli/index.ts`)
- LOC: ~952 total across files, ~80 lines of diff
- Focus: Bug fixes for search 500, auth `/me` API key support, CLI default URL
- Scout findings: See "Edge Cases Found by Scout" below

## Overall Assessment

Solid set of targeted bug fixes. All three issues are real, correctly diagnosed, and appropriately fixed. No security regressions. One high-priority systemic issue found via scouting.

---

## Critical Issues

None.

---

## High Priority

### 1. `PATCH /me` has the same API-key userId bug (NOT fixed)

**File:** `packages/api/src/routes/auth.ts:208-213`

The `GET /me` route correctly resolves `realUserId` when `isApiKey=true`, but the `PATCH /me` route on line 209 still uses raw `userId` from `authGuard`. When called with an API key, `userId` is the **API key row ID**, not the user ID -- the `updateUserProfile` call will fail with "User not found" or (worse) silently do nothing.

```ts
// Current (broken for API keys):
auth.patch('/me', authGuard, async (c) => {
  const { userId } = c.get('auth')   // <-- API key row ID when isApiKey
  const body = await c.req.json() as { name?: string }
  const updated = await updateUserProfile(c.env, userId, body) // looks up user by wrong ID
```

**Fix:** Extract the same `realUserId` resolution logic into a shared helper or duplicate the pattern:

```ts
auth.patch('/me', authGuard, async (c) => {
  const { userId, isApiKey } = c.get('auth')
  const db = drizzle(c.env.DB)
  let realUserId = userId
  if (isApiKey) {
    const key = await db.select({ createdBy: apiKeys.createdBy }).from(apiKeys).where(eq(apiKeys.id, userId)).limit(1)
    if (key.length) realUserId = key[0].createdBy
  }
  const body = await c.req.json() as { name?: string }
  const updated = await updateUserProfile(c.env, realUserId, body)
```

**Broader impact:** Other routes using `userId` from `authGuard` (preferences, uploads, imports, share, folders, documents) also pass it to DB queries. Most use `userId` as `createdBy`/`lastEditedBy` audit fields -- an API key row ID there is wrong but non-critical. Routes like `preferences.ts` that query by `userId` as a foreign key to `users` will silently return empty results or fail.

**Recommendation:** Consider resolving the real user ID inside `authGuard` itself so all downstream routes get the correct value. This eliminates the per-route fix pattern entirely.

### 2. Multiple routes affected by API key userId mismatch

Beyond `PATCH /me`, scouted these routes using `userId` from auth context:
- `preferences.ts` -- GET/PUT preferences keyed by userId (broken)
- `uploads.ts:19` -- audit trail (wrong userId recorded)
- `import.ts:48,87,232` -- import jobs (wrong userId recorded)
- `documents.ts:31,75,100` -- createdBy/lastEditedBy (wrong userId)
- `folders.ts:24` -- createdBy (wrong userId)
- `share.ts:27` -- createdBy (wrong userId)

The `GET /me` fix is correct but localized. A systemic fix in `authGuard` would be cleaner.

---

## Medium Priority

### 3. `orderBy(sql\`2 DESC, 3 DESC\`)` -- column position ordering

**File:** `packages/api/src/services/trigram-service.ts:124`

The fix from named alias to column-position ordering is **correct** and standard SQL. Column positions 2 and 3 correspond to `matchedTrigrams` and `rawScore` in the SELECT list. This is the right approach given Drizzle's limitation with SQL aliases in ORDER BY clauses.

However, the fix is **fragile**: if someone reorders or adds columns to the SELECT, the positional references silently break. The inline comment helps, but consider as future improvement:

```ts
// Alternative: repeat the expressions
.orderBy(
  sql`COUNT(DISTINCT ${searchTrigrams.trigram}) DESC`,
  sql`SUM(CASE WHEN ${searchTrigrams.field} = 'title' THEN ${searchTrigrams.frequency} * 2 ELSE ${searchTrigrams.frequency} END) DESC`
)
```

Repeating the expressions is verbose but resistant to column reordering. Not blocking for this fix.

### 4. Error swallowing in trigram search

**File:** `packages/api/src/services/trigram-service.ts:167-170`

The try-catch returns `[]` on error with `console.error`. This matches `fts5Search` and `semanticSearch` patterns -- consistent and appropriate for search (graceful degradation). However, the search service layer in `search-service.ts` has no visibility into whether keyword results were empty because of no matches or because of an error.

For observability, consider adding a structured log field (e.g., `{ error: true, source: 'trigram' }`) or emitting a metric. Not blocking.

---

## Low Priority

### 5. Unused import cleanup -- clean

`verifyJwt` removal confirmed -- zero references remain in `auth.ts`. Good cleanup.

### 6. CLI URL defaults -- correct

- `api-client.ts:21`: `https://app.agentwiki.cc` -> `https://api.agentwiki.cc` (correct)
- `cli/index.ts:21`: Same fix for `--url` default
- `cli/index.ts:36`: Help text URL changed to `https://app.agentwiki.cc/settings/api-keys` (correct -- that's the web UI where users get keys)

### 7. Existing CLI users with cached wrong URL

Users who ran `agentwiki login` before this fix have `https://app.agentwiki.cc` saved in `~/.agentwiki/credentials.json`. The fix only changes the default for NEW installs. Existing users must run `agentwiki login --url https://api.agentwiki.cc --api-key <key>` to fix their config. Consider mentioning this in release notes.

---

## Edge Cases Found by Scout

1. **API key userId mismatch is systemic** -- Only `GET /me` is fixed. At least 6 other route files pass `userId` to DB operations where the value is an API key row ID instead of user ID. See High Priority #2.

2. **`PATCH /me` via API key** -- Will attempt to update a non-existent user record (API key ID != user ID). Returns 404 or silently fails.

3. **Revoked API key + KV cache race** -- If an API key is revoked but still cached in KV (up to 1hr TTL), `authGuard` validates it, then `GET /me` tries to look up the key by ID. The key row still exists (revokedAt is set but not filtered). The lookup in `GET /me` doesn't check `revokedAt`, so it will still resolve `createdBy`. Not a security issue (authGuard already validated), but worth noting.

4. **Column position ordering fragility** -- Adding/removing columns from the SELECT in `trigramSearch` silently breaks ordering. See Medium #3.

5. **Empty trigram set returns early** -- `trigramSearch` returns `[]` for very short queries (< 3 chars) via `extractTrigrams` returning empty. This is correct behavior but could surprise users searching for 1-2 character terms.

---

## Positive Observations

- Bug diagnosis is accurate; all three root causes are real
- Error handling pattern is consistent with existing `fts5Search` and `semanticSearch`
- `authGuard` reuse in `GET /me` is the right call -- removes duplicated JWT verification logic
- API key -> user resolution logic in `GET /me` is correct and handles the edge case where key doesn't exist (falls through to 404)
- Clean diff -- minimal changes, focused scope

---

## Recommended Actions

1. **[HIGH] Fix `PATCH /me` for API key auth** -- Apply same `realUserId` resolution
2. **[HIGH] Consider systemic fix in `authGuard`** -- Resolve real user ID at middleware level to prevent per-route bugs
3. **[LOW] Add release note** about CLI URL change for existing users
4. **[LOW] Consider repeating ORDER BY expressions** instead of column positions for robustness

---

## Metrics

- Type Coverage: N/A (no new types introduced, existing types correct)
- Test Coverage: Not assessed (no test changes in diff)
- Linting Issues: 0 (unused `verifyJwt` import removed)

## Unresolved Questions

1. Should the API key userId -> real userId resolution live in `authGuard` middleware instead of per-route? This would fix all routes at once but changes the contract of `auth.userId` for all consumers.
2. Are there any routes that intentionally want the API key row ID rather than the user ID? If not, fixing in middleware is strictly better.
