# AgentWiki: System Architecture

Comprehensive architecture documentation covering layers, data flow, deployment topology, and key design patterns.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend Layer                       │
│        React 19 + BlockNote + TailwindCSS v4               │
│      Cloudflare Pages (app.agentwiki.cc)                   │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS REST API
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    API Gateway Layer                        │
│       Hono on Cloudflare Workers (api.agentwiki.cc)        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Routes: Auth, Documents, Folders, Search, Upload...  │  │
│  │ Middleware: AuthGuard, RateLimit, Permission Check   │  │
│  │ Services: DocumentService, SearchService, etc.       │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
     ┌──────────────────┼──────────────────┐
     │                  │                  │
┌────▼──────────────┐   │          ┌───────▼────────────┐
│   MCP Server      │   │          │   Shared Bindings  │
│ Cloudflare Worker │   │          │  (D1, R2, KV, AI)  │
│ (mcp.agentwiki.cc)    │          │                    │
│ ┌────────────────┐    │          └────────────────────┘
│ │ 25 Tools       │    │
│ │ 6 Resources    │    │
│ │ 4 Prompts      │    │
│ │ Auth: API Keys │    │
│ └────────────────┘    │
└──────────────────────┘│
                        │
        ┌───────────────┼───────────────┐
        │               │               │
    ┌───▼──┐        ┌───▼──┐      ┌───▼────────┐
    │  D1  │        │  R2  │      │ Workers AI │
    │(SQL) │        │Files │      │+ Vectorize │
    └──────┘        └──────┘      └────────────┘
        │
    ┌───▼──┐
    │  KV  │
    │Cache │
    └──────┘
        │
    ┌───▼────┐
    │ Queue  │
    └────────┘
```

## Layered Architecture

### 1. Presentation Layer (Frontend)

**Technology**: React 19, Vite, TailwindCSS v4, BlockNote

**Responsibilities**:
- User authentication UI (OAuth login page)
- Document editor (BlockNote WYSIWYG)
- Folder tree navigation
- Search interface (Cmd+K command palette)
- Settings & API key management
- Document sharing & publishing

**Data Flow**:
- Fetches user data via `/api/auth/me`
- Subscribes to document list via `/api/documents` (React Query)
- Publishes changes via `/api/documents/:id` (PATCH)
- Searches via `/api/search?q=...`

**State Management**:
- **Zustand**: Global UI state (open tabs, sidebar collapse, theme)
- **React Query**: Server state (documents, folders, search results)
- **Local**: Component state (editor content before save)

### 2. API Layer (Backend)

**Technology**: Hono framework on Cloudflare Workers

**Responsibilities**:
- HTTP request routing
- Authentication (OAuth, JWT, API keys)
- Authorization (RBAC via middleware)
- Input validation (Zod schemas)
- Business logic orchestration
- Response serialization

**Request Flow**:
```
Incoming Request
    ↓
CORS Middleware
    ↓
Logger Middleware
    ↓
Rate Limiter (check KV)
    ↓
Auth Guard (validate JWT/API key)
    ↓
Permission Middleware (check user role)
    ↓
Route Handler
    ├─ Call Service Layer
    ├─ Interact with Database
    └─ Enqueue async jobs
    ↓
Response (JSON)
```

**Key Routes** (9 route groups, ~20 endpoints):
- `/api/auth` — OAuth, JWT refresh, logout
- `/api/documents` — Full CRUD + versions
- `/api/folders` — Tree operations
- `/api/search` — Hybrid search
- `/api/uploads` — R2 file handling
- `/api/share` — Share links & publishing
- `/api/keys` — API key management
- `/api/tags` — Tag enumeration
- `/api/graph` — Document graph export

### 3. MCP Server Layer (Agent Integration)

**Technology**: Model Context Protocol (MCP) on Cloudflare Workers

**Deployment**: `mcp.agentwiki.cc` (stateless HTTP)

**Responsibilities**:
- Expose AgentWiki capabilities via standardized MCP protocol
- Enable AI agents to manage documents, search, and collaborate
- Provide 25 MCP tools covering core operations
- Offer 6 context resources for multi-step AI workflows
- Supply 4 system prompts for consistent agent behavior

**Authentication**:
- API keys (format: `aw_*`) via header, Bearer token, or query param
- PBKDF2 hashing with scope-based RBAC (same as REST API)
- Key validation against `api_keys` table

**Direct Bindings**:
- Shares same D1, R2, KV, Vectorize, Queue, and AI bindings as REST API
- Code reuse: Imports services from `packages/api`

**Tool Categories** (25 tools):

| Category | Count | Examples |
|----------|-------|----------|
| Documents | 7 | create, read, update, delete, list, get versions, extract links |
| Search & Graph | 4 | keyword search, semantic search, get graph, analyze relationships |
| Folders | 4 | create, move, list, delete |
| Tags | 2 | add tag, list tags |
| Uploads | 2 | upload file, delete upload |
| Members | 2 | invite user, list members |
| API Keys | 2 | create key, revoke key |
| Sharing | 2 | create share link, revoke share link |

**Resources** (6 total):
- Document contents (full markdown)
- Search results (snippets + metadata)
- Folder structure (tree view)
- Member list (team info)
- API key metadata (for audit)
- Share link status

**Prompts** (4 system prompts):
- Wiki writer (document creation)
- Research assistant (search + analysis)
- Team coordinator (member management)
- Knowledge architect (graph analysis)

**Request Format**:
```
POST /mcp/message HTTP/1.1
Host: mcp.agentwiki.cc
Authorization: Bearer aw_key_xxxxx
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "create_document",
    "arguments": { "title": "...", "content": "..." }
  }
}
```

### 4. Service Layer

**Responsibilities**:
- Pure business logic (no HTTP concerns)
- Database transactions
- Multi-step workflows
- External service calls (OAuth, Vectorize)

**Key Services**:

#### AuthService
- OAuth profile fetching (Google, GitHub)
- JWT signing & verification
- Session token hashing
- User creation/retrieval

#### DocumentService
- CRUD operations
- Version history tracking
- Wikilink extraction
- Category/tag association

#### SearchService
- Keyword search via D1 FTS
- Semantic search via Vectorize
- Reciprocal Rank Fusion (RRF) combining results
- Caching recent searches in KV

#### EmbeddingService
- Query vectorization (bge-base-en)
- Batch document embedding
- Vectorize API integration

#### UploadService
- R2 presigned URL generation
- File metadata tracking
- Cleanup of orphaned files

#### ShareService
- Token generation (random 32-byte hex)
- Expiration tracking
- Public access validation

### 5. Data Access Layer (Drizzle ORM)

**Technology**: Drizzle ORM on Cloudflare D1 (SQLite)

**Responsibilities**:
- Type-safe query building
- Schema definition
- Migration management
- Multi-tenant isolation (via tenantId filtering)

**Query Patterns**:
```typescript
// List documents in tenant
await db
  .select()
  .from(documents)
  .where(eq(documents.tenantId, tenantId))
  .limit(20)

// Create document + version in transaction
await db.transaction(async (tx) => {
  await tx.insert(documents).values({ id, tenantId, title, ... })
  await tx.insert(documentVersions).values({ documentId: id, version: 1, ... })
})
```

### 6. Data Storage Layer

#### D1 (SQLite Database)
- **Multi-tenant schema**: All tables have `tenantId` column
- **Soft deletes**: `deletedAt` timestamp (not hard delete)
- **Append-only**: `documentVersions` table never updated
- **Audit trail**: `auditLogs` table tracks all actions
- **Indexes**: On `tenantId`, `userId`, `createdAt`, `slug`

#### R2 (Object Storage)
- **File structure**: `{tenantId}/{documentId}/{fileKey}`
- **Metadata**: Stored in `uploads` table (D1)
- **Lifecycle**: Orphaned files cleaned up after 30 days
- **CDN**: Cloudflare CDN caches R2 responses

#### KV (Cache)
- **Rate limit buckets**: `ratelimit:{ipOrKey}` (1-hour TTL)
- **Session tokens**: `session:{tokenHash}` (7-day TTL)
- **Search cache**: `search:{tenantId}:{query}` (1-hour TTL)
- **Presigned URLs**: `presignedUrl:{id}` (15-min TTL)

## Data Flow: Document Creation

```
1. User clicks "New Document" in React UI
   ↓
2. Renders modal with title input
   ↓
3. User submits form
   POST /api/documents
   Body: { title: "...", content: "...", folderId: "..." }
   Header: Authorization: Bearer {jwt}
   ↓
4. API Server receives request
   - AuthGuard validates JWT
   - PermissionMiddleware checks role >= 'editor'
   - Zod schema validates request
   ↓
5. documentService.create() called
   - Generates ID + slug
   - Inserts document row (D1)
   - Inserts initial version (append-only)
   - Extracts wikilinks, inserts into documentLinks
   ↓
6. Queue message enqueued for async processing
   { type: 'embed', documentId, content }
   { type: 'summarize', documentId, content }
   ↓
7. auditLog written
   { action: 'document:create', resourceId: id, resourceType: 'document' }
   ↓
8. Response returned to client
   { id, title, slug, createdAt, ... }
   ↓
9. React Query invalidates 'documents' cache
   ↓
10. UI refetches document list
   ↓
11. In background: Queue consumer processes messages
    - Calls Workers AI for embedding
    - Calls Vectorize to index vector
    - Calls Workers AI for summary
    - Updates document.summary field
```

## Data Flow: Search Query

```
1. User types in search box
   ↓
2. 300ms debounce delay
   ↓
3. React Query fires GET /api/search?q=query&type=hybrid
   ↓
4. SearchService.searchDocuments() called
   ├─ Check KV cache (searchCache key)
   │  ├─ Hit: return cached results
   │  └─ Miss: continue to step 5
   ↓
5. Parallel execution:
   ├─ Keyword search:
   │  └─ SELECT * FROM documents WHERE tenantId=? AND (title LIKE ? OR content LIKE ?)
   │     Returns: [{ id, title, slug, snippet }, ...]
   │
   └─ Semantic search:
      └─ Call Vectorize.query(embeddedQuery, { limit: 20 })
         Returns: [{ id, score }, ...] (pre-filtered by tenantId in Vectorize index)
   ↓
6. RRF (Reciprocal Rank Fusion) combines both result sets
   - Assigns rank-based scores: 1 / (k + rank)
   - Merges duplicate IDs, sums scores
   - Sorts by total score descending
   ↓
7. Cache results in KV (1-hour TTL)
   ↓
8. Return fused results to client
   { results: [{ id, title, snippet, score }, ...], count, elapsed }
   ↓
9. React renders search results with preview
```

## Authentication & Authorization Flow

### OAuth Login Flow
```
1. User visits app.agentwiki.cc, clicks "Sign in with Google"
   ↓
2. Frontend redirects to /api/auth/google
   ↓
3. API calls Google's OAuth authorization endpoint
   ↓
4. User authorizes in Google login modal
   ↓
5. Google redirects to callback URL with code
   ↓
6. API exchanges code for access token
   ↓
7. API fetches user profile (name, email, avatar)
   ↓
8. API checks if user exists:
   ├─ Exists: load user
   └─ New: create user, create default tenant, add membership
   ↓
9. API generates:
   - JWT (15 min expiry): { userId, tenantId, email, role, iat, exp }
   - Refresh token (7 days): hash stored in D1 sessions table
   ↓
10. API redirects frontend to /?token={jwt}&refresh={refreshTokenId}
    ↓
11. Frontend stores JWT in memory, refresh token in HttpOnly cookie
    ↓
12. Frontend redirects to /app
```

### Request Authentication (JWT)
```
Client sends: Authorization: Bearer {jwt}
   ↓
AuthGuard middleware:
  ├─ Extract token from header
  ├─ Verify signature (HMAC-SHA256)
  ├─ Check expiry
  ├─ Parse payload
  └─ Store user context in c.set('user', payload)
   ↓
Middleware continues if valid, returns 401 if invalid
```

### API Key Authentication
```
Client sends: Authorization: Bearer aw_xxxxx...
   ↓
AuthGuard middleware:
  ├─ Check key format (starts with "aw_")
  ├─ Extract key hash from apiKeys table
  ├─ Timing-safe compare (PBKDF2)
  ├─ Load user/tenant/role from apiKeys record
  └─ Store user context
   ↓
Proceed if hash matches
```

### Authorization (RBAC)
```
After auth, middleware checks permission:

Role hierarchy:
  ├─ admin     → All actions
  ├─ editor    → Create/edit documents, manage folders
  ├─ viewer    → Read-only
  └─ agent     → API-only (no UI), document:read scoped

Permission matrix:
  document:create     → editor, admin
  document:read       → viewer, editor, admin, agent
  document:update     → editor, admin (own documents only)
  document:delete     → admin (own documents only)
  document:share      → editor, admin
  folder:create       → editor, admin
  user:invite         → admin
  key:manage          → admin

Example middleware:
  if (action === 'document:update' && user.role === 'viewer') {
    return 401 Unauthorized
  }
```

## Async Processing Pipeline

### Queue Architecture
```
Document created/updated
    ↓
Enqueue job message(s) to Cloudflare Queues
    ├─ { type: 'embed', documentId, content, tenantId }
    └─ { type: 'summarize', documentId, content, tenantId }
    ↓
Queue consumer (in same Worker)
    ↓
handleQueueBatch() processes messages
    ├─ For each 'embed' message:
    │  ├─ Call Workers AI to generate embedding
    │  ├─ Push vector to Vectorize
    │  └─ Update document vector_id
    │
    └─ For each 'summarize' message:
       ├─ Call Workers AI to generate summary
       └─ Update document.summary
    ↓
On failure:
    ├─ Log error
    ├─ Retry up to 3 times
    └─ Dead-letter queue after max retries
```

**Why Async?**:
- Embedding generation is CPU-intensive (bge-base-en model)
- Users don't wait for AI processing
- Separates concerns (save vs. enrich)
- Handles large documents without timeouts

## Security Architecture

### Network Security
```
┌─────────────────────────────────┐
│    Cloudflare WAF Rules         │
│  (DDoS, Bot Protection)         │
└──────────────┬──────────────────┘
               │
┌──────────────▼──────────────────┐
│    HTTPS Only                   │
│  (Enforced via CF)              │
└──────────────┬──────────────────┘
               │
┌──────────────▼──────────────────┐
│  CORS Headers                   │
│  Allow: app.agentwiki.cc origins│
│  Credentials: true              │
└──────────────┬──────────────────┘
               │
┌──────────────▼──────────────────┐
│  Security Headers               │
│  X-Content-Type-Options: nosniff│
│  X-Frame-Options: DENY          │
│  X-XSS-Protection: 1; mode=block│
│  CSP: default-src 'self'        │
└─────────────────────────────────┘
```

### Data Security
- **At Rest**: D1 SQLite (Cloudflare manages encryption)
- **In Transit**: HTTPS/TLS 1.3
- **API Keys**: PBKDF2 with 100k iterations + salt
- **Tokens**: HMAC-SHA256 signed JWT
- **Audit Logs**: Immutable (append-only, never deleted)

### Access Control
- **Authentication**: OAuth 2.0 + JWT + API keys
- **Authorization**: RBAC (4 roles) enforced at middleware
- **Multi-tenancy**: `tenantId` filtering on all queries
- **Session Management**: Refresh tokens revokable via sessions table

### Secrets Management
- Environment variables stored in Cloudflare (not in code)
- OAuth secrets in `.env` (not committed)
- API keys hashed on storage, never logged

## Deployment Architecture

### Frontend (Cloudflare Pages)
```
Git Push (main branch)
   ↓
GitHub webhook → Cloudflare Pages
   ↓
Build: npm run build (Vite)
   ↓
Assets uploaded to CF CDN
   ↓
Deploy to edge globally
   ↓
Available at: https://app.agentwiki.cc
```

**Deployment Files**:
- `packages/web/vite.config.ts` — Bundler config
- `packages/web/package.json` — Build script
- `.github/workflows/ci.yml` — CI/CD trigger

### Backend (Cloudflare Workers)
```
Git Push (main branch)
   ↓
GitHub Actions CI
   ├─ pnpm install
   ├─ type-check
   ├─ lint
   └─ build
   ↓
Wrangler deploy (if CI passes)
   ├─ Upload JavaScript to CF
   ├─ Configure bindings (D1, R2, KV, etc)
   └─ Activate new version
   ↓
Available at: https://api.agentwiki.cc
```

**Deployment Config**:
- `packages/api/wrangler.toml` — Bindings, environment
- `.github/workflows/ci.yml` — Deploy on main
- `packages/api/package.json` — Deploy script

### Database (Cloudflare D1)
```
D1 Database Created
   ↓
Initial schema applied via migrations
   ↓
Drizzle migrations tracked in DB
   ↓
Future schema changes:
   ├─ Update schema.ts
   ├─ Run: pnpm db:generate
   ├─ Test locally: pnpm db:migrate
   └─ Deploy: pnpm db:migrate:remote (applies on production DB)
```

### Infrastructure Summary
| Component | Cloudflare Service | Scaling |
|-----------|-------------------|---------|
| Frontend | Pages | Auto (CDN) |
| API | Workers | Auto (compute) |
| Database | D1 | Manual sharding at 10GB |
| Storage | R2 | Auto (object storage) |
| Cache | KV | Auto (global KV) |
| Vectors | Vectorize | Auto (managed service) |
| Async Jobs | Queues | Auto (message queue) |
| Compute (AI) | Workers AI | Auto (GPU) |

## Scalability Considerations

### Single-Tenant Growth
- **Documents**: Index on `tenantId`, `createdAt` for pagination
- **Search**: Cache recent queries in KV (1-hour TTL)
- **Embeddings**: Batch processing via Queue (don't block saves)
- **Rate Limits**: Per API key in KV (distributes globally)

### Multi-Tenant Growth
- **Current**: All tenants in single D1 database
- **At 10GB**: Auto-shard to new D1 instance
- **Sharding**: Partition by `tenantId % shard_count`
- **Routing**: Middleware determines shard from tenantId

### Performance Targets
| Metric | Target | How |
|--------|--------|-----|
| API latency p95 | <500ms | Indexes, KV cache, async jobs |
| Page load | <3s | Cloudflare Pages CDN |
| Search p99 | <2s | RRF fusion, KV cache |
| Document save | <200ms | Async embedding/summary |

## Monitoring & Observability

### Logging
- **API**: Hono logger outputs to stdout (visible in CF dashboard)
- **Services**: console.error for failures
- **Database**: Slow query logging (queries >1s)
- **Queue**: Failed job tracking

### Audit Trail
- Every action logged to `auditLogs` table
- Includes: user, action, resource, IP, timestamp
- Queryable for compliance audits

### Metrics
- Monitor via Cloudflare Analytics Engine (future)
- Alert on: Error rate >1%, latency p95 >1s, DB connection errors

## Disaster Recovery

### Backup Strategy
- **D1**: Cloudflare manages daily backups (not customer-controllable)
- **R2**: Versioning enabled (point-in-time restore)
- **Manual**: Export documents as Markdown exports

### Failover
- **Frontend**: Cloudflare Pages global CDN (no failover needed)
- **API**: Workers global distribution (auto-failover)
- **Database**: D1 region selection + CF managed replication

## API Response Format

### Success Response
```json
{
  "data": {
    "id": "doc_123",
    "title": "Example",
    ...
  },
  "meta": {
    "timestamp": 1710766800000,
    "version": "v1"
  }
}
```

### Error Response
```json
{
  "error": "Validation error",
  "code": "VALIDATION_FAILED",
  "details": [
    { "field": "title", "message": "Title is required" }
  ],
  "timestamp": 1710766800000
}
```

### Pagination
```json
{
  "data": [...],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 150,
    "hasMore": true
  }
}
```

## Rate Limiting

### Limits (per API key or IP)
- **Anonymous**: 100 req/min
- **Authenticated**: 1000 req/hour
- **Search**: 50 queries/min
- **File uploads**: 5 files/min (50MB/day)

### Implementation
```
Middleware checks: ratelimit:{ipOrKey} in KV
├─ If not found: create with count=1, TTL=1 hour
├─ If found: increment counter
├─ If exceeds limit: return 429 Too Many Requests
└─ After 1 hour: KV expires, reset counter
```

## Caching Strategy

| Resource | Method | TTL | Invalidation |
|----------|--------|-----|--------------|
| User session | JWT | 15 min | Expired |
| Refresh token | KV | 7 days | Logout, revoke |
| Document list | React Query | 30 sec | Manual invalidate |
| Search results | KV | 1 hour | Manual |
| Share tokens | KV | Until expiry | Token expiry |
| R2 files | CF CDN | 24 hours | Cloudflare |
| API responses | React Query | 30 sec | Mutation |
