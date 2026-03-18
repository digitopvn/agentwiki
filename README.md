# AgentWiki

Enterprise knowledge management platform serving humans and AI agents, hosted entirely on Cloudflare.

## Overview

AgentWiki is a full-stack knowledge management system designed for enterprises and AI agents. It provides a modern web interface for humans to create, organize, and share knowledge, plus REST APIs and CLI tools for AI agents to access and manage information programmatically.

**Domain:** [agentwiki.cc](https://agentwiki.cc)

## Key Features

- **Dual User Interfaces**: Rich web UI for humans (React 19 + BlockNote), REST API + CLI for agents
- **Knowledge Organization**: Hierarchical folders, tagging, version history, wikilinks between documents
- **Multi-tenant**: Isolated workspaces (tenants) with RBAC (Admin, Editor, Viewer, Agent roles)
- **Hybrid Search**: Combines full-text keyword search (D1 FTS) with semantic search (Vectorize) via Reciprocal Rank Fusion
- **Real-time Collaboration**: BlockNote editor with automatic markdown sync
- **AI Integration**: Workers AI for document summarization, Cloudflare Vectorize for embeddings
- **Public Sharing**: Token-based share links with granular access control
- **Content Publishing**: Publish documents as public pages
- **Async Processing**: Queue-based jobs for embeddings and AI summarization
- **Security**: OAuth 2.0 (Google/GitHub), JWT tokens, API keys, rate limiting, audit logging

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Monorepo** | Turborepo + pnpm |
| **Frontend** | React 19 + Vite + BlockNote + TailwindCSS v4 + Zustand + TanStack Query |
| **Backend** | Hono on Cloudflare Workers |
| **Database** | Cloudflare D1 (SQLite) + Drizzle ORM |
| **Storage** | Cloudflare R2 (file uploads) |
| **Cache** | Cloudflare KV |
| **Vectors** | Cloudflare Vectorize + Workers AI |
| **Async Jobs** | Cloudflare Queues |
| **Auth** | Arctic (OAuth2) + custom JWT + API keys |
| **CLI** | Commander.js |

## Monorepo Structure

```
agentwiki/
├── packages/
│   ├── api/          Hono backend on Cloudflare Workers (2.8k LOC)
│   ├── web/          React 19 frontend on Cloudflare Pages (1.9k LOC)
│   ├── cli/          Commander CLI for agent access (318 LOC)
│   └── shared/       Types, schemas, constants (227 LOC)
├── docs/             Documentation
├── plans/            Implementation plans & research
└── [config files]    turbo.json, pnpm-workspace.yaml, etc.
```

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────┐
│                    Frontend Layer                    │
│  React 19 + Vite + BlockNote + TailwindCSS v4       │
│         Deployed: Cloudflare Pages                   │
└───────────────────┬─────────────────────────────────┘
                    │ REST API
┌───────────────────▼─────────────────────────────────┐
│              API Layer (Backend)                     │
│    Hono on Cloudflare Workers                       │
│  ├── Auth (OAuth + JWT + API Keys)                  │
│  ├── Documents, Folders, Tags                       │
│  ├── Search (Hybrid: FTS + Semantic)                │
│  ├── Sharing & Publishing                          │
│  └── Uploads & File Serving                         │
└───────────────────┬─────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
    ┌───▼──┐   ┌───▼──┐   ┌───▼──┐
    │ D1   │   │  R2  │   │ KV   │
    │(SQL) │   │Files │   │Cache │
    └──────┘   └──────┘   └──────┘
        │
    ┌───▼────────────────┐
    │  Workers AI +      │
    │  Vectorize         │
    │  (Embeddings)      │
    └────────────────────┘
```

## Quick Start

### Prerequisites
- Node.js ≥ 20
- pnpm 9.15+
- Cloudflare account with D1, R2, Vectorize, Queues enabled

### Development

```bash
# Install dependencies
pnpm install

# Run dev servers (API on :8787, Web on :5173)
pnpm dev

# Type checking & linting
pnpm type-check
pnpm lint

# Build for production
pnpm build

# Run tests
pnpm test
```

### Database

```bash
# Generate migrations from schema changes
pnpm -F @agentwiki/api db:generate

# Apply migrations locally
pnpm -F @agentwiki/api db:migrate

# Apply to production D1
pnpm -F @agentwiki/api db:migrate:remote
```

## API Endpoints

### Authentication
- `POST /api/auth/google` — Google OAuth callback
- `POST /api/auth/github` — GitHub OAuth callback
- `GET /api/auth/me` — Current user profile
- `POST /api/auth/refresh` — Refresh JWT token
- `POST /api/auth/logout` — Logout & revoke session

### Documents
- `GET /api/documents` — List documents
- `POST /api/documents` — Create document
- `GET /api/documents/:id` — Get document
- `PATCH /api/documents/:id` — Update document
- `DELETE /api/documents/:id` — Soft delete
- `GET /api/documents/:id/versions` — Version history
- `GET /api/documents/:id/links` — Linked documents

### Folders
- `GET /api/folders` — List folder tree
- `POST /api/folders` — Create folder
- `PATCH /api/folders/:id` — Rename/move folder
- `DELETE /api/folders/:id` — Delete folder

### Search
- `GET /api/search?q=query&type=hybrid|keyword|semantic` — Search documents

### Uploads
- `POST /api/uploads` — Upload file to R2
- `GET /api/files/:key` — Serve file
- `DELETE /api/uploads/:id` — Delete upload

### Sharing & Publishing
- `POST /api/share/links` — Create share link
- `GET /api/share/public/:token` — Access shared document
- `POST /api/publish/:id` — Publish document

### API Keys
- `GET /api/keys` — List API keys
- `POST /api/keys` — Create API key
- `DELETE /api/keys/:id` — Revoke API key

### Graph
- `GET /api/graph` — Get document graph (nodes + edges for visualization)

## CLI Usage

```bash
# Login with API key
agentwiki login --api-key aw_xxxxx

# Verify authentication
agentwiki whoami

# Document management
agentwiki doc list [--limit 20] [--offset 0]
agentwiki doc get <id>
agentwiki doc create --title "Title" --content "Markdown content"
agentwiki doc update <id> --content "Updated content"
agentwiki doc delete <id>

# Search
agentwiki search "query term" [--type hybrid|keyword|semantic]

# Folders
agentwiki folder list
agentwiki folder create --name "Folder" --parent <parent-id>

# Tags
agentwiki tag list

# Uploads
agentwiki upload <file-path> [--doc-id <id>]
```

## Database Schema

13 tables designed for multi-tenancy:

| Table | Purpose |
|-------|---------|
| `tenants` | Organizations/workspaces |
| `users` | User accounts (OAuth) |
| `tenant_memberships` | User ↔ tenant relationships with roles |
| `sessions` | Refresh tokens |
| `api_keys` | Agent/CLI API keys (PBKDF2 hashed) |
| `audit_logs` | Immutable audit trail |
| `documents` | Knowledge items (markdown + BlockNote JSON) |
| `document_tags` | Many-to-many document tags |
| `document_versions` | Version history (append-only) |
| `document_links` | Wikilinks between documents |
| `folders` | Hierarchical folder structure |
| `share_links` | Token-based sharing |
| `uploads` | R2 file metadata |

## Authentication & Authorization

- **OAuth**: Arctic library handles Google and GitHub sign-up/login
- **JWT**: Access tokens (15 min TTL) + refresh tokens (7 days) stored in D1 sessions
- **API Keys**: PBKDF2 hashed, prefixed with `aw_` for identification
- **RBAC**: Admin, Editor, Viewer, Agent roles with permission matrix enforced by middleware

## Search Pipeline

**Hybrid search** combines two strategies:

1. **Keyword Search**: Full-text search on document title/content via D1 SQL LIKE
2. **Semantic Search**: Vector similarity via Cloudflare Vectorize (bge-base-en embeddings)
3. **Fusion**: Results merged using Reciprocal Rank Fusion (RRF) with k=60

Documents are embedded asynchronously when created/updated via Cloudflare Queues → Workers AI.

## Deployment

All services deploy to Cloudflare infrastructure:
- **Frontend**: Cloudflare Pages (automatic deployments on git push)
- **API**: Cloudflare Workers (wrangler deploy)
- **Database**: Cloudflare D1
- **Storage**: Cloudflare R2
- **Queues**: Cloudflare Queues

See [Deployment Guide](./docs/deployment-guide.md) for setup instructions.

## Contributing

1. Read [Code Standards](./docs/code-standards.md) for conventions
2. Create a branch: `git checkout -b feature/your-feature`
3. Follow the [Primary Workflow](./docs/project-roadmap.md)
4. Ensure `pnpm type-check && pnpm lint && pnpm test` pass
5. Submit a pull request with clear description

## File Size Notes

- `packages/api/src/db/schema.ts` — 155 lines (Drizzle table definitions)
- `packages/api/src/index.ts` — 77 lines (Hono app setup)
- `packages/web/src/stores/app-store.ts` — Zustand store for UI state

## Documentation

- [Project Overview & PDR](./docs/project-overview-pdr.md)
- [Codebase Summary](./docs/codebase-summary.md)
- [Code Standards](./docs/code-standards.md)
- [System Architecture](./docs/system-architecture.md)
- [Deployment Guide](./docs/deployment-guide.md)
- [Project Roadmap](./docs/project-roadmap.md)

## License

Private/Proprietary — Contact for licensing details.

## Support

For issues, questions, or feature requests, please refer to the documentation or open a GitHub issue.
