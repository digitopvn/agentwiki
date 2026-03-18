---
title: "Phase 1: Project Setup & Infrastructure"
status: pending
priority: P1
effort: 16h
---

# Phase 1: Project Setup & Infrastructure

## Context Links
- [Cloudflare Ecosystem Research](../reports/researcher-01-260318-1655-cloudflare-ecosystem.md)
- [Plan Overview](./plan.md)

## Overview
Initialize Turborepo monorepo with pnpm. Configure all Cloudflare bindings (D1, R2, KV, Vectorize, Queues). Set up shared tooling (TypeScript, ESLint, Prettier). Establish CI/CD pipeline.

## Key Insights
- Turborepo handles task orchestration + caching across packages
- Wrangler bindings define all Cloudflare resources in `wrangler.toml`
- `.dev.vars` for local secrets (git-ignored); `wrangler secret` for prod
- D1 local mode uses SQLite file — near-identical to production
- Drizzle ORM has first-class D1 adapter via `drizzle-orm/d1`

## Requirements

### Functional
- Monorepo with 4 packages: api, web, cli, shared
- All packages share TypeScript config, ESLint, Prettier
- API package binds to D1, R2, KV, Vectorize, Queues
- Local dev runs API + Web in parallel with hot reload
- Database migrations via Drizzle Kit

### Non-Functional
- Build time < 30s per package
- Type-check across all packages
- CI runs lint + type-check + test on every PR

## Architecture

```
agentwiki/
├── turbo.json                    # Pipeline: build, dev, lint, type-check
├── pnpm-workspace.yaml           # packages/*
├── package.json                  # Root scripts, shared devDeps
├── tsconfig.base.json            # Shared TS config (strict, paths)
├── .eslintrc.cjs                 # Shared ESLint config
├── .prettierrc                   # Shared Prettier config
├── .github/
│   └── workflows/
│       └── ci.yml                # Lint + type-check + deploy
├── packages/
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json         # Extends ../../tsconfig.base.json
│   │   ├── wrangler.toml         # D1, R2, KV, Vectorize, Queues bindings
│   │   ├── .dev.vars             # Local secrets (git-ignored)
│   │   ├── drizzle.config.ts     # Drizzle Kit config for D1
│   │   └── src/
│   │       ├── index.ts          # Hono app entry
│   │       ├── env.ts            # Env type definitions (bindings)
│   │       └── db/
│   │           ├── schema.ts     # Drizzle schema (all tables)
│   │           └── migrations/   # SQL migration files
│   ├── web/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts        # React plugin, proxy to API
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx          # React entry
│   │       ├── app.tsx           # Root component + router
│   │       └── vite-env.d.ts
│   ├── cli/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts          # Commander.js entry
│   └── shared/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── types.ts          # Shared TypeScript types
│           ├── schemas.ts        # Zod validation schemas
│           └── constants.ts      # Shared constants
└── docs/
```

## Related Code Files

### Files to Create
- `turbo.json` — pipeline config
- `pnpm-workspace.yaml` — workspace definition
- `package.json` (root) — scripts, shared devDeps
- `tsconfig.base.json` — shared strict TS config
- `.eslintrc.cjs` — flat ESLint config
- `.prettierrc` — formatting rules
- `.gitignore` — node_modules, .dev.vars, .wrangler, dist
- `.github/workflows/ci.yml` — CI pipeline
- `packages/api/package.json` — hono, drizzle-orm, wrangler deps
- `packages/api/tsconfig.json`
- `packages/api/wrangler.toml` — all Cloudflare bindings
- `packages/api/.dev.vars` — local env secrets
- `packages/api/drizzle.config.ts`
- `packages/api/src/index.ts` — Hono app with CORS + error handler
- `packages/api/src/env.ts` — Cloudflare Env type
- `packages/api/src/db/schema.ts` — base Drizzle schema
- `packages/web/package.json` — react, vite, react-router deps
- `packages/web/tsconfig.json`
- `packages/web/vite.config.ts` — proxy `/api` to wrangler dev
- `packages/web/index.html`
- `packages/web/src/main.tsx`
- `packages/web/src/app.tsx`
- `packages/cli/package.json` — commander dep
- `packages/cli/tsconfig.json`
- `packages/cli/src/index.ts` — CLI skeleton
- `packages/shared/package.json`
- `packages/shared/tsconfig.json`
- `packages/shared/src/types.ts`
- `packages/shared/src/schemas.ts`
- `packages/shared/src/constants.ts`

## Implementation Steps

### 1. Initialize Monorepo (2h)
```bash
mkdir agentwiki && cd agentwiki
pnpm init
mkdir -p packages/{api,web,cli,shared}/src
```

1. Create `pnpm-workspace.yaml`:
   ```yaml
   packages:
     - "packages/*"
   ```
2. Create `turbo.json` with pipelines: `build`, `dev`, `lint`, `type-check`, `test`
   - `build` depends on `^build` (shared builds first)
   - `dev` is persistent (watch mode)
3. Root `package.json`: scripts delegate to turbo (`turbo run build`, etc.)

### 2. Shared TypeScript Config (1h)
1. `tsconfig.base.json`: strict mode, ES2022 target, moduleResolution bundler, paths alias `@agentwiki/shared`
2. Each package `tsconfig.json` extends base, sets `rootDir`, `outDir`, `include`

### 3. ESLint + Prettier (1h)
1. `.eslintrc.cjs`: typescript-eslint, react plugin (web only), import-order
2. `.prettierrc`: singleQuote, trailingComma all, tabWidth 2, printWidth 100
3. Add lint scripts to each package

### 4. API Package Setup (3h)
1. `packages/api/package.json`:
   ```json
   {
     "dependencies": {
       "hono": "^4",
       "drizzle-orm": "^0.35",
       "@hono/zod-openapi": "^0.18"
     },
     "devDependencies": {
       "wrangler": "^3",
       "drizzle-kit": "^0.25"
     }
   }
   ```
2. `wrangler.toml` — critical config:
   ```toml
   name = "agentwiki-api"
   main = "src/index.ts"
   compatibility_date = "2026-03-01"

   [[d1_databases]]
   binding = "DB"
   database_name = "agentwiki-main"
   database_id = "<create-via-wrangler>"

   [[r2_buckets]]
   binding = "R2"
   bucket_name = "agentwiki-files"

   [[kv_namespaces]]
   binding = "KV"
   id = "<create-via-wrangler>"

   [[vectorize]]
   binding = "VECTORIZE"
   index_name = "agentwiki-vectors"

   [[queues.producers]]
   binding = "QUEUE"
   queue = "agentwiki-jobs"

   [[queues.consumers]]
   queue = "agentwiki-jobs"
   max_batch_size = 10
   max_batch_timeout = 30
   ```
3. `src/env.ts` — typed env bindings:
   ```typescript
   export type Env = {
     DB: D1Database
     R2: R2Bucket
     KV: KVNamespace
     VECTORIZE: VectorizeIndex
     QUEUE: Queue
     JWT_SECRET: string
     GOOGLE_CLIENT_ID: string
     GOOGLE_CLIENT_SECRET: string
     GITHUB_CLIENT_ID: string
     GITHUB_CLIENT_SECRET: string
   }
   ```
4. `src/index.ts` — Hono app skeleton with CORS middleware, error handler, health route

### 5. Database Schema Foundation (3h)
1. `src/db/schema.ts` using Drizzle:
   - `tenants`: id, name, slug, plan, created_at
   - `users`: id, tenant_id, email, name, avatar_url, role, created_at
   - `sessions`: id, user_id, token_hash, expires_at, created_at
   - `api_keys`: id, tenant_id, name, key_hash, scopes (JSON), last_used_at, expires_at
   - `audit_logs`: id, tenant_id, user_id, action, resource_type, resource_id, metadata (JSON), ip, created_at
2. `drizzle.config.ts` pointing to D1
3. Generate initial migration: `pnpm drizzle-kit generate`

### 6. Web Package Setup (2h)
1. `packages/web/package.json`: react 19, react-dom, react-router-dom, vite, @vitejs/plugin-react
2. `vite.config.ts` with proxy: `/api` → `http://localhost:8787`
3. Minimal `index.html`, `main.tsx`, `app.tsx` with router placeholder

### 7. CLI Package Setup (1h)
1. `packages/cli/package.json`: commander, node-fetch (or native fetch)
2. `src/index.ts`: commander program with `--version`, `--help`, placeholder `login` command
3. `bin` field in package.json pointing to compiled entry

### 8. Shared Package Setup (1h)
1. Export shared types (User, Document, Tenant, ApiKey, etc.)
2. Export Zod schemas for request/response validation
3. Export constants (roles, permissions, limits)

### 9. CI/CD Pipeline (2h)
1. `.github/workflows/ci.yml`:
   - Trigger: push to main, PR
   - Steps: checkout, pnpm install, turbo lint, turbo type-check, turbo test
   - Deploy job (main only): wrangler deploy api, wrangler pages deploy web
2. `.gitignore`: node_modules, dist, .wrangler, .dev.vars, *.local

## Todo List
- [ ] Initialize pnpm workspace + turbo.json
- [ ] Create tsconfig.base.json + ESLint + Prettier configs
- [ ] Setup packages/api with Hono + wrangler.toml bindings
- [ ] Setup packages/web with React 19 + Vite
- [ ] Setup packages/cli with Commander.js skeleton
- [ ] Setup packages/shared with types + schemas
- [ ] Create Drizzle schema (tenants, users, sessions, api_keys, audit_logs)
- [ ] Generate initial D1 migration
- [ ] Create Cloudflare resources (D1, R2, KV via wrangler CLI)
- [ ] Setup .github/workflows/ci.yml
- [ ] Verify `pnpm turbo run dev` runs API + Web in parallel
- [ ] Verify `pnpm turbo run build` succeeds for all packages

## Success Criteria
- `pnpm install` completes without errors
- `pnpm turbo run build` builds all 4 packages
- `pnpm turbo run dev` starts API (port 8787) + Web (port 5173) with hot reload
- `pnpm turbo run lint` and `pnpm turbo run type-check` pass
- D1 migration applies successfully in local mode
- CI workflow passes on push

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Wrangler version incompatibility | Medium | High | Pin wrangler version, test locally |
| Drizzle D1 adapter bugs | Low | Medium | Fallback to raw SQL if needed |
| Turbo cache invalidation issues | Low | Low | Clear cache: `turbo run build --force` |

## Security Considerations
- `.dev.vars` in .gitignore — never commit secrets
- Wrangler secrets for prod: `wrangler secret put JWT_SECRET`
- No hardcoded API keys or tokens in source

## Next Steps
- Phase 2: Authentication & Multi-Tenant System (depends on schema + API skeleton from this phase)
