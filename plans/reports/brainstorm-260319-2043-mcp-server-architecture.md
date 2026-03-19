# AgentWiki MCP Server — Architecture Brainstorm

**Date:** 2026-03-19 | **Status:** Complete | **Domain:** mcp.agentwiki.cc

---

## Problem Statement

AgentWiki needs an MCP (Model Context Protocol) Server to expose its knowledge management capabilities to AI tools (Claude Desktop, Claude Code, ChatGPT, Cursor, Codex, Antigravity, etc.). Must have full feature parity with REST API + CLI.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State Model | **Stateless** | Simple, no DO cost, matches existing API pattern |
| Data Access | **Direct DB** | Reuse service layer, ~5-20ms vs ~50-200ms via API hop |
| Scope | **Full** | All 4 feature groups (docs, search, org, admin) |
| Repository | **Monorepo** | `packages/mcp` in `../agentwiki`, direct code sharing |
| Auth | **API Key + Bearer** | Reuse existing `api-key-service.ts` (PBKDF2) |
| Transport | **Streamable HTTP** | Primary; stdio via `mcp-remote` proxy |
| SDK | **@modelcontextprotocol/sdk** v1.x | Stable, 34K+ dependents, CF Workers compatible |

---

## 1. MCP Tools Design (25 tools)

Naming: `{noun}_{verb}` pattern. All tools scoped by tenant via API key auth.

### Documents (8 tools)

| Tool Name | Description | Input Schema | Annotations |
|-----------|-------------|-------------|-------------|
| `document_create` | Create new knowledge document | `{ title: string, content?: string, folderId?: string, category?: string, tags?: string[], accessLevel?: "private"\|"specific"\|"public" }` | `readOnly: false` |
| `document_get` | Get document by ID or slug | `{ id?: string, slug?: string }` | `readOnly: true` |
| `document_list` | List documents with filters | `{ limit?: number, offset?: number, folderId?: string, category?: string, tag?: string, search?: string }` | `readOnly: true` |
| `document_update` | Update document content/metadata | `{ id: string, title?: string, content?: string, folderId?: string, category?: string, tags?: string[], accessLevel?: string }` | `readOnly: false` |
| `document_delete` | Soft-delete document | `{ id: string }` | `destructive: true` |
| `document_versions_list` | Get version history | `{ documentId: string }` | `readOnly: true` |
| `document_version_create` | Create version checkpoint | `{ documentId: string }` | `readOnly: false` |
| `document_links_get` | Get forward links + backlinks | `{ documentId: string }` | `readOnly: true` |

### Search & Graph (2 tools)

| Tool Name | Description | Input Schema | Annotations |
|-----------|-------------|-------------|-------------|
| `search` | Hybrid search across documents | `{ query: string, type?: "hybrid"\|"keyword"\|"semantic", limit?: number, category?: string }` | `readOnly: true` |
| `graph_get` | Get knowledge graph nodes + edges | `{ category?: string, tag?: string }` | `readOnly: true` |

### Organization (8 tools)

| Tool Name | Description | Input Schema | Annotations |
|-----------|-------------|-------------|-------------|
| `folder_create` | Create folder | `{ name: string, parentId?: string }` | `readOnly: false` |
| `folder_list` | Get hierarchical folder tree | `{}` | `readOnly: true` |
| `folder_update` | Rename/move/reorder folder | `{ id: string, name?: string, parentId?: string, position?: number }` | `readOnly: false` |
| `folder_delete` | Delete folder | `{ id: string }` | `destructive: true` |
| `tag_list` | List all tags with counts | `{}` | `readOnly: true` |
| `category_list` | List distinct categories | `{}` | `readOnly: true` |
| `upload_file` | Upload file to R2 | `{ filename: string, contentBase64: string, contentType: string, documentId?: string }` | `readOnly: false` |
| `upload_list` | List uploads | `{ documentId?: string }` | `readOnly: true` |

### Admin (7 tools)

| Tool Name | Description | Input Schema | Annotations |
|-----------|-------------|-------------|-------------|
| `member_list` | List tenant members | `{}` | `readOnly: true` |
| `member_update_role` | Change member role | `{ membershipId: string, role: "admin"\|"editor"\|"viewer"\|"agent" }` | `readOnly: false` |
| `member_remove` | Remove member from tenant | `{ membershipId: string }` | `destructive: true` |
| `api_key_create` | Create new API key | `{ name: string, scopes: string[], expiresInDays?: number }` | `readOnly: false` |
| `api_key_list` | List API keys | `{}` | `readOnly: true` |
| `api_key_revoke` | Revoke API key | `{ keyId: string }` | `destructive: true` |
| `share_link_create` | Create share link for document | `{ documentId: string, expiresInDays?: number }` | `readOnly: false` |

---

## 2. MCP Resources Design

URI scheme: `agentwiki://`

| Resource URI | Name | MIME | Description |
|-------------|------|------|-------------|
| `agentwiki://documents` | All Documents | `application/json` | Paginated document list |
| `agentwiki://documents/{id}` | Document Detail | `text/markdown` | Full document content as markdown |
| `agentwiki://documents/{id}/meta` | Document Metadata | `application/json` | Metadata (tags, author, dates, links) |
| `agentwiki://folders` | Folder Tree | `application/json` | Hierarchical folder structure |
| `agentwiki://tags` | All Tags | `application/json` | Tags with counts |
| `agentwiki://graph` | Knowledge Graph | `application/json` | Full graph (nodes + edges) |

**Resource templates** (dynamic, with list handlers for auto-completion):
- `agentwiki://documents/{id}` — listHandler returns all doc IDs + titles
- `agentwiki://documents/{id}/meta` — same list

---

## 3. MCP Prompts Design

| Prompt Name | Description | Arguments | Use Case |
|-------------|-------------|-----------|----------|
| `search_and_summarize` | Search docs, return summarized findings | `{ query: string, maxResults?: number }` | Quick knowledge lookup |
| `create_from_template` | Create document with category-specific template | `{ category: string, title: string }` | Standardized doc creation |
| `explore_connections` | Find related docs via knowledge graph | `{ documentId: string, depth?: number }` | Knowledge discovery |
| `review_document` | Review doc and suggest improvements | `{ documentId: string }` | Quality assurance |

---

## 4. Transport Architecture

### Primary: Streamable HTTP (Cloudflare Worker)

```
POST /mcp   → Client sends JSON-RPC request, server responds JSON or SSE
GET  /mcp   → Client opens SSE stream for server notifications (N/A in stateless)
DELETE /mcp → Client terminates session (returns 405 in stateless mode)
```

### stdio Support

Via `mcp-remote` proxy (npm package) for Claude Desktop:

```json
// Claude Desktop config
{
  "mcpServers": {
    "agentwiki": {
      "url": "https://mcp.agentwiki.cc/mcp",
      "headers": { "x-api-key": "aw_..." }
    }
  }
}
```

Or for clients requiring stdio:
```json
{
  "mcpServers": {
    "agentwiki": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp.agentwiki.cc/mcp", "--header", "x-api-key:aw_..."]
    }
  }
}
```

### SSE Backward Compat

Streamable HTTP already supports SSE via `Accept: text/event-stream` content negotiation. No separate SSE endpoint needed.

---

## 5. Auth Strategy

### API Key Extraction (priority order)

```
1. Header:    x-api-key: aw_xxxxx
2. Header:    Authorization: Bearer aw_xxxxx
3. Query:     ?api_key=aw_xxxxx
4. MCP meta:  JSON-RPC params._meta.api_key (fallback)
```

### Validation Flow

```
Extract key → PBKDF2 validate (KV cache → D1 fallback)
  → Get { tenantId, scopes, userId }
  → Check RBAC permissions per tool
  → Execute tool with tenant-scoped queries
```

### Permission Enforcement

Each tool declares required permission. Auth middleware checks API key scopes:

```typescript
// Example: document_create requires 'doc:create' permission
registerTool({
  name: "document_create",
  metadata: { requiredPermission: "doc:create" },
  handler: async (input, ctx) => {
    // ctx.auth already validated by middleware
    return DocumentService.create(env, ctx.auth.tenantId, ctx.auth.userId, input);
  }
});
```

---

## 6. Project Structure

```
packages/mcp/
├── src/
│   ├── index.ts                    # CF Worker entry, fetch handler
│   ├── server.ts                   # McpServer init, register all tools/resources/prompts
│   ├── auth/
│   │   └── api-key-middleware.ts    # Extract & validate API key, set auth context
│   ├── tools/
│   │   ├── document-tools.ts       # 8 document tools
│   │   ├── search-tools.ts         # search + graph_get
│   │   ├── folder-tools.ts         # 4 folder tools
│   │   ├── tag-tools.ts            # tag_list + category_list
│   │   ├── upload-tools.ts         # upload_file + upload_list
│   │   ├── member-tools.ts         # 3 member tools
│   │   ├── api-key-tools.ts        # 3 API key tools
│   │   └── share-tools.ts          # share_link_create
│   ├── resources/
│   │   └── wiki-resources.ts       # All 6 resources
│   └── prompts/
│       └── wiki-prompts.ts         # All 4 prompts
├── wrangler.toml                   # CF Worker config (same D1/R2/Vectorize/KV bindings)
├── package.json
└── tsconfig.json
```

**~12 source files, estimated ~800-1200 LOC total**

---

## 7. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| MCP SDK | `@modelcontextprotocol/sdk` | ^1.27 |
| Schema | `zod` | ^3.23 |
| Runtime | Cloudflare Workers | Latest |
| DB ORM | Drizzle (via `@agentwiki/api` services) | 0.44 |
| Build | TypeScript + esbuild (wrangler) | 5.x |
| CF Helpers | `@cloudflare/agents` (optional) | Latest |

### Code Reuse from Existing Packages

| From | Import | Used For |
|------|--------|----------|
| `packages/api/src/services/*` | All service classes | Direct DB operations |
| `packages/api/src/db/schema.ts` | Drizzle schema | DB queries |
| `packages/api/src/utils/*` | Crypto, pagination, slug, etc. | Shared utilities |
| `packages/api/src/middleware/require-permission.ts` | Permission checker | RBAC enforcement |
| `packages/shared/src/*` | Types, constants, schemas | Shared types & validation |

---

## 8. Deployment (wrangler.toml)

```toml
name = "agentwiki-mcp"
main = "src/index.ts"
compatibility_date = "2026-03-01"

routes = [
  { pattern = "mcp.agentwiki.cc/*", zone_name = "agentwiki.cc" }
]

[vars]
ENVIRONMENT = "production"

# Same bindings as packages/api
[[d1_databases]]
binding = "DB"
database_name = "agentwiki-prod"
database_id = "<same-as-api>"

[[r2_buckets]]
binding = "R2"
bucket_name = "agentwiki-uploads"

[[kv_namespaces]]
binding = "KV"
title = "agentwiki-kv"
id = "<same-as-api>"

[[vectorize]]
binding = "VECTORIZE"
index_name = "agentwiki-vectors"
```

---

## 9. Error Handling

MCP errors mapped from API HTTP status codes:

| API Status | MCP Error Code | Description |
|-----------|---------------|-------------|
| 400 | InvalidParams | Bad request / validation error |
| 401 | InvalidRequest | Auth failed |
| 403 | InvalidRequest | Insufficient permissions |
| 404 | InvalidParams | Resource not found |
| 429 | InternalError | Rate limited (include retryAfter in message) |
| 500 | InternalError | Server error |

All errors include structured message: `{ code, message, details? }`

---

## 10. Rate Limiting

Reuse existing KV-based sliding window limiter from `packages/api`:
- API tools: 100 req/min per API key
- Search tools: 50 req/min per API key
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining` (in MCP response metadata)

---

## Evaluated Approaches

### Approach A: Stateless + Direct DB (CHOSEN)
- **Pros:** Simple, fast (~5-20ms), max code reuse, no DO cost
- **Cons:** No server-push, no session state
- **Verdict:** Best fit — AgentWiki API is already stateless, MCP tools are request/response

### Approach B: Stateful McpAgent + Direct DB
- **Pros:** Server notifications, cached auth, session workflows
- **Cons:** DO pricing, complexity, cold start penalty
- **Verdict:** Overkill for current needs, can upgrade later

### Approach C: Stateless + REST API proxy
- **Pros:** Zero code coupling, independent deploy
- **Cons:** Double latency, double rate-limiting, limited code reuse
- **Verdict:** Too slow, defeats purpose of being in monorepo

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| D1 binding conflicts (2 workers, 1 DB) | Low | Medium | CF supports multiple workers on same D1 |
| Service layer import issues (different worker bundles) | Medium | High | Use workspace references, test build early |
| API key validation perf (PBKDF2 100k iterations) | Low | Medium | KV cache hit ratio should be >90% |
| MCP SDK breaking changes (v2) | Low | Medium | Pin to v1.x, v1 LTS ≥6mo |
| Large search results exceeding MCP message size | Medium | Low | Use ResourceLink for large payloads |

---

## Success Metrics

1. All 25 MCP tools functional and tested
2. Auth works with API key via header, Bearer, and query param
3. Latency < 50ms for read operations, < 200ms for search
4. Deploy to mcp.agentwiki.cc via `wrangler deploy`
5. Works in Claude Desktop, Claude Code, and Cursor
6. Full RBAC enforcement (agent role can only read + search)

---

## Implementation Estimate

| Phase | Scope | Files |
|-------|-------|-------|
| 1. Scaffold + Auth | Project setup, wrangler config, API key middleware | 4 files |
| 2. Document Tools | 8 document CRUD + version tools | 2 files |
| 3. Search + Graph | search + graph_get tools | 1 file |
| 4. Organization | folder + tag + upload tools | 3 files |
| 5. Admin | member + API key + share tools | 3 files |
| 6. Resources + Prompts | 6 resources + 4 prompts | 2 files |
| 7. Testing + Deploy | E2E test, wrangler deploy | configs |

---

## Resolved Questions (from code analysis)

1. **Queue jobs → YES, REQUIRED.** `createDocument()` and `updateDocument()` call `env.QUEUE.send()` to trigger AI summary + embedding generation. MCP Worker MUST bind QUEUE to maintain parity. Without it, docs created via MCP won't have summaries or be searchable via semantic search. The service layer already handles QUEUE.send() gracefully with try/catch.

2. **Audit logging → YES, with adaptation.** Current `logAudit()` uses Hono's `c.executionCtx.waitUntil()`. MCP Worker needs a lightweight wrapper that uses CF Worker's native `ctx.waitUntil()` instead. Add `source: "mcp"` metadata to distinguish from API calls.

3. **Upload via MCP → LIMIT to 2MB.** Base64 adds ~33% overhead. Limit MCP uploads to 2MB (actual file ~1.5MB after encoding). For larger files, tool response suggests using REST API or share a presigned R2 URL.

4. **Secrets → API keys only (no JWT_SECRET).** MCP auth is API-key-only. No OAuth/JWT flow needed. JWT_SECRET not required in MCP Worker bindings.

5. **Service layer reuse → 100% compatible.** All service functions are pure: `fn(env, tenantId, userId, input)`. No Hono dependency. MCP imports directly from `@agentwiki/api/src/services/*`.

6. **CF Worker bindings → Full parity needed.** MCP Worker Env: `DB` (D1), `R2` (uploads), `KV` (rate limit + API key cache), `VECTORIZE` (semantic search), `QUEUE` (async jobs), `AI` (embeddings/summary). Same bindings as API Worker.

## Remaining Open Items

1. **Monorepo build config** — Need to verify Turborepo can build MCP package that imports from `packages/api` services without bundling the entire API.
2. **wrangler.toml D1 database_id** — Need actual production D1 ID from API's wrangler config.
