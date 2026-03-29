# AgentWiki MCP Server

Enterprise knowledge management integration for AI agents via Model Context Protocol (MCP).

## Overview

The AgentWiki MCP server enables AI systems (Claude, ChatGPT, Cursor, etc.) to access and manage organizational knowledge through the Model Context Protocol. It provides 31 tools for document management, search, knowledge graph traversal, file uploads, and access control—directly integrated with the same database and bindings as the REST API.

**Framework**: Cloudflare Workers + @modelcontextprotocol/sdk
**Transport**: HTTP (WebStandardStreamableHTTPServerTransport)
**Endpoint**: POST /mcp
**Health**: GET /health
**Version**: 1.0.0

## Quick Start

### 1. Generate API Key

Via web UI or REST API:
```bash
# Create API key with specific scopes
curl -X POST https://api.agentwiki.cc/api/keys \
  -H "Authorization: Bearer {jwt_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Claude Desktop",
    "scopes": ["doc:read", "doc:create", "doc:update", "search:*"]
  }'

# Returns: {"id": "...", "key": "aw_xxxxxxxxxxxxx"}
```

### 2. Configure AI Client

#### Claude Desktop

Edit `~/.claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "agentwiki": {
      "url": "https://mcp.agentwiki.cc/mcp",
      "env": {
        "API_KEY": "aw_xxxxxxxxxxxxx"
      }
    }
  }
}
```

#### Cursor

In Cursor Settings → Features → MCP:
```json
{
  "servers": {
    "agentwiki": {
      "url": "https://mcp.agentwiki.cc/mcp",
      "env": {
        "API_KEY": "aw_xxxxxxxxxxxxx"
      }
    }
  }
}
```

#### Windsurf

Similar to Cursor in `~/.windsurf/mcp-servers.json`.

### 3. Test Connection

In Claude Desktop:
```
@agentwiki What documents do we have about authentication?
```

The MCP server will:
1. Verify API key (x-api-key header or Bearer token)
2. Extract tenant from key metadata
3. Execute search_and_summarize prompt
4. Return results from knowledge base

## Authentication

### API Key Management

**Format**: `aw_` prefix + 32 random bytes (base64url)
**Hash**: PBKDF2-SHA256 (100,000 iterations)
**Scopes**: Document, user, and API key management permissions

#### Creation

```bash
# Admin creates key with scopes
POST /api/keys
{
  "name": "Claude Integration",
  "scopes": ["doc:read", "doc:create", "search:*"]
}
```

#### Usage in MCP

Three methods supported:
1. **Header**: `x-api-key: aw_xxxxx` (preferred)
2. **Bearer Token**: `Authorization: Bearer aw_xxxxx`
3. **Query Parameter**: `/mcp?api_key=aw_xxxxx` (lowest priority)

#### Revocation

```bash
DELETE /api/keys/{id}
```

Revoked keys are immediately invalidated across all sessions.

### Permission Scopes

| Scope | Tools | Access |
|-------|-------|--------|
| `doc:read` | document_get, document_list, document_versions_list, document_links_get | Read documents |
| `doc:create` | document_create | Create documents |
| `doc:update` | document_update | Update documents |
| `doc:delete` | document_delete | Delete documents |
| `doc:share` | share_link_create | Create share links |
| `search:*` | search | Full search access |
| `doc:read` | graph_get, graph_traverse, graph_find_path, graph_suggest_links, graph_explain_connection, graph_stats | Knowledge graph (read) |
| `folder:*` | folder_create, folder_list, folder_update, folder_delete | Folder management |
| `tag:*` | tag_list, category_list | Tag management |
| `upload:*` | upload_file, upload_list | File uploads |
| `user:manage` | member_list, member_update_role, member_remove | User management |
| `key:*` | api_key_create, api_key_list, api_key_revoke | API key management |
| `tenant:manage` | (future) | Tenant configuration |

## Tool Reference

### Document Tools (8 tools)

#### document_create
Create new document in knowledge base.
```
Parameters:
  title: string (required) — Document title
  content: string (required) — Markdown content
  folderId?: string — Parent folder ID
  tags?: string[] — Document tags
  categoryId?: string — Document category

Response:
  id: string — Document ID
  title: string
  content: string
  createdAt: ISO8601
  version: number
```

#### document_get
Fetch document by ID.
```
Parameters:
  id: string (required)

Response:
  id: string
  title: string
  content: string (markdown)
  folderId?: string
  tags: string[]
  version: number
  createdAt: ISO8601
  updatedAt: ISO8601
```

#### document_list
List documents with pagination.
```
Parameters:
  limit?: number (default: 20, max: 100)
  offset?: number (default: 0)
  folderId?: string — Filter by folder
  tag?: string — Filter by tag

Response:
  documents: Document[]
  total: number
  hasMore: boolean
```

#### document_update
Update document content/metadata.
```
Parameters:
  id: string (required)
  title?: string
  content?: string
  tags?: string[]

Response:
  id: string
  version: number (incremented)
  updatedAt: ISO8601
```

#### document_delete
Soft delete (recoverable for 30 days).
```
Parameters:
  id: string (required)

Response:
  id: string
  deletedAt: ISO8601
```

#### document_versions_list
Fetch document version history.
```
Parameters:
  id: string (required)
  limit?: number (default: 10)

Response:
  versions: Array<{
    number: number
    content: string
    createdAt: ISO8601
    createdBy: string
  }>
```

#### document_version_create
Create manual version checkpoint.
```
Parameters:
  id: string (required)
  reason?: string — Version annotation

Response:
  version: number
  createdAt: ISO8601
```

#### document_links_get
Fetch wikilinks in document.
```
Parameters:
  id: string (required)

Response:
  links: Array<{
    targetId: string
    targetTitle: string
    context: string (surrounding text)
  }>
```

### Search Tool (1 tool)

#### search
Search documents and/or uploaded files using keyword, semantic, or hybrid search.
```
Parameters:
  query: string (required, max: 500)
  type?: "hybrid" | "keyword" | "semantic" (default: "hybrid")
  source?: "docs" | "storage" | "all" (default: "docs")
    — docs: wiki documents only
    — storage: uploaded files only
    — all: both documents and files
  limit?: number (default: 10, max: 50)
  category?: string — Filter by category

Response:
  results: Array<{
    id: string
    title: string
    content: string (excerpt)
    relevance: number (0-1)
    type: "keyword" | "semantic"
  }>
  total: number
```

### Knowledge Graph Tools (6 tools)

AgentWiki supports 6 typed edge types: `relates-to`, `depends-on`, `extends`, `references`, `contradicts`, `implements`.

Additionally, the graph supports **implicit similarity edges** — AI-inferred connections based on semantic vector similarity (Vectorize). These are not stored explicitly but computed on demand.

#### graph_get
Get knowledge graph with typed edges. Supports filtering by edge type and including implicit AI-inferred similarity edges.
```
Parameters:
  category?: string — Filter nodes by category
  tag?: string — Filter nodes by tag
  types?: string[] — Filter edges by type (e.g., ["depends-on", "extends"])
  include_implicit?: boolean (default: false) — Include AI-inferred similarity edges

Response:
  nodes: Array<{ id, title, category?, tags? }>
  edges: Array<{ from, to, type, context? }>
```

#### graph_traverse
Multi-hop traversal from a starting document. Returns all reachable docs within N hops. Use for dependency analysis, impact assessment, or discovering related knowledge clusters.
```
Parameters:
  startDocId: string (required) — Document ID to start from
  depth?: number (default: 2, min: 1, max: 3) — Max hops
  edgeTypes?: string[] — Only follow these edge types
  direction?: "outbound" | "inbound" | "both" (default: "both")
  include_implicit?: boolean (default: false) — Include similarity edges

Response:
  nodes: Array<{ id, title, depth }>
  edges: Array<{ from, to, type }>
```

#### graph_find_path
Find shortest path between two documents. Returns the chain of documents connecting them with edge types.
```
Parameters:
  fromDocId: string (required) — Starting document ID
  toDocId: string (required) — Target document ID
  maxHops?: number (default: 5, min: 1, max: 10) — Maximum path length
  edgeTypes?: string[] — Only follow these edge types

Response:
  path: Array<{ id, title }> — Ordered list of documents from source to target
  edges: Array<{ from, to, type }> — Edges along the path
  length: number — Number of hops

  Returns error if no path found.
```

#### graph_suggest_links
AI suggests missing links by finding semantically similar docs not yet explicitly linked. Useful for enriching the knowledge graph and discovering hidden connections.
```
Parameters:
  docId: string (required) — Document to get suggestions for
  limit?: number (default: 5, min: 1, max: 20)

Response:
  suggestions: Array<{ id, title, score }> — Sorted by similarity
  documentId: string

  Similarity threshold: 0.5 (only sufficiently similar docs suggested)
```

#### graph_explain_connection
Explain why two documents are related. Shows direct links, shortest path, and similarity score.
```
Parameters:
  docId1: string (required) — First document ID
  docId2: string (required) — Second document ID

Response:
  directLinks: Array<{ type, context, direction: "forward" }>
  reverseLinks: Array<{ type, context, direction: "reverse" }>
  path: object | null — Shortest path if exists (max 5 hops)
  similarity: { score: number } | null — Semantic similarity (threshold: 0.3)
  connected: boolean — true if any connection found
```

#### graph_stats
Get knowledge graph statistics: node/edge counts, density, most connected documents, orphan nodes, and edge type distribution.
```
Parameters: (none)

Response:
  nodeCount: number
  edgeCount: number
  density: number
  orphanNodes: Array<{ id, title }> — Documents with no connections
  topConnected: Array<{ id, title, degree }> — Most connected documents
  edgeTypeDistribution: Record<string, number> — Count per edge type
```

> **Permission**: All graph tools require `doc:read` scope.

### Folder Tools (4 tools)

#### folder_create
Create folder in workspace.
```
Parameters:
  name: string (required)
  parentId?: string — Parent folder ID

Response:
  id: string
  name: string
  path: string (e.g., /Parent/Child)
```

#### folder_list
List folder tree.
```
Parameters:
  parentId?: string

Response:
  folders: Array<{ id, name, path, childCount }>
```

#### folder_update
Rename or move folder.
```
Parameters:
  id: string (required)
  name?: string
  parentId?: string

Response:
  id: string
  name: string
```

#### folder_delete
Delete folder (recurses if not empty).
```
Parameters:
  id: string (required)
  recursive?: boolean (default: false)
```

### Tag Tools (2 tools)

#### tag_list
List all tags in workspace.
```
Response:
  tags: Array<{ name, count }>
```

#### category_list
List document categories.
```
Response:
  categories: Array<{ id, name, icon }>
```

### Upload Tools (2 tools)

#### upload_file
Upload file to R2 storage (base64 encoded, max 2MB encoded ≈ 1.5MB actual).
```
Parameters:
  filename: string (required) — File name with extension (e.g., image.png)
  contentBase64: string (required) — Base64-encoded file content (max 2MB encoded)
  contentType: string (required) — MIME type (e.g., image/png, application/pdf)
  documentId?: string — Link upload to a document

Response:
  id: string
  filename: string
  url: string (CDN URL)
  size: number
```

#### upload_list
List uploaded files, optionally filtered by document.
```
Parameters:
  documentId?: string — Filter uploads by document ID

Response:
  uploads: Array<{ id, filename, url, size, createdAt }>
```

### Member Tools (3 tools)

#### member_list
List workspace members.
```
Response:
  members: Array<{
    id: string
    email: string
    role: "admin" | "editor" | "viewer" | "agent"
    joinedAt: ISO8601
  }>
```

#### member_update_role
Change member's role.
```
Parameters:
  memberId: string (required)
  role: "admin" | "editor" | "viewer" | "agent" (required)

Response:
  memberId: string
  role: string
```

#### member_remove
Remove member from workspace.
```
Parameters:
  memberId: string (required)
```

### API Key Tools (3 tools)

#### api_key_create
Create new API key (admin only).
```
Parameters:
  name: string (required)
  scopes: string[] — List of permission scopes

Response:
  id: string
  key: string (aw_xxxxx, shown once only)
  name: string
```

#### api_key_list
List API keys in workspace.
```
Response:
  keys: Array<{ id, name, scopes, createdAt, lastUsed?: ISO8601 }>
```

#### api_key_revoke
Revoke API key (admin only).
```
Parameters:
  keyId: string (required)
```

### Share Tools (1 tool)

#### share_link_create
Create shareable public link.
```
Parameters:
  docId: string (required)
  expiresIn?: number — Seconds until expiry (0 = never)

Response:
  token: string
  url: string (https://app.agentwiki.cc/share/{token})
  expiresAt?: ISO8601
```

## Resource Reference

Resources expose knowledge base state as queryable URIs for MCP clients.

| URI | MIME | Purpose |
|-----|------|---------|
| `agentwiki://documents` | application/json | All documents (paginated) |
| `agentwiki://documents/{id}` | text/markdown | Single document content |
| `agentwiki://documents/{id}/meta` | application/json | Document metadata |
| `agentwiki://folders` | application/json | Folder tree |
| `agentwiki://tags` | application/json | Tag index |
| `agentwiki://graph` | application/json | Knowledge graph |

### Example

Claude can reference: "Read agentwiki://documents?limit=5" to fetch 5 documents.

## Prompt Reference

Pre-built prompts for common knowledge-base operations.

### search_and_summarize
Perform hybrid search and summarize findings.
```
User provides: Query term or question
Server executes:
  1. search(query, type="hybrid", limit=10)
  2. Synthesize results into coherent summary
  3. Include document references
```

### create_from_template
Create document from predefined templates.
```
User provides: Document title, category
Server executes:
  1. Look up category template
  2. Pre-populate document skeleton
  3. Return partial document for user to complete

Categories: runbook, adr, onboarding, default
```

### explore_connections
Explore knowledge graph around a document.
```
User provides: Document ID
Server executes:
  1. Fetch document
  2. Find all linked documents (wikilinks)
  3. Visualize connection graph
  4. Suggest related documents
```

### review_document
Review document for quality.
```
User provides: Document ID
Server executes:
  1. Fetch document
  2. Analyze content (length, structure, links)
  3. Suggest improvements (add links, tags, etc.)
  4. Check for orphaned documents
```

## Local Development

### Prerequisites
- Node.js 20+
- pnpm 9.15+

### Setup

```bash
# Clone and install
git clone https://github.com/digitopvn/agentwiki.git
cd agentwiki
pnpm install

# Start MCP server locally
pnpm -F @agentwiki/mcp dev
# Runs on http://localhost:8787/mcp

# Health check
curl http://localhost:8787/health
# Response: {"status": "ok", "timestamp": "2026-03-19T..."}
```

### Environment Variables

Create `packages/mcp/.env.local`:
```env
# Cloudflare bindings (local dev uses bindings from wrangler.toml)
# For miniflare simulation:
MINIFLARE_PERSISTENCE_DIR=./.wrangler

# API configuration
APP_URL=http://localhost:8787
API_URL=http://localhost:8787  # Optional: for microservice setup
```

### Testing Tools

```bash
# Create test API key (via web UI first)
API_KEY=aw_xxxxx

# Test search
curl -X POST http://localhost:8787/mcp \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "call_tool",
    "params": {
      "name": "search",
      "arguments": {"query": "authentication"}
    }
  }'

# Test document list
curl -X POST http://localhost:8787/mcp \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "call_tool",
    "params": {
      "name": "document_list",
      "arguments": {"limit": 5}
    }
  }'
```

## Deployment

### Production Deployment

MCP server shares Cloudflare Workers bindings with REST API.

```bash
# Build
pnpm -F @agentwiki/mcp build

# Deploy to production
pnpm -F @agentwiki/mcp deploy

# Health check
curl https://mcp.agentwiki.cc/health
```

### Shared Bindings

MCP server and API both access:
- **D1**: SQLite database (same data)
- **R2**: File storage
- **KV**: Cache layer
- **Vectorize**: Vector index for semantic search
- **Queues**: Async job processing
- **Workers AI**: Summarization & embeddings

No separate database or services needed.

### Cloudflare Configuration

MCP server uses same `wrangler.toml` bindings as API. See [Deployment Guide](./deployment-guide.md#production-deployment) for setup.

```toml
[[d1_databases]]
binding = "DB"
database_name = "agentwiki-main"

[[r2_buckets]]
binding = "R2"
bucket_name = "agentwiki-files"

[[kv_namespaces]]
binding = "KV"
id = "xxx-xxx"

[[vectorize]]
binding = "VECTORIZE"
index_name = "agentwiki-vectors"

[[queues.producers]]
binding = "QUEUE"
queue = "agentwiki-jobs"
```

## Architecture

### Request Flow

```
Claude/Cursor
     │
     │ POST /mcp
     │ x-api-key: aw_xxxxx
     │
     ▼
Cloudflare Workers
     │
     ├─→ API Key Middleware
     │   └─→ Verify key, extract tenant
     │
     ├─→ MCP Server
     │   ├─→ Tools Handler
     │   ├─→ Resources Handler
     │   └─→ Prompts Handler
     │
     └─→ Shared Services (via API context)
         ├─→ D1 Database
         ├─→ R2 Storage
         ├─→ Vectorize Index
         ├─→ KV Cache
         └─→ Workers AI
```

### Auditing

All MCP operations are logged to `audit_logs` table:
```sql
INSERT INTO audit_logs
  (tenant_id, user_id, action, resource, details)
VALUES
  ('tenant_x', 'agent_key_id', 'document_create', 'doc_y', {metadata})
```

Audit entries include:
- Tool called (e.g., document_create)
- API key ID (identifies agent)
- Tenant ID (workspace isolation)
- Timestamp
- Parameters (sanitized)
- Error (if failed)

## Security Considerations

### API Key Security
- Keys never logged in plaintext
- PBKDF2 hashed with 100k iterations
- Key rotation recommended annually
- Scope-based access (least privilege)
- Immutable once created

### Multi-Tenancy
- All queries filtered by tenant
- API key bound to single tenant
- Cross-tenant access impossible
- Tenant ID extracted at middleware

### Rate Limiting
- Default: 100 requests/min per key
- Tracked in KV cache
- Returns 429 Too Many Requests
- Configurable per key

### CORS
- Fully enabled for POST /mcp
- Allows Origin: *
- Allows all headers and methods
- Appropriate for model context protocol

## Troubleshooting

### Common Issues

**Issue**: 401 Unauthorized
```
Error: Invalid or missing API key
```
**Solution**: Verify API key exists, not revoked, and matches tenant

**Issue**: 403 Forbidden
```
Error: Insufficient permissions for this operation
```
**Solution**: Check API key scopes include required permission

**Issue**: 429 Rate Limited
```
Error: Too many requests
```
**Solution**: Wait before retrying or increase rate limit via admin UI

**Issue**: Tool returns empty results
```
Error: No documents found (0 results)
```
**Solution**: Check documents exist in workspace; verify search terms

**Issue**: MCP connection fails in Claude Desktop
```
Error: Could not connect to MCP server
```
**Solution**: Verify URL, API key, network connectivity

## References

- [Model Context Protocol Spec](https://modelcontextprotocol.io)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers)
- [Agent Integration Guide](./deployment-guide.md#4b-deploy-mcp-worker)
- [REST API Reference](../README.md#api-endpoints)
- [System Architecture](./system-architecture.md)
