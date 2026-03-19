---
phase: 1
title: Scaffold + Auth
priority: critical
status: completed
effort: medium
---

# Phase 1: Scaffold + Auth

## Context Links

- [Brainstorm](../reports/brainstorm-260319-2043-mcp-server-architecture.md)
- [MCP SDK Research](../reports/researcher-260319-2043-mcp-sdk-cloudflare-workers-integration.md)
- [API wrangler.toml](../../packages/api/wrangler.toml) (reference for bindings)
- [API key service](../../packages/api/src/services/api-key-service.ts) (reuse directly)

## Overview

Create `packages/mcp` package in monorepo. Set up MCP server with Streamable HTTP transport, API key authentication, RBAC permission checking, and audit logging.

## Key Insights

- Service layer in `packages/api` is pure functions `fn(env, tenantId, userId, input)` — no Hono dependency
- `validateApiKey()` from `api-key-service.ts` is fully reusable, returns `{ id, tenantId, scopes }`
- API key auth in API sets `role: 'agent'` by default — MCP should respect API key scopes for flexible RBAC
- `logAudit()` uses Hono's `c.executionCtx.waitUntil()` — need CF Worker native adaptation
- Wrangler bindings must match API's exactly (same D1 database, R2 bucket, KV namespace, etc.)

## Requirements

### Functional
- MCP server responds to Streamable HTTP protocol (POST/GET/DELETE on `/mcp`)
- API key extracted from: `x-api-key` header → `Authorization: Bearer` → `?api_key=` query param
- RBAC enforcement per tool based on API key scopes
- Audit logging with `source: "mcp"` metadata

### Non-Functional
- Cold start < 50ms
- Auth validation < 20ms (KV cache hit)
- CORS for browser-based MCP clients

## Architecture

```
Request → CF Worker fetch handler
  → Extract API key (header/bearer/query)
  → Validate via validateApiKey() (KV → D1)
  → Set auth context { tenantId, userId, scopes }
  → Route to McpServer.handleRequest()
  → Tool handler checks permission → executes → returns
  → Audit log via ctx.waitUntil()
```

## Related Code Files

### Files to create (in `D:/www/digitop/agentwiki/packages/mcp/`)
- `package.json` — Package config, workspace deps
- `tsconfig.json` — TypeScript config extending base
- `wrangler.toml` — CF Worker config with all bindings
- `src/index.ts` — Worker entry point (fetch handler)
- `src/server.ts` — McpServer initialization
- `src/auth/api-key-auth.ts` — API key extraction + validation + RBAC
- `src/utils/audit-logger.ts` — Audit logging adapted for CF Worker (no Hono)
- `src/utils/mcp-error-handler.ts` — Map API errors to MCP error codes

### Files to read (reference)
- `packages/api/wrangler.toml` — Copy binding IDs
- `packages/api/src/services/api-key-service.ts` — Import `validateApiKey`
- `packages/api/src/env.ts` — Reference Env type
- `packages/shared/src/constants.ts` — Import PERMISSIONS, RATE_LIMITS, API_KEY_PREFIX

## Implementation Steps

### 1. Create package.json
```json
{
  "name": "@agentwiki/mcp",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "build": "wrangler deploy --dry-run --outdir=dist",
    "deploy": "wrangler deploy",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.27.0",
    "zod": "^3.24.0",
    "drizzle-orm": "^0.38.0",
    "@agentwiki/api": "workspace:*",
    "@agentwiki/shared": "workspace:*"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260301.0",
    "wrangler": "^3.108.0"
  }
}
```

### 2. Create wrangler.toml
Same bindings as API but:
- `name = "agentwiki-mcp"`
- Route: `mcp.agentwiki.cc/*`
- NO queue consumer (MCP is producer only)
- NO oauth secrets (only API key auth)

### 3. Create src/index.ts — Worker entry point
```typescript
// Extract API key from request
// Validate via validateApiKey()
// Create MCP server with auth context
// Handle request via Streamable HTTP transport
// CORS headers for browser clients
```

### 4. Create src/server.ts — McpServer initialization
```typescript
// Initialize McpServer with name, version, capabilities
// Import and register all tools (from future phases)
// Import and register all resources
// Import and register all prompts
// Export factory function: createServer(env, auth)
```

### 5. Create src/auth/api-key-auth.ts
```typescript
// extractApiKey(request): string | null
//   Priority: x-api-key header → Authorization Bearer → ?api_key query
// authenticateRequest(env, request): AuthContext | McpError
//   Call validateApiKey(), check scopes, return auth context
// checkPermission(auth, requiredPermission): boolean
//   Reuse PERMISSIONS map from @agentwiki/shared
```

### 6. Create src/utils/audit-logger.ts
```typescript
// logMcpAudit(ctx, env, auth, action, resourceType?, resourceId?, metadata?)
//   Uses ctx.waitUntil() (CF Worker ExecutionContext)
//   Adds source: "mcp" to metadata
//   Inserts into audit_logs table via drizzle
```

### 7. Create src/utils/mcp-error-handler.ts
```typescript
// mapToMcpError(httpStatus, message): McpError
//   400 → InvalidParams
//   401/403 → InvalidRequest
//   404 → InvalidParams (resource not found)
//   429 → InternalError (rate limited)
//   500 → InternalError
```

### 8. Update monorepo config
- Add `"@agentwiki/mcp": ["./packages/mcp/src"]` to `tsconfig.base.json` paths
- Run `pnpm install` to link workspace deps

## Todo List

- [ ] Create `packages/mcp/package.json`
- [ ] Create `packages/mcp/tsconfig.json`
- [ ] Create `packages/mcp/wrangler.toml` (copy bindings from API)
- [ ] Create `packages/mcp/src/index.ts` (Worker fetch handler)
- [ ] Create `packages/mcp/src/server.ts` (McpServer factory)
- [ ] Create `packages/mcp/src/auth/api-key-auth.ts` (extract + validate + RBAC)
- [ ] Create `packages/mcp/src/utils/audit-logger.ts` (non-Hono audit)
- [ ] Create `packages/mcp/src/utils/mcp-error-handler.ts` (error mapping)
- [ ] Update `tsconfig.base.json` (add MCP paths)
- [ ] `pnpm install` and verify build

## Success Criteria

- `wrangler dev` starts without errors
- POST `/mcp` with valid API key returns MCP initialize response
- POST `/mcp` without API key returns 401
- POST `/mcp` with invalid key returns 401
- API key from query param `?api_key=aw_...` works
- RBAC blocks tools when scope insufficient
- Audit log entry created for auth events

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Workspace import of `@agentwiki/api` services may not bundle correctly | Test early with `wrangler dev`; if fails, use direct file imports via tsconfig paths |
| `@modelcontextprotocol/sdk` may not have `createMcpHandler()` for CF Workers | Fallback: manual Streamable HTTP handler using low-level SDK APIs |
| PBKDF2 100k iterations slow on first call | KV cache should handle >90% of requests; first-call latency acceptable |

## Security Considerations

- API keys validated via PBKDF2 (100k iterations) — same security as REST API
- CORS restricted to known origins
- Rate limiting via KV-based sliding window
- No JWT_SECRET needed — API key auth only
- Audit trail for all tool invocations

## Next Steps

→ Phase 2: Document Tools (depends on server + auth working)
