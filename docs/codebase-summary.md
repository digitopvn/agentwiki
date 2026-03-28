# AgentWiki: Codebase Summary

Auto-generated from `repomix-output.xml`. Last updated: 2026-03-26.

## Overview

AgentWiki is a **monorepo** containing five packages orchestrated by Turborepo and pnpm. Total: ~8,500 LOC of TypeScript (implementation) + ~650 LOC (search eval), 15 database tables, 8 Cloudflare bindings. Latest: QMD-inspired search improvements (Phase 5.5) with position-aware RRF, parallel query expansion, and search eval harness.

### Package Statistics

| Package | LOC | Files | Purpose |
|---------|-----|-------|---------|
| `@agentwiki/api` | ~3,300 | 40 | Hono backend on Cloudflare Workers |
| `@agentwiki/mcp` | 1,420 | 16 | Model Context Protocol server (AI agents) |
| `@agentwiki/web` | 1,880 | 23 | React 19 frontend on Cloudflare Pages |
| `@agentwiki/cli` | 318 | 2 | Commander.js CLI tool |
| `@agentwiki/shared` | 227 | 6 | Types, schemas, constants |
| **Total Implementation** | **~8,500** | **~90** | **All packages** |
| `tests/search-eval/` | 658 | 6 | Search quality metrics & eval harness (NEW) |
| `plans/reports/` | ~1,945 | 4 | QMD research & implementation reports |

## Directory Structure

```
agentwiki/
├── .github/
│   └── workflows/
│       └── ci.yml                  — CI/CD pipeline (lint, type-check, build)
├── packages/
│   ├── api/
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   ├── schema.ts       — Drizzle table definitions (15 tables, +contentHash on documents, +description on folders)
│   │   │   │   └── migrations/     — Auto-generated SQL migrations (includes 0005_add_fts5_and_content_hash.sql)
│   │   │   ├── middleware/
│   │   │   │   ├── auth-guard.ts   — JWT/API key validation
│   │   │   │   ├── internal-auth.ts — Shared secret auth for internal endpoints
│   │   │   │   ├── rate-limiter.ts — IP & key-based rate limiting
│   │   │   │   └── require-permission.ts — RBAC enforcement
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts         — OAuth + JWT endpoints
│   │   │   │   ├── api-keys.ts     — Key management CRUD
│   │   │   │   ├── documents.ts    — Document CRUD + versions
│   │   │   │   ├── folders.ts      — Folder tree operations
│   │   │   │   ├── tags.ts         — Tag enumeration
│   │   │   │   ├── uploads.ts      — R2 file upload/serve + download tokens
│   │   │   │   ├── internal.ts     — Internal API (extraction, admin)
│   │   │   │   ├── search.ts       — Hybrid search endpoint
│   │   │   │   ├── share.ts        — Sharing & publishing
│   │   │   │   ├── graph.ts        — Document graph (Cytoscape)
│   │   │   │   └── ai.ts           — AI generation, transform, suggest endpoints
│   │   │   ├── ai/
│   │   │   │   ├── interface.ts    — AIProvider interface definition
│   │   │   │   ├── registry.ts     — Provider registry (OpenAI, Anthropic, etc)
│   │   │   │   ├── service.ts      — AI orchestration service
│   │   │   │   ├── prompt-builder.ts — System prompt construction
│   │   │   │   ├── openai-adapter.ts — OpenAI provider
│   │   │   │   ├── anthropic-adapter.ts — Anthropic provider
│   │   │   │   ├── google-gemini-adapter.ts — Google Gemini provider
│   │   │   │   ├── openrouter-adapter.ts — OpenRouter provider
│   │   │   │   ├── minimax-adapter.ts — MiniMax provider
│   │   │   │   └── alibaba-adapter.ts — Alibaba provider
│   │   │   ├── services/
│   │   │   │   ├── auth-service.ts — OAuth profile fetch, JWT signing
│   │   │   │   ├── api-key-service.ts — Key hashing (PBKDF2)
│   │   │   │   ├── document-service.ts — Document business logic
│   │   │   │   ├── folder-service.ts — Folder tree operations
│   │   │   │   ├── upload-service.ts — R2 presigned URLs
│   │   │   │   ├── search-service.ts — Hybrid search (docs + storage, source param, position-aware RRF, parallel expansion, folder context)
│   │   │   │   ├── storage-search-service.ts — Keyword & semantic search on uploads (SP3)
│   │   │   │   ├── embedding-service.ts — Vectorize integration, smart chunking, content hash skip
│   │   │   │   ├── fts5-search-service.ts — FTS5/BM25 search (NEW, ready for evaluation)
│   │   │   │   ├── query-expansion-service.ts — AI query expansion (NEW, parallel via Promise.all)
│   │   │   │   ├── share-service.ts — Share link tokens
│   │   │   │   ├── publish-service.ts — Public page generation
│   │   │   │   ├── extraction-service.ts — VPS result callback handler
│   │   │   │   ├── extraction-job-dispatcher.ts — Job dispatch + token mgmt
│   │   │   │   ├── extraction-retry-service.ts — Stuck job retry logic
│   │   │   │   └── import-service.ts — Multi-source import (Obsidian, Notion, LarkSuite adapters)
│   │   │   ├── queue/
│   │   │   │   └── handler.ts      — Queue consumer (embeddings, summaries, FTS5 indexing, content hash skip)
│   │   │   ├── utils/
│   │   │   │   ├── crypto.ts       — JWT, token hashing, key generation
│   │   │   │   ├── encryption.ts   — Provider key encryption/decryption
│   │   │   │   ├── audit.ts        — Audit log writing
│   │   │   │   ├── slug.ts         — URL-safe slug generation
│   │   │   │   ├── pagination.ts   — Cursor-based pagination
│   │   │   │   ├── chunker.ts      — Smart markdown chunking (heading chains, code protection, overlap guard)
│   │   │   │   ├── rrf.ts          — Position-aware Reciprocal Rank Fusion with signal weighting
│   │   │   │   ├── hash.ts         — SHA-256 content hash (NEW)
│   │   │   │   ├── folder-context.ts — Folder hierarchy + description enrichment (NEW)
│   │   │   │   └── wikilink-extractor.ts — Parse [[WikiLinks]]
│   │   │   ├── env.ts              — Cloudflare bindings type defs
│   │   │   └── index.ts            — Hono app setup (77 lines)
│   │   ├── wrangler.toml           — Cloudflare config (D1, R2, KV, Vectorize, Queues)
│   │   ├── drizzle.config.ts       — Drizzle migration setup
│   │   └── package.json            — Dependencies (Hono, Drizzle, Arctic, etc)
│   ├── mcp/
│   │   ├── src/
│   │   │   ├── server.ts           — McpServer factory with 25 tools + 6 resources
│   │   │   ├── index.ts            — Cloudflare Worker entry point
│   │   │   ├── env.ts              — Cloudflare bindings & auth context types
│   │   │   ├── auth/
│   │   │   │   └── api-key-auth.ts — PBKDF2 key validation + scope check
│   │   │   ├── tools/
│   │   │   │   ├── document-tools.ts — 7 document CRUD tools
│   │   │   │   ├── search-and-graph-tools.ts — 4 search & graph tools (with source param SP3)
│   │   │   │   ├── folder-tools.ts — 4 folder tree tools
│   │   │   │   ├── tag-tools.ts    — 2 tag management tools
│   │   │   │   ├── upload-tools.ts — 2 file upload tools
│   │   │   │   ├── member-tools.ts — 2 team member tools
│   │   │   │   ├── api-key-tools.ts — 2 API key tools
│   │   │   │   └── share-tools.ts  — 2 sharing tools
│   │   │   ├── resources/
│   │   │   │   └── wiki-resources.ts — 6 context resources (documents, search, folders, members, keys, shares)
│   │   │   ├── prompts/
│   │   │   │   └── wiki-prompts.ts — 4 system prompts for AI agents
│   │   │   └── utils/
│   │   │       ├── audit-logger.ts — MCP action logging
│   │   │       └── mcp-error-handler.ts — Error serialization for MCP
│   │   ├── wrangler.toml           — Cloudflare config (shares D1, R2, KV, etc with API)
│   │   └── package.json            — Dependencies (MCP SDK, shared types)
│   ├── web/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── layout/
│   │   │   │   │   ├── layout.tsx           — 3-panel shell (mobile: CSS transform drawers with swipe)
│   │   │   │   │   ├── sidebar.tsx          — Left sidebar wrapper
│   │   │   │   │   ├── main-panel.tsx       — Center editor area
│   │   │   │   │   └── metadata-panel.tsx   — Right metadata sidebar
│   │   │   │   ├── sidebar/
│   │   │   │   │   ├── folder-tree.tsx      — Recursive folder tree
│   │   │   │   │   └── folder-node.tsx      — Single folder node
│   │   │   │   ├── editor/
│   │   │   │   │   ├── editor.tsx           — BlockNote wrapper + AI + auto-save (2s debounce)
│   │   │   │   │   ├── tab-bar.tsx          — Tab strip
│   │   │   │   │   ├── tab-item.tsx         — Single tab
│   │   │   │   │   ├── welcome-screen.tsx   — Empty state
│   │   │   │   │   ├── ai-slash-commands.ts — 5 AI slash commands for editor
│   │   │   │   │   └── ai-selection-toolbar.tsx — 6 AI toolbar actions for text
│   │   │   │   ├── storage/
│   │   │   │   │   ├── storage-drawer.tsx       — File management drawer (SP2) + markdown drop support
│   │   │   │   │   ├── storage-file-card.tsx   — File card with status & delete
│   │   │   │   │   └── upload-progress-list.tsx — Active upload progress bars
│   │   │   │   ├── metadata/
│   │   │   │   │   ├── document-properties.tsx — Title, category, access level
│   │   │   │   │   ├── tag-editor.tsx       — Tag management UI
│   │   │   │   │   └── version-history.tsx  — Version timeline
│   │   │   │   ├── settings/
│   │   │   │   │   ├── ai-settings-tab.tsx  — AI provider + usage dashboard (sortable drag-reorder, updated models)
│   │   │   │   │   ├── members-tab.tsx      — Team member CRUD with email invites
│   │   │   │   │   ├── api-keys-tab.tsx     — API key create/revoke with one-time key display
│   │   │   │   │   ├── storage-config-card.tsx — File grid + custom R2 credentials config
│   │   │   │   │   └── shortcuts-tab.tsx    — Keyboard shortcut view & rebinding
│   │   │   │   └── command-palette/
│   │   │   │       └── command-palette.tsx  — Cmd+K search (cmdk)
│   │   │   ├── hooks/
│   │   │   │   ├── use-auth.ts             — Auth state (user, login, logout)
│   │   │   │   ├── use-documents.ts        — Document list & cache (React Query)
│   │   │   │   ├── use-folders.ts          — Folder tree (React Query)
│   │   │   │   ├── use-uploads.ts          — Upload list & deletion (React Query)
│   │   │   │   ├── use-upload-with-progress.ts — XHR upload with progress tracking
│   │   │   │   ├── use-ai.ts               — AI generation & streaming
│   │   │   │   ├── use-ai-settings.ts      — AI settings & provider config (sortable reorder)
│   │   │   │   └── use-storage-settings.ts — Storage config CRUD (custom R2 creds)
│   │   │   ├── stores/
│   │   │   │   └── app-store.ts     — Zustand (tabs, panel collapse, theme, storage drawer, upload queue)
│   │   │   ├── lib/
│   │   │   │   ├── api-client.ts    — Axios with auth header
│   │   │   │   ├── ai-stream-reader.ts — Stream response parser
│   │   │   │   └── utils.ts         — Helpers (cn, formatDate, etc)
│   │   │   ├── routes/
│   │   │   │   ├── login.tsx        — Login page (OAuth buttons)
│   │   │   │   └── settings.tsx      — Settings page (AI configuration tab)
│   │   │   ├── app.tsx              — Router setup (React Router v7)
│   │   │   ├── main.tsx             — React 19 render entry
│   │   │   ├── index.css            — TailwindCSS styles
│   │   │   └── index.html           — HTML skeleton
│   │   ├── vite.config.ts           — Vite + React plugin + Tailwind
│   │   ├── tsconfig.json            — Strict mode TypeScript config
│   │   └── package.json             — Dependencies (React 19, Vite, BlockNote, etc)
│   ├── cli/
│   │   ├── src/
│   │   │   ├── index.ts             — Commander CLI (login, whoami, doc, folder, search --source, upload list)
│   │   │   └── api-client.ts        — HTTP client (credential storage)
│   │   ├── tsconfig.json
│   │   └── package.json             — Dependency (Commander.js)
│   └── shared/
│       ├── src/
│       │   ├── types/
│       │   │   ├── auth.ts          — JwtPayload, Role, User types
│       │   │   ├── document.ts      — Document, DocumentTag, DocumentVersion types
│       │   │   └── ai.ts            — AI provider types & request/response
│       │   ├── schemas/
│       │   │   ├── auth.ts          — Zod schemas for auth requests
│       │   │   ├── document.ts      — Zod schemas for document validation
│       │   │   └── ai.ts            — Zod schemas for AI requests/responses
│       │   ├── constants.ts         — TOKEN_TTL, RATE_LIMITS, AI_PROVIDERS, AI_RATE_LIMIT
│       │   └── index.ts             — Re-exports all types/schemas
│       ├── tsconfig.json
│       └── package.json
├── docs/                            — Documentation (this file)
├── tests/
│   └── search-eval/                 — Search quality evaluation harness (NEW)
│       ├── metrics.ts               — MRR@5, Precision@3, Recall@10, NDCG@10
│       ├── types.ts                 — EvalQuery, EvalReport types
│       ├── run-eval.ts              — CLI harness (bootstrap, compare, per-type)
│       ├── eval-queries.json        — 13 template queries across 5 types
│       ├── metrics.test.ts          — 21 unit tests (all passing)
│       └── README.md                — Eval usage documentation
├── plans/                           — Implementation plans & research
│   ├── 260318-1655-agentwiki-knowledge-platform/
│   │   ├── phase-01-project-setup.md
│   │   ├── phase-02-auth-multi-tenant.md
│   │   ├── phase-03-core-api-database.md
│   │   ├── phase-04-web-ui-editor.md
│   │   ├── phase-05-storage-search-ai.md
│   │   ├── phase-06-sharing-publishing-cli.md
│   │   ├── phase-07-graph-hardening.md
│   │   └── plan.md
│   └── 260322-1646-qmd-search-improvements/
│       ├── plan.md
│       ├── phase-01-eval-baseline.md
│       ├── phase-02-fts5-evaluation.md
│       ├── phase-03-position-aware-rrf.md
│       ├── phase-04-smart-chunking.md
│       └── phase-05-folder-context-expansion.md
├── .github/workflows/ci.yml         — CI pipeline
├── .gitignore                       — Standard ignores + .claude/
├── .prettierrc                      — Prettier config (single quotes, 2 spaces)
├── eslint.config.js                 — ESLint config (TypeScript ESLint)
├── turbo.json                       — Turborepo task pipeline
├── pnpm-workspace.yaml              — Monorepo workspace definition
├── tsconfig.base.json               — Shared TypeScript config
└── package.json                     — Root scripts (dev, build, lint, test)
```

## Database Schema

### tenants
```ts
{
  id: string          (PK)
  name: string        (organization name)
  slug: string        (URL-friendly identifier, unique)
  plan: string        ("free" | "pro" | "enterprise")
  createdAt: timestamp
}
```

### users
```ts
{
  id: string          (PK)
  email: string       (unique)
  name: string
  avatarUrl?: string
  provider: string    ("google" | "github")
  providerId: string  (OAuth provider ID)
  createdAt: timestamp
}
```

### tenant_memberships
```ts
{
  id: string          (PK)
  tenantId: string    (FK → tenants)
  userId: string      (FK → users)
  role: string        ("admin" | "editor" | "viewer" | "agent")
  invitedBy?: string
  joinedAt: timestamp
}
```

### sessions
```ts
{
  id: string          (PK)
  userId: string      (FK → users)
  tokenHash: string   (SHA256 of refresh token)
  expiresAt: timestamp (7 days)
  createdAt: timestamp
}
```

### api_keys
```ts
{
  id: string          (PK)
  tenantId: string    (FK → tenants)
  name: string        ("Production API Key", etc)
  keyPrefix: string   (first 8 chars for display)
  keyHash: string     (PBKDF2)
  keySalt: string     (PBKDF2 salt)
  scopes: json        (["documents:read", "documents:write", ...])
  createdBy: string   (FK → users)
  lastUsedAt?: timestamp
  expiresAt?: timestamp
  revokedAt?: timestamp
  createdAt: timestamp
}
```

### audit_logs
```ts
{
  id: string          (PK)
  tenantId: string
  userId?: string
  action: string      ("document:create", "user:login", etc)
  resourceType?: string ("document", "folder", "user")
  resourceId?: string
  metadata: json      (custom data)
  ip: string
  userAgent: string
  createdAt: timestamp (immutable)
}
```

### documents
```ts
{
  id: string          (PK)
  tenantId: string    (FK → tenants)
  folderId?: string   (FK → folders)
  position: string    (fractional indexing for manual sort order)
  title: string
  slug: string        (URL-friendly per tenant)
  content: string     (Markdown body)
  contentJson: json   (BlockNote JSON)
  summary?: string    (AI-generated)
  category?: string
  accessLevel: string ("private" | "shared" | "public")
  contentHash?: string (SHA-256, for skip-on-re-embed optimization) [NEW]
  createdBy: string   (FK → users)
  updatedBy?: string  (FK → users)
  createdAt: timestamp
  updatedAt: timestamp
  deletedAt?: timestamp (soft delete)
}
```

### document_tags
```ts
{
  id: string          (PK)
  documentId: string  (FK → documents)
  tag: string         (normalized lowercase)
}
```

### document_versions
```ts
{
  id: string          (PK)
  documentId: string  (FK → documents)
  version: int        (auto-increment per document)
  content: string     (Markdown snapshot)
  contentJson: json   (BlockNote snapshot)
  changeSummary?: string
  createdBy: string   (FK → users)
  createdAt: timestamp (append-only)
}
```

### document_links
```ts
{
  id: string          (PK)
  sourceDocId: string (FK → documents)
  targetDocId: string (FK → documents)
  context?: string    (surrounding text for preview)
  createdAt: timestamp
}
```

### folders
```ts
{
  id: string          (PK)
  tenantId: string    (FK → tenants)
  parentId?: string   (FK → folders, self-referencing)
  name: string
  slug: string
  position: int       (legacy sort order)
  positionIndex: string (fractional indexing for manual sort order)
  description?: string (folder context for search enrichment)
  createdBy: string   (FK → users)
  createdAt: timestamp
  updatedAt: timestamp
}
```

### share_links
```ts
{
  id: string          (PK)
  documentId: string  (FK → documents)
  token: string       (unique, URL-safe)
  accessLevel: string ("read" | "edit")
  createdBy: string   (FK → users)
  expiresAt?: timestamp
  createdAt: timestamp
}
```

### uploads
```ts
{
  id: string                (PK)
  tenantId: string          (FK → tenants)
  documentId?: string       (FK → documents)
  fileKey: string           (R2 object key)
  filename: string          (original filename)
  contentType: string
  sizeBytes: int
  uploadedBy: string        (FK → users)
  extractionStatus: string  ("pending" | "processing" | "completed" | "failed" | "unsupported")
  summary?: string          (AI-generated summary of extracted text)
  createdAt: timestamp
}
```

### file_extractions
```ts
{
  id: string               (PK)
  uploadId: string         (FK → uploads, cascade delete)
  tenantId: string         (FK → tenants)
  extractedText: string    (large text body from PDF/DOCX/etc extraction)
  charCount: int           (length of extractedText)
  vectorId?: string        (prefix for Vectorize vector IDs)
  extractionMethod: string ("docling" | "gemini" | "direct" | "unsupported")
  errorMessage?: string    (if extraction failed)
  createdAt: timestamp
  updatedAt: timestamp
}
```

### ai_settings
```ts
{
  id: string          (PK)
  tenantId: string    (FK → tenants, unique)
  provider: string    ("openai" | "anthropic" | "google" | "openrouter" | "minimax" | "alibaba")
  apiKeyEncrypted: string (encrypted provider API key)
  model: string       (e.g., "gpt-4", "claude-opus", "gemini-pro")
  temperature: number (0.0 - 1.0)
  maxTokens: int
  enabledFeatures: json (["slash_commands", "selection_toolbar", "auto_summarize"])
  priority: int       (fallback chain order: 1 = primary, 2 = first fallback, etc.) [NEW]
  createdAt: timestamp
  updatedAt: timestamp
}
```

### ai_usage
```ts
{
  id: string          (PK)
  tenantId: string    (FK → tenants)
  provider: string    (which provider was used)
  inputTokens: int    (tokens consumed)
  outputTokens: int   (tokens generated)
  costUSD: decimal    (estimated cost)
  action: string      ("generate" | "transform" | "suggest")
  createdAt: timestamp
}
```

### storage_settings [NEW]
```ts
{
  id: string              (PK)
  tenantId: string        (FK → tenants, unique)
  accountId: string       (Cloudflare account ID)
  encryptedAccessKey: string (encrypted S3-compatible access key)
  encryptedSecretKey: string (encrypted S3-compatible secret key)
  bucketName: string      (R2 bucket name)
  endpointUrl?: string    (optional custom S3 endpoint)
  isVerified: int         (0 = not tested, 1 = connection verified)
  createdAt: timestamp
  updatedAt: timestamp
}
```

### user_preferences
```ts
{
  id: string          (PK)
  userId: string      (FK → users)
  tenantId: string    (FK → tenants)
  key: string         (preference key, e.g., "sidebarSortMode")
  value: string       (preference value, max 2000 chars)
  createdAt: timestamp
  updatedAt: timestamp
}
```

## API Routes Summary

### Auth (`/api/auth`)
- `POST /google` — OAuth callback (Google)
- `POST /github` — OAuth callback (GitHub)
- `GET /me` — Current user + tenant info
- `POST /refresh` — Refresh JWT token
- `POST /logout` — Revoke session

### Documents (`/api/documents`)
- `GET` — List documents (pagination)
- `POST` — Create document
- `GET /:id` — Get by ID
- `PATCH /:id` — Update title/content/metadata
- `DELETE /:id` — Soft delete
- `GET /:id/versions` — Version history
- `GET /:id/links` — Documents linking to this

### Folders (`/api/folders`)
- `GET` — List folder tree
- `POST` — Create folder
- `PATCH /:id` — Rename/move
- `DELETE /:id` — Delete folder and contents

### Tags (`/api/tags`)
- `GET` — List all tags in tenant

### Uploads (`/api/uploads`)
- `GET` — List uploaded files with extraction status & summaries (SP2)
- `POST` — Upload file to R2 (100MB limit, auto-extracted)
- `DELETE /:id` — Delete upload

### Files (`/api/files/:key`)
- `GET` — Serve file from R2 (supports auth, public, and download token access)

### Search (`/api/search`)
- `GET ?q=query&type=hybrid|keyword|semantic&source=docs|storage|all[&debug=true][&expand=true]` — Hybrid search with position-aware RRF, folder context, parallel query expansion, debug mode

### Share (`/api/share`)
- `GET /public/:token` — Access shared document (public)
- `POST /links` — Create share link
- `DELETE /links/:id` — Delete share link
- `POST /publish/:id` — Publish as web page

### Members (`/api/members`)
- `GET` — List tenant members
- `POST /invite` — Invite user by email with role assignment
- `PATCH /:id` — Update member role
- `DELETE /:id` — Remove member from tenant

### API Keys (`/api/keys`)
- `GET` — List keys
- `POST` — Create key
- `DELETE /:id` — Revoke key

### Graph (`/api/graph`)
- `GET` — Document graph (nodes + edges)

### AI (`/api/ai`)
- `POST /generate` — Generate text (slash commands, selection toolbar)
- `POST /transform` — Transform selected text (rewrite, expand, summarize)
- `POST /suggest` — Smart suggestions (next paragraph, continuations)
- `GET /settings` — Get tenant's AI configuration (includes provider priority order)
- `PUT /settings` — Update provider, model, temperature, priority
- `PATCH /settings/order` — Reorder providers by priority (affects fallback chain)
- `DELETE /settings` — Clear AI settings
- `GET /usage` — Usage dashboard (tokens, cost by provider)

### Storage Settings (`/api/storage/settings`)
- `GET` — Get custom R2 credentials config (masked, admin-only)
- `PUT` — Configure custom R2 bucket (Account ID, Access Key, Secret, Bucket name, admin-only)
- `DELETE` — Remove custom config, fall back to default bucket
- `POST /test` — Test S2-compatible connection with provided credentials

### Reorder (`/api/reorder`)
- `PATCH` — Update document/folder position (DnD reordering with fractional indexing)

### Preferences (`/api/preferences`)
- `GET` — Get all user preferences (key-value pairs)
- `PUT /:key` — Set/update a preference value

### Internal API (`/api/internal`)
- `POST /extraction-result` — Callback from VPS extraction service (shared secret auth)
- `GET /extraction-status` — Admin: extraction pipeline status counts by status
- `POST /extraction-retry/:id` — Admin: manually retry failed extraction

### Health
- `GET /api/health` — Health check

## Key Files by Size

| File | LOC | Purpose |
|------|-----|---------|
| `packages/api/src/db/schema.ts` | 155 | Drizzle ORM table definitions |
| `packages/api/src/index.ts` | 77 | Hono app setup, middleware, routes |
| `packages/api/src/routes/documents.ts` | ~150 | Document CRUD endpoints |
| `packages/api/src/services/search-service.ts` | ~120 | Hybrid search (FTS + semantic) |
| `packages/web/src/components/editor/editor.tsx` | ~100 | BlockNote editor wrapper |
| `packages/web/src/stores/app-store.ts` | ~80 | Zustand global state |
| `packages/web/src/components/layout/layout.tsx` | ~90 | 3-panel layout container |

## Dependency Graph

```
┌─ Root (turbo.json, pnpm-workspace.yaml)
├─ packages/api (Hono backend)
│  ├─ Depends on: shared
│  ├─ Exports: Services, DB schema, OpenAPI
│  └─ Runtime: Cloudflare Workers
├─ packages/mcp (MCP agent server)
│  ├─ Depends on: shared, imports services from api
│  ├─ Exports: 25 tools, 6 resources, 4 prompts
│  └─ Runtime: Cloudflare Workers
├─ packages/web (React frontend)
│  ├─ Depends on: shared
│  ├─ Uses: BlockNote, TanStack Query, Zustand
│  └─ Runtime: Cloudflare Pages
├─ packages/cli (Commander CLI)
│  ├─ Depends on: shared
│  └─ Publishes: npm package
└─ packages/shared (Types & schemas)
   └─ Exports: Types, Zod schemas, constants
```

## Technology Matrix

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Monorepo | Turborepo | 2.4.0 | Task orchestration |
| Package Mgr | pnpm | 9.15.0 | Workspace management |
| Language | TypeScript | 5.7.0 | Type safety |
| Runtime (API) | Cloudflare Workers | - | Compute |
| Runtime (Web) | Cloudflare Pages | - | Static hosting |
| Database | D1 (SQLite) | - | Structured data |
| ORM | Drizzle | 0.38.0 | Type-safe queries |
| Web Framework | Hono | 4.7.0 | Lightweight framework |
| Frontend | React | 19.0.0 | UI framework |
| Editor | BlockNote | 0.22.0 | Rich text editor |
| Build | Vite | 6.2.0 | Fast bundler |
| Styling | TailwindCSS | 4.0.0 | Utility CSS |
| State Mgmt | Zustand | 5.0.0 | Lightweight store |
| Data Fetching | TanStack Query | 5.67.0 | Cache + sync |
| Auth (OAuth) | Arctic | 3.5.0 | OAuth2 provider |
| CLI | Commander | ^12 | CLI framework |
| Validation | Zod | 3.24.0 | Schema validation |
| UUID | Nanoid | 5.1.0 | Tiny ID generator |
| Linting | ESLint | 9.0.0 | Code linting |
| Formatting | Prettier | 3.5.0 | Code formatting |
| Testing | Vitest | 3.0.0 | Test runner |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities | 6.3.1 / 10.0.0 / 3.2.2 | Sortable lists |
| Fractional Index | fractional-indexing | 3.2.0 | DnD position indexing |
| S3 Auth | aws4fetch | - | AWS S3 request signing for custom R2 buckets |

## Build & Deploy Commands

### Development
```bash
pnpm dev              # Run all dev servers
pnpm type-check       # TypeScript validation
pnpm lint             # ESLint all packages
pnpm format           # Prettier format
pnpm test             # Run all tests (includes search-eval metrics)
npx tsx tests/search-eval/run-eval.ts --bootstrap    # Bootstrap eval dataset
npx tsx tests/search-eval/run-eval.ts --compare      # Compare search implementations
```

### Production
```bash
pnpm build            # Build all packages
cd packages/api && wrangler deploy         # Deploy API to Workers
cd packages/web && wrangler pages deploy   # Deploy web to Pages
```

### Database
```bash
pnpm -F @agentwiki/api db:generate   # Generate migrations
pnpm -F @agentwiki/api db:migrate    # Apply locally
pnpm -F @agentwiki/api db:migrate:remote # Apply to production
```

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/ci.yml`):
1. **Install** — pnpm install with cache
2. **Type Check** — `turbo run type-check`
3. **Lint** — `turbo run lint` (ESLint)
4. **Build** — `turbo run build` (Vite, wrangler)
5. **Test** — `turbo run test` (Vitest)

Triggered on: Push to main, Pull requests to main.

## Code Organization Principles

- **Monorepo**: Single repo, multiple packages, shared types
- **Services**: Business logic separated from routes
- **Middleware**: Cross-cutting concerns (auth, rate limiting)
- **Utilities**: Reusable helpers (crypto, pagination, etc)
- **Type Safety**: TypeScript strict mode, Zod validation
- **No Duplication**: Shared package for common types/schemas
