# AgentWiki

Enterprise knowledge management platform serving humans and AI agents, hosted entirely on Cloudflare.

## Overview

AgentWiki is a full-stack knowledge management system designed for enterprises and AI agents. It provides a modern web interface for humans to create, organize, and share knowledge, plus REST APIs and CLI tools for AI agents to access and manage information programmatically.

**Domain:** [app.agentwiki.cc](https://app.agentwiki.cc)

## Key Features

- **Dual User Interfaces**: Rich web UI for humans (React 19 + BlockNote), REST API + CLI for agents
- **MCP Integration**: Model Context Protocol server enabling AI agents (Claude, ChatGPT, Cursor) to access knowledge directly
- **Knowledge Organization**: Hierarchical folders, tagging, version history, wikilinks between documents
- **Multi-tenant**: Isolated workspaces (tenants) with RBAC (Admin, Editor, Viewer, Agent roles)
- **Hybrid Search**: Combines full-text keyword search (D1 FTS) with semantic search (Vectorize) via Reciprocal Rank Fusion
- **Real-time Collaboration**: BlockNote editor with automatic markdown sync
- **AI-Assisted Writing**: Multi-provider AI (OpenAI, Anthropic, Gemini, OpenRouter, MiniMax, Alibaba) with slash commands, selection toolbar, auto-summarize, and RAG suggestions
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
| **MCP Server** | @modelcontextprotocol/sdk (Cloudflare Workers) |

## Monorepo Structure

```
agentwiki/
├── packages/
│   ├── api/          Hono backend on Cloudflare Workers (2.8k LOC)
│   ├── web/          React 19 frontend on Cloudflare Pages (1.9k LOC)
│   ├── mcp/          MCP server on Cloudflare Workers (1.4k LOC)
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
│  ├── AI (6 providers, generate, transform, suggest) │
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

### AI
- `POST /api/ai/generate` — AI text generation via slash commands (SSE stream)
- `POST /api/ai/transform` — AI text transformation on selection (SSE stream)
- `POST /api/ai/suggest` — RAG-powered smart suggestions (JSON)
- `GET /api/ai/settings` — List AI provider configurations (admin)
- `PUT /api/ai/settings` — Configure AI provider (admin)
- `DELETE /api/ai/settings/:providerId` — Remove provider config (admin)
- `GET /api/ai/usage` — AI usage statistics (admin)

## MCP Server Integration

AgentWiki provides a **Model Context Protocol server** enabling Claude, ChatGPT, and other AI agents to access organizational knowledge with 25 tools:

**Tools**: document_create/get/update/delete, search, folder management, uploads, member management, API keys, sharing

**Configure in Claude Desktop**:
```json
{
  "mcpServers": {
    "agentwiki": {
      "url": "https://api.agentwiki.cc/mcp",
      "env": {"API_KEY": "aw_xxxxxxxxxxxxx"}
    }
  }
}
```

Then ask Claude: `@agentwiki What documents exist about authentication?`

See [MCP Server Documentation](./docs/mcp-server.md) for complete reference (tools, resources, prompts, deployment).

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

15 tables for multi-tenancy: tenants, users, tenant_memberships, sessions, api_keys, audit_logs, documents, document_tags, document_versions, document_links, folders, share_links, uploads, ai_settings, ai_usage. See [Codebase Summary](./docs/codebase-summary.md).

## Authentication & Authorization

- **OAuth**: Google/GitHub via Arctic library
- **JWT**: Access tokens (15 min) + refresh tokens (7 days)
- **API Keys**: PBKDF2 hashed, `aw_` prefixed
- **RBAC**: Admin, Editor, Viewer, Agent roles

## Search Pipeline

Hybrid search: keyword (D1 SQL LIKE) + semantic (Vectorize bge-base-en) fused via RRF (k=60). Documents embedded async via Queues → Workers AI.

## AI-Assisted Writing

AgentWiki includes a full AI writing assistant with 6 configurable providers. See [AI Features Documentation](./docs/ai-assisted-features.md) for details.

**Slash Commands** (type `/` in editor):
- `/ai-write` — Write content from a prompt
- `/ai-continue` — Continue from cursor position
- `/ai-summarize` — Summarize the document
- `/ai-list` — Generate a list
- `/ai-explain` — Explain content simply

**Selection Toolbar** (select text → AI buttons appear):
- Edit with AI, Write shorter, Write longer, Change tone, Translate, Fix grammar

**Supported Providers**: OpenAI, Anthropic, Google Gemini, OpenRouter, MiniMax, Alibaba — configured per-tenant in Settings → AI tab. API keys encrypted at rest with AES-256-GCM.

## Deployment

All services deploy to Cloudflare: Frontend (Pages), API (Workers), MCP (Workers), D1, R2, KV, Queues. See [Deployment Guide](./docs/deployment-guide.md).

## Contributing

1. Read [Code Standards](./docs/code-standards.md)
2. Branch: `git checkout -b feature/your-feature`
3. Ensure `pnpm type-check && pnpm lint && pnpm test` pass
4. Submit PR with clear description

## Documentation

- [Project Overview & PDR](./docs/project-overview-pdr.md)
- [Codebase Summary](./docs/codebase-summary.md)
- [Code Standards](./docs/code-standards.md)
- [System Architecture](./docs/system-architecture.md)
- [Deployment Guide](./docs/deployment-guide.md)
- [MCP Server](./docs/mcp-server.md) — AI agent integration via Model Context Protocol
- [Project Roadmap](./docs/project-roadmap.md)
- [AI-Assisted Features](./docs/ai-assisted-features.md)

## License

Private/Proprietary — Contact for licensing details.

## Support

For issues, questions, or feature requests, please refer to the documentation or open a GitHub issue.
