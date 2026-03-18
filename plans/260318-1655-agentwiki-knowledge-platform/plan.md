---
title: "AgentWiki Knowledge Management Platform"
description: "Full-stack enterprise knowledge platform on Cloudflare ecosystem — 7-phase implementation plan"
status: pending
priority: P1
effort: 160h
branch: main
tags: [cloudflare, knowledge-management, monorepo, react, hono, d1, r2]
created: 2026-03-18
---

# AgentWiki Implementation Plan

Enterprise knowledge management platform serving humans (web UI) and AI agents (CLI/API). Full Cloudflare ecosystem: Workers, D1, R2, KV, Vectorize, Queues.

## Monorepo Structure

```
agentwiki/
├── turbo.json
├── pnpm-workspace.yaml
├── packages/
│   ├── api/          # Hono on Cloudflare Workers
│   ├── web/          # React 19 + Vite on Cloudflare Pages
│   ├── cli/          # Commander.js CLI
│   └── shared/       # Types, schemas, validation utils
├── docs/
└── plans/
```

## Phases

| # | Phase | Effort | Status | File |
|---|-------|--------|--------|------|
| 1 | Project Setup & Infrastructure | 16h | Pending | [phase-01](./phase-01-project-setup.md) |
| 2 | Authentication & Multi-Tenant | 24h | Pending | [phase-02](./phase-02-auth-multi-tenant.md) |
| 3 | Core API & Database Layer | 28h | Pending | [phase-03](./phase-03-core-api-database.md) |
| 4 | Web UI & Editor | 32h | Pending | [phase-04](./phase-04-web-ui-editor.md) |
| 5 | Storage, Search & AI | 24h | Pending | [phase-05](./phase-05-storage-search-ai.md) |
| 6 | Sharing, Publishing & CLI | 20h | Pending | [phase-06](./phase-06-sharing-publishing-cli.md) |
| 7 | Knowledge Graph & Hardening | 16h | Pending | [phase-07](./phase-07-graph-hardening.md) |

## Key Dependencies

- Phase 1 unblocks all others
- Phase 2 required before Phase 3-7 (auth middleware)
- Phase 3 required before Phase 4-7 (API endpoints)
- Phase 4+5 can partially parallel after Phase 3
- Phase 6+7 depend on Phase 4+5

## Research Reports

- [Cloudflare Ecosystem Research](../reports/researcher-01-260318-1655-cloudflare-ecosystem.md)
- [Architecture Patterns Research](../reports/researcher-02-260318-1655-knowledge-platform-architecture.md)

## Critical Constraints

- D1: 10GB per database — use database-per-tenant sharding
- Vectorize: 5M stored dimensions — shard indexes per tenant at scale
- Workers: 128MB heap, 30s default CPU — offload heavy ops to Queues
- KV: eventual consistency (~60s) — use D1 for auth-critical reads
- Durable Objects: premium feature — real-time collab is optional/enterprise tier
- Domain: agentwiki.cc (Cloudflare custom domain)

## Validation Log

### Session 1 — 2026-03-18
**Trigger:** Post-plan validation interview (hard mode)
**Questions asked:** 6

#### Confirmed Decisions
- **Content Format**: Dual storage (BlockNote JSON + Markdown) — sync on save, both formats always available
- **Real-time Collab**: Defer to post-MVP — single-user editing with auto-save + conflict detection
- **Auth Library**: Arctic (lightweight OAuth) + custom JWT/session logic on Workers
- **CLI Scope**: Include in MVP — CLI is primary interface for AI agents
- **Domain**: agentwiki.cc — configure Cloudflare custom domain
- **Knowledge Graph**: Include in MVP — key differentiator vs other wiki tools

#### Impact on Phases
- Phase 2: Use Arctic library instead of full custom OAuth2
- Phase 3: Add `content_json` column (BlockNote JSON) alongside `content` (Markdown), sync both on save
- Phase 4: Remove Durable Objects/Yjs from scope, add simple conflict detection (last-write-wins with warning)
- Phase 7: Knowledge Graph stays in MVP scope, full interactive Cytoscape.js implementation
