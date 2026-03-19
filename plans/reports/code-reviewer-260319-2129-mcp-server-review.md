# Code Review: MCP Server Implementation

**Date:** 2026-03-19
**Scope:** `packages/mcp/` — 16 files, ~650 LOC
**Focus:** Security, error handling, MCP compliance, CF Workers compat, code quality

## Overall Assessment

Well-structured MCP server with clean separation of concerns. Consistent patterns across all tool files. Good use of `safeToolCall` wrapper, audit logging via `waitUntil`, and stateless transport. Several security issues need attention before production.

---

## Critical Issues

### C1. Tenant isolation missing on `updateMemberRole` and `removeMember` (IDOR)

**Files:** `member-tools.ts:34`, `member-tools.ts:49`
**Impact:** Any API key with `user:manage` scope can modify/remove memberships from ANY tenant by guessing membership IDs.

`updateMemberRole(env, membershipId, role)` and `removeMember(env, membershipId)` in `member-service.ts` do NOT filter by `tenantId`. An attacker with a valid API key from tenant A can escalate privileges or remove members in tenant B.

**Fix:** Pass `auth.tenantId` to these functions and add a `tenantId` WHERE clause, or verify the membership belongs to the caller's tenant before mutating:

```ts
// member-service.ts
export async function updateMemberRole(env: Env, tenantId: string, membershipId: string, role: string) {
  const db = drizzle(env.DB)
  await db.update(tenantMemberships).set({ role })
    .where(and(eq(tenantMemberships.id, membershipId), eq(tenantMemberships.tenantId, tenantId)))
  // ...
}
```

### C2. `graph_get` and tag resource fetch ALL rows across tenants

**File:** `search-and-graph-tools.ts:66-68`, `wiki-resources.ts:93`

```ts
// Fetches ALL document tags and links across ALL tenants
const tags = await db.select().from(documentTags)
const links = await db.select().from(documentLinks)
```

While edges/tags are later filtered against tenant-scoped `docIds`, ALL rows are loaded into memory first. This is:
- **Performance:** unbounded full-table scan on multi-tenant DB
- **Data leakage risk:** if `documentTags` or `documentLinks` ever gain sensitive fields, raw data is in memory

**Fix:** Join through `documents` table to filter by tenant at the DB level:

```ts
const links = await db
  .select({ id: documentLinks.id, source: documentLinks.sourceDocId, target: documentLinks.targetDocId, context: documentLinks.context })
  .from(documentLinks)
  .innerJoin(documents, eq(documentLinks.sourceDocId, documents.id))
  .where(eq(documents.tenantId, auth.tenantId))
```

### C3. No scope escalation prevention in `api_key_create`

**File:** `api-key-tools.ts:26-33`

An API key with `key:*` scope can create new keys with ANY scopes (e.g., `user:manage`, `*:*`). This allows privilege escalation — a key meant for document operations could mint an admin key.

**Fix:** Validate that requested scopes are a subset of the caller's scopes:

```ts
const requestedScopes = args.scopes
const hasAll = requestedScopes.every(s => checkPermission(auth.scopes, s))
if (!hasAll) return toolError('Cannot create key with scopes exceeding your own')
```

---

## High Priority

### H1. `toolError` returned inside `safeToolCall` gets double-wrapped

**Files:** `document-tools.ts:60`, `document-tools.ts:105`, `folder-tools.ts:67`

When `toolError()` is returned inside the `fn` callback of `safeToolCall`, the `formatResult` wrapper processes it as a success. Some handlers use `(r) => r as never` to work around this, but others (like `document_get` line 60) return `toolError(...)` as the resolved value of the promise, which then passes through `formatResult` — wrapping the error result inside another `toolResult`.

**Fix:** Either:
1. Throw an error instead of returning `toolError` inside `safeToolCall`
2. Check if the returned value already has `isError: true` in `safeToolCall`

### H2. API key in query parameter logged in access logs

**File:** `api-key-auth.ts:22-23`

Accepting API keys via `?api_key=` query parameter means the full key appears in CF Worker request logs, access logs, and potentially Cloudflare dashboard analytics. Query params are commonly logged by infrastructure.

**Recommendation:** Either remove query param support or document the security tradeoff clearly. At minimum, log a warning when query param auth is used.

### H3. `CORS Access-Control-Allow-Origin: *` on authenticated endpoint

**File:** `index.ts:9`

Wildcard CORS origin on an endpoint that accepts API keys means any website can make authenticated requests if the key is available client-side. For a server-to-server MCP endpoint this is likely fine, but if browser-based MCP clients connect, this becomes risky.

**Recommendation:** Make CORS origin configurable via env var, default to restrictive.

---

## Medium Priority

### M1. Resources lack permission checks

**File:** `wiki-resources.ts`

All 6 resources skip `checkPermission()` — any valid API key (even one with zero scopes) can read documents, folders, tags, and the knowledge graph via MCP resources.

**Fix:** Add scope checks to resource handlers, matching the `doc:read` requirement used by tools.

### M2. Duplicate query logic between tools and resources

**Files:** `tag-tools.ts:24-34` duplicates `wiki-resources.ts:70-79`; `search-and-graph-tools.ts:50-92` duplicates `wiki-resources.ts:86-105`

Extract shared queries into service functions to maintain DRY.

### M3. `document_get` missing input validation for empty args

**File:** `document-tools.ts:52-60`

If both `id` and `slug` are omitted, the handler returns `toolError('Document not found')` inside `safeToolCall` — misleading. Should validate that at least one is provided.

**Fix:** Add `.refine()` on schema or early check:
```ts
if (!args.id && !args.slug) return toolError('Provide either id or slug')
```

### M4. `auth.userId` vs `auth.apiKeyId` confusion

**File:** `api-key-auth.ts:41-44`

```ts
return {
  userId: result.id,      // This is the API key's id, not the user's id
  apiKeyId: result.id,    // Same value
}
```

`validateApiKey` returns `{ id, tenantId, scopes }` where `id` is the API key record ID. This means `auth.userId` is actually the API key ID, not a real user ID. This propagates to audit logs (`userId` = API key ID) and any service calls expecting a real user ID (e.g., `createDocument` author tracking).

**Fix:** Return the actual `userId` from the API key record. The `api_keys` table likely has a `createdBy` or `userId` field that should be used.

---

## Low Priority

### L1. `env as never` cast used everywhere

All service calls use `env as never` to bypass type mismatch between MCP's `Env` and API's `Env`. While functional, a shared `Env` base type or intersection would be cleaner.

### L2. No rate limiting

MCP endpoint has no rate limiting. A single API key could send unlimited requests. Consider Cloudflare's built-in rate limiting or a simple KV-based counter.

### L3. `JSON.stringify(data, null, 2)` in `toolResult`

Pretty-printing JSON adds ~30% payload overhead. For large document lists this adds up. Consider compact JSON for tool results.

---

## Positive Observations

- Clean factory pattern in `server.ts` — per-request server creation is correct for stateless CF Workers
- Consistent permission check pattern across all tools
- Good use of `ctx.waitUntil` for non-blocking audit logging
- Proper MCP annotations (`readOnlyHint`, `destructiveHint`) on tools
- Zod schemas with `.describe()` provide good tool documentation
- `safeToolCall` wrapper prevents unhandled exceptions from crashing requests
- Stateless transport config (`sessionIdGenerator: undefined`) is correct for CF Workers
- TypeScript compiles cleanly with no errors

---

## Recommended Actions (Priority Order)

1. **[CRITICAL]** Fix tenant isolation on `updateMemberRole`/`removeMember` — pass and enforce `tenantId`
2. **[CRITICAL]** Fix unbounded cross-tenant data loading in `graph_get` and resources
3. **[CRITICAL]** Add scope escalation prevention in `api_key_create`
4. **[HIGH]** Fix `userId`/`apiKeyId` confusion in auth context
5. **[HIGH]** Fix `toolError` double-wrapping inside `safeToolCall`
6. **[MEDIUM]** Add permission checks to MCP resources
7. **[MEDIUM]** Validate `document_get` requires at least one identifier
8. **[LOW]** Extract shared query logic into service functions

## Metrics

- Type Coverage: 100% (clean `tsc --noEmit`)
- Test Coverage: not measured (no test files found in `packages/mcp/`)
- Linting Issues: 0 (compiles clean)

## Unresolved Questions

1. Is `validateApiKey` returning the API key's `id` or the user's `id` in its return value? If it's the key ID, the `auth.userId` field is wrong throughout the system.
2. Should MCP resources support the same RBAC as tools, or are they intentionally open to any authenticated key?
3. What is the expected tenant data scale? The full-table scans on `documentLinks`/`documentTags` will degrade at scale.
