---
title: Cloudflare Ecosystem Research for AgentWiki
date: 2026-03-18
author: researcher
status: complete
---

# Cloudflare Ecosystem Research: Full-Stack Enterprise Knowledge Management

## Executive Summary

AgentWiki can be built entirely on Cloudflare infrastructure. The ecosystem provides all necessary components (compute, storage, database, AI, collaboration), but **multi-tenancy requires careful database sharding**, **real-time features need Durable Objects**, and **knowledge base size is constrained by D1's 10GB per-database limit**. Framework choice (Remix/SvelteKit best for server-first approach; React+Vite for pure SPA) depends on whether you need server-side rendering and form handling.

---

## 1. COMPUTE LAYER: Cloudflare Workers

### Runtime Limits (Critical)

| Limit | Value | Impact |
|-------|-------|--------|
| Default CPU time | 30 seconds | Most business logic OK; long analytics/exports need Queues |
| Max CPU time (opt-in) | 5 minutes (300s) | Requires wrangler config `cpu_ms: 300000` |
| Memory per isolate | 128 MB | Heap + WASM; exceeding triggers new isolate |
| Code size (free) | 3 MB compressed | Use tree-shaking, dynamic imports |
| Code size (paid) | 10 MB compressed | Still tight for monolithic apps |
| Global scope execution | 1 second max | Keep top-level code minimal |

### Key Gotchas

- **CPU time ≠ wall-clock time**: Waiting for I/O (D1 queries, R2 uploads, API calls) doesn't count. 5-minute limit is real CPU work.
- **Memory management**: 128 MB is shared across request handler + all allocations. Large JSON parsing or image processing can hit limits.
- **No built-in file system**: Use R2 for storage; KV for small caches.
- **Request duration**: No hard timeout if client stays connected, but practical limits apply (~30 min observed).

### Best Practices

- Use **Hono** for routing (minimal overhead, Cloudflare-native).
- Offload long jobs to **Queues** (batch processing, exports, summarization).
- Stream large responses to avoid memory spikes.
- Compress code aggressively (tree-shake, minify).

### Verdict

✅ **Production-ready** for typical CRUD APIs, auth, routing. ❌ **Not suitable** for CPU-intensive ops (image processing, complex ML) without offloading.

---

## 2. DATABASE LAYER: Cloudflare D1

### Critical Limits

| Constraint | Value | Impact |
|-----------|-------|--------|
| Max DB size | 10 GB | **Hard limit**; no expansion |
| Max rows per UPDATE/DELETE | ~100k-1M range | Batch large mutations in chunks |
| Row size | ~6-8 MB practical limit | SQLite row size constraint |
| Query length | Configurable but practical ~1 MB | Complex nested queries risk failure |
| Tables per database | Practical ~100-500 | Not a hard limit; performance degrades |
| Transaction isolation | SQLite default (DEFERRED) | Good for single-tenant; careful with concurrent writes |

### Multi-Tenancy Pattern

**Recommended: Database-per-tenant sharding**
- Create separate D1 database per customer/org.
- Cloudflare allows "thousands of databases at no extra cost" (pricing per query + storage).
- Routing logic selects correct DB based on tenant context.
- **Gotcha**: Cross-tenant queries become complex; design for tenant isolation upfront.

### Drizzle ORM Support

✅ Full support via `drizzle-orm/d1` adapter.
```typescript
import { drizzleD1 } from 'drizzle-orm/d1';
const db = drizzleD1(env.DB); // env.DB from D1 binding
```

- **Good**: Type-safe schemas, migrations, query builder.
- **Gotcha**: Migrations run in Workers context (CPU/time-limited); large migrations may fail.

### Batch Operations Requirement

Knowledge base seeding, bulk imports, re-indexing all need batching:
```typescript
// Bad: Updates 100k rows at once
await db.update(docs).set({indexed: true})

// Good: Batch in 1k-row chunks
for (let i = 0; i < totalRows; i += 1000) {
  await db.update(docs)
    .set({indexed: true})
    .limit(1000)
    .offset(i)
}
```

### Verdict

✅ **Good for**: Multi-tenant SaaS with <10GB per tenant. ❌ **Poor for**: Monolithic large knowledge bases, complex analytics.

---

## 3. OBJECT STORAGE: Cloudflare R2

### Capabilities & Limits

| Feature | Details |
|---------|---------|
| S3-compatible API | Full AWS S3 SDK support; drop-in replacement |
| Pricing | No egress fees (vs AWS S3); reduces costs significantly |
| Max object size | 5 TB per object |
| Presigned URLs | Supported; can expire or set custom headers |
| CORS | Fully configurable; needed for browser uploads |
| Multipart upload | Supported; good for large files |

### Best for AgentWiki

- Document uploads (PDFs, images, attachments).
- Generated exports (markdown, HTML, PDFs).
- Avatar/profile images.
- Backup snapshots of D1 databases.

### Gotcha

- **No automatic versioning**: Implement versioning logic in D1 (store metadata + timestamps).
- **Eventual consistency**: May take moments for uploaded objects to be fully available; acceptable for most use cases.

### Verdict

✅ **Production-ready**. Ideal storage layer; pricing better than AWS S3.

---

## 4. CACHING & SESSION STORE: Cloudflare KV

### Characteristics

| Aspect | Details |
|--------|---------|
| Consistency model | Eventual; global replication ~60 seconds |
| TTL | Supported; max 24 hours via API |
| Max value size | 25 MB per key |
| Strong consistency | Not available by default |
| Use cases | Caching, sessions, rate-limit counters |

### For AgentWiki

- **Session storage**: JWT tokens + user metadata.
- **Page cache**: Rendered documents (cheap invalidation).
- **Rate limiting**: Count API calls per user.
- **Sidebar index**: Quick access to org/user document lists.

### Gotcha

- **Eventual consistency**: User logs in on US edge, immediately navigates to EU — may see stale session data briefly. For auth-critical ops, use D1.
- **No strong consistency** without workarounds (Durable Objects add latency).

### Verdict

✅ **Good for** read-heavy workloads, non-critical caching. ⚠️ **Avoid for** mission-critical auth (use D1 or Durable Objects instead).

---

## 5. VECTOR DATABASE: Cloudflare Vectorize

### Core Capabilities

| Limit | Value | Impact |
|-------|-------|--------|
| Max stored dimensions per account | 5 million | One index with 384-dim embeddings = ~13k vectors |
| Max queried dimensions/month | 30 million | Budget for search + recommendations |
| Max topK results | 100 | Limited recall; design UI/UX accordingly |
| Batch insert limit | 200k vectors or 1k updates | Batch seeding in chunks |
| Consistency | **Eventual**; async writes | Delay between insert and query visibility |
| Metadata filtering | Only new indexes (post-Dec-2023) | Filter by org_id, doc_type, etc. |
| Fixed configuration | Dimensions + distance metric immutable | Choose once, don't change |

### Integration with Workers AI

- **Workers AI** generates embeddings (e.g., `bge-base-en`).
- Call Workers AI from Workers → get embedding → store in Vectorize → query for semantic search.
- Pipeline: `document → tokenize → embed (Workers AI) → store (Vectorize) → search`.

### Multi-Tenancy in Vectorize

**Strategy**: Use metadata filtering
```typescript
// Embed + store with tenant metadata
await vectorize.insert([{
  id: "doc-123",
  values: [0.1, 0.2, ...], // 384-dim embedding
  metadata: { org_id: "org-456", doc_type: "page" }
}])

// Query only org-456 docs
const results = await vectorize.query([0.15, 0.25, ...], {
  topK: 10,
  filter: { org_id: { eq: "org-456" } }
})
```

### Gotcha

- **Eventual consistency**: Insert doc, search immediately → may not appear yet. Add UI messaging or retry logic.
- **5M dimension budget**: For knowledge base with 50k pages × 384-dim embeddings = 19.2M dimensions. Near budget; scaling requires multiple indexes (per-tenant sharding again).

### Verdict

✅ **Viable for** semantic search, recommendations, <50k docs per org. ❌ **Poor for** massive public knowledge bases without sharding.

---

## 6. AI MODELS: Cloudflare Workers AI

### Available Models for AgentWiki

| Model | Task | Dims | Note |
|-------|------|------|------|
| `@cf/baai/bge-base-en` | Embeddings | 768 | Good quality, reasonable dims |
| `@cf/mistral/mistral-7b-instruct-v0.2` | Text generation | - | Summarization, Q&A |
| `@cf/openai/whisper` | Speech→text | - | Not needed initially |
| `@cf/qwen/qwen-14b-chat-awq` | Chat completion | - | General assistant |

### Gotcha

- **Limited model selection**: No Claude, GPT-4, or specialized models; community-sourced open models.
- **Rate limits**: Per-account limits; check docs for current quotas.
- **Cost**: Inference metered; summarizing 10k documents could be expensive without caching.

### Best for AgentWiki

- Generating embeddings for semantic search (primary use).
- Summarizing long documents on-demand.
- Auto-tagging pages by content (classification).
- Simple chatbot for knowledge base Q&A.

### Verdict

✅ **Sufficient for** MVP knowledge base features. ⚠️ **Consider alternatives** (OpenAI API, Anthropic) if advanced NLP needed.

---

## 7. ASYNC PROCESSING: Cloudflare Queues

### Characteristics

| Feature | Details |
|---------|---------|
| Max message size | 100 KB | Documents need chunking |
| Retry policy | Configurable exponential backoff | Default: 30 retries over ~23 hours |
| Dead-letter queue | Supported | Auto-route failed jobs after max retries |
| Ordering | FIFO per consumer | Good for sequential processing |
| Latency | ~30 seconds typical delivery | Not real-time; batch processing OK |

### For AgentWiki

- **Bulk document import**: Queue each doc, worker processes batch-by-batch.
- **Generating embeddings**: AI calls are expensive; queue in background.
- **Exporting knowledge base**: Generate PDF/markdown asynchronously.
- **Cleanup jobs**: Deleting orphaned attachments, archiving old revisions.
- **Reindexing**: Rebuild Vectorize index incrementally.

### Gotcha

- **No job visibility UI**: Need custom dashboard to track queued jobs. Implement in D1 + Workers.
- **30-second+ latency**: Not suitable for real-time features; use Durable Objects instead.

### Verdict

✅ **Essential for** batch jobs, exports, heavy lifting.

---

## 8. REAL-TIME & STATE: Cloudflare Durable Objects

### Use Cases for AgentWiki

| Scenario | Solution |
|----------|----------|
| Real-time collaborative editing | Durable Objects + WebSocket |
| Live cursor tracking (multi-user) | Durable Objects state |
| Notification broadcasting | Durable Objects as message hub |
| Rate limiting (strong consistency) | Durable Objects counter |
| Session manager | Durable Objects for critical sessions |

### Key Limits

- **Pricing**: Per-second duration + storage (expensive; ~$0.15/GB-month stored state).
- **Scalability**: One Durable Object instance = ~5,000 WebSocket connections (rough estimate).
- **State size**: No hard limit, but practical ~10 MB recommended.

### Example: Real-Time Collab Editor

```typescript
export class PageEditor {
  state: DurableObjectState
  env: Env
  sessions = new Map() // WebSocket connections

  async fetch(request: Request) {
    if (request.headers.get('Upgrade') === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair())
      server.accept()
      this.sessions.set(Date.now(), server)
      // Handle edits, broadcast to all sessions
      return new Response(null, { status: 101 })
    }
  }
}
```

### Gotcha

- **Cost**: Real-time collab for 100 concurrent users = significant bill. Consider optional feature (per-plan tier).
- **Regional latency**: Durable Objects pin to region; may not be optimal for all users.

### Verdict

✅ **Viable for** real-time collab (enterprise tier). ⚠️ **Premium feature** due to cost.

---

## 9. IDENTITY & ACCESS: Cloudflare Access / Zero Trust

### SSO Support

| Provider | Status |
|----------|--------|
| Google Workspace | ✅ Full support |
| GitHub | ✅ Full support |
| Okta | ✅ SAML/OIDC |
| Microsoft Entra | ✅ SAML/OIDC |
| Custom SAML/OIDC | ✅ Supported |

### JWT Validation

Cloudflare Access issues JWTs; Workers can validate:
```typescript
const token = request.headers.get('Cf-Access-Jwt-Assertion')
const verified = await env.ACCOUNT.id_token.validate(token)
// verified = { email, groups, kid, aud, ... }
```

### For AgentWiki

- **Enterprise SSO**: Redirect to Okta/Google; validate JWT in Workers.
- **Multi-org access**: Store org membership in D1; check groups in JWT.
- **Rate limiting per user**: Use verified email as key.

### Gotcha

- **Requires Cloudflare plan**: Access is part of Zero Trust (business plan minimum).
- **Local development**: JWT validation tricky without real Access instance; use mock JWTs in dev.

### Verdict

✅ **Enterprise-grade** identity. ⚠️ **Paid feature** (not free tier).

---

## 10. FRONTEND: Cloudflare Pages

### Framework Integration

| Framework | Status | Best For |
|-----------|--------|----------|
| **Astro** (Cloudflare-owned post-Jan-2026) | ✅ Best-in-class | Static/hybrid content sites |
| **React (+ Vite)** | ✅ Full SPA support | Complex interactive UIs |
| **Remix** | ✅ Server-side rendering | Form-heavy, progressive enhancement |
| **SvelteKit** | ✅ Full support | Developer experience, smaller bundles |
| **Next.js** | ⚠️ Partial (Pages Functions used) | Not ideal; Vercel bias |

### For AgentWiki (Knowledge Management SPA)

**Recommended: React + Vite (SPA) or Remix (SSR)**

#### React + Vite Approach
- **Pros**: True SPA; fast client-side navigation; state management flexibility.
- **Cons**: Larger initial bundle; SEO poor (mitigated with meta tags).
- **Worker integration**: Pages Functions in `functions/` directory auto-route API calls.
- **Bundle size**: ~50-100 KB gzip (React + router + UI lib); acceptable.

#### Remix Approach (Server-First)
- **Pros**: Server-side rendering for SEO; form handling native; smaller JS on client.
- **Cons**: More latency (every navigation hits edge); requires session state (D1/KV).
- **Best for**: Enterprise docs, compliance-heavy scenarios where SEO matters.

### Integration with Workers

```
pages/
├── index.html
├── package.json
functions/
├── api/
│   ├── [[route]].ts  # Catch-all; routes to API layer
```

Files in `functions/` auto-bind to `/api/*` routes on Cloudflare Pages. Seamless Pages ↔ Workers integration.

### Verdict

**For AgentWiki**: Use **React + Vite + Hono (Workers)** for pure SPA with rich editor. Use **Remix** if SEO + form-heavy workflows are priorities. **Astro** is too static-focused for dynamic knowledge bases.

---

## 11. BLOCK EDITOR: Notion-Like UI

### Candidates

| Library | Best For | Trade-offs |
|---------|----------|-----------|
| **BlockNote** | Out-of-the-box Notion UX | Built on Tiptap/ProseMirror; less control |
| **Tiptap** | Customization + low-level control | Steeper learning curve; need schema design |
| **Plate** | Complex editors (AI-powered) | Still niche; less community than Tiptap |
| **Novel** | AI + markdown focus | Newer; smaller ecosystem |

### Recommendation: BlockNote

**Why:**
- ✅ Drag-drop blocks out-of-the-box (Notion UX).
- ✅ Built on Tiptap/ProseMirror (battle-tested).
- ✅ Collaboration via Yjs (compatible with Durable Objects).
- ✅ Active community, good docs.

**Integration Example:**
```typescript
import { BlockNoteEditor } from "@blocknote/core"
import { BlockNoteView } from "@blocknote/react"

export function PageEditor({ docId, initialContent }) {
  const editor = useBlockNoteEditor({
    onEditorContentChange: (editor) => {
      // Sync to D1 + broadcast via Durable Objects
    }
  })
  return <BlockNoteView editor={editor} />
}
```

### Gotcha

- **Bundle size**: BlockNote + dependencies ~100 KB gzip; acceptable for SPA.
- **Collaboration setup**: Requires connecting Yjs + WebSocket for real-time (use Durable Objects).
- **Headless rendering**: If exporting to HTML/PDF, use `@blocknote/core` (not React) for server-side rendering in Workers.

### Verdict

✅ **Recommended** for Notion-like UX with active community support.

---

## 12. MONOREPO & LOCAL DEVELOPMENT

### Setup: Turborepo + Wrangler

```
agentwiki/
├── turbo.json                    # Monorepo config
├── package.json (root)
├── packages/
│   ├── api/                      # Cloudflare Workers (Hono)
│   │   ├── wrangler.toml
│   │   ├── src/
│   │   │   ├── index.ts          # Worker entry
│   │   │   └── routes/
│   │   └── package.json
│   └── web/                      # React + Vite
│       ├── vite.config.ts
│       ├── src/
│       │   ├── pages/
│       │   ├── components/
│       │   └── App.tsx
│       └── package.json
├── docs/                         # Shared types, utils
└── pnpm-workspace.yaml           # pnpm monorepo
```

### Local Dev Workflow

```bash
# Install dependencies
pnpm install

# Watch mode: API + Web in parallel
pnpm turbo run dev --parallel

# Build for production
pnpm turbo run build

# Deploy
cd packages/api && wrangler deploy
cd packages/web && wrangler pages deploy
```

### Key Commands

```bash
# Wrangler: bind D1, R2, etc.
wrangler d1 create agentwiki-db
wrangler r2 bucket create agentwiki-files

# Local testing with bindings
wrangler dev --local

# Seed D1 in local mode
wrangler d1 execute agentwiki-db --file=seed.sql --local
```

### Gotcha

- **CORS in local dev**: `wrangler dev` runs API on different port; need CORS headers or proxy config.
- **Environment variables**: Secrets in `wrangler.toml`; dev uses `.dev.vars` file (git-ignored).

### Verdict

✅ **Standard setup** for full-stack Cloudflare projects.

---

## ARCHITECTURE SUMMARY: Recommended Stack

```
┌─────────────────────────────────────┐
│  React + Vite (SPA)                 │ Cloudflare Pages
│  BlockNote Editor + Yjs             │
└────────────────┬────────────────────┘
                 │ (API calls)
┌────────────────▼────────────────────┐
│  Cloudflare Workers (Hono)          │ Edge compute
│  - Auth / JWT validation            │
│  - CRUD routes                      │
│  - Document orchestration           │
└────────────────┬────────────────────┘
        ┌────────┼────────┐
        │        │        │
        ▼        ▼        ▼
    ┌─────┐  ┌─────┐  ┌──────────┐
    │ D1  │  │ R2  │  │ Vectorize│ Data layer
    │Multi│  │Docs/│  │Embeddings│
    │tenant│  │Assets│ │(bge-base)│
    └─────┘  └─────┘  └──────────┘

┌──────────────────────────────────────┐
│ Workers AI (embeddings, summarization)│ ML/AI
│ Queues (batch processing)             │
│ Durable Objects (collab, optional)    │
└──────────────────────────────────────┘
```

---

## GOTCHAS & TRADE-OFFS

### Data Constraints
1. **D1 10 GB per DB**: Knowledge base capped unless using per-tenant sharding.
2. **Vectorize 5M dims**: ~13k documents with 384-dim embeddings; scale with multiple indexes.
3. **Worker 128 MB heap**: Large JSON payloads may trigger OOM; stream or paginate.

### Operational Gotchas
1. **No built-in observability**: Integrate Grafana/Datadog for monitoring; Cloudflare logs are basic.
2. **Cold starts**: Negligible (~5-10 ms); not an issue.
3. **Regional latency**: Durable Objects pin to region; KV eventual consistency may surprise users globally.

### Cost Gotchas
1. **D1 pricing**: ~$0.30/million reads + $1.50/million writes; monitor for query abuse.
2. **Vectorize**: $0.02 per 1M stored dimensions/month + $0.20 per 1M queries/month; query-heavy search can add up.
3. **Durable Objects**: $0.15/GB-month state storage + per-second duration; collab features cost real money.

### Security Gotchas
1. **D1 migrations**: Sensitive schema changes should be guarded behind feature flags; rollback complexity.
2. **R2 presigned URLs**: Validate expiry; use short TTLs (15 min) for private docs.
3. **JWT expiry**: Cloudflare Access JWTs have short lifetimes (~15 min); refresh logic required.

---

## UNRESOLVED QUESTIONS

1. **Real-time collab scope**: Is WebSocket-based real-time editing a must-have or premium feature? (Impacts Durable Objects cost.)
2. **Search relevance**: Will semantic search (Vectorize) alone suffice, or do you need keyword + semantic hybrid?
3. **Multi-workspace architecture**: Single Cloudflare account or per-customer accounts? (Affects billing, isolation.)
4. **Data residency**: Need GDPR-compliant EU data storage? (Cloudflare Pages + Workers run globally; storage region is configurable for D1/R2.)
5. **Audit logging**: Must all document changes be logged? (Impacts D1 storage budget.)

---

## SOURCES

- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Workers CPU Time Increase (5 min limit)](https://developers.cloudflare.com/changelog/post/2025-03-25-higher-cpu-limits/)
- [Cloudflare D1 Limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Cloudflare D1 FAQs](https://developers.cloudflare.com/d1/reference/faq/)
- [Cloudflare Vectorize Limits](https://developers.cloudflare.com/vectorize/platform/limits/)
- [Cloudflare Vectorize Overview](https://developers.cloudflare.com/vectorize/)
- [Next.js vs Remix vs Astro vs SvelteKit in 2026: Framework Comparison](https://pockit.tools/blog/nextjs-vs-remix-vs-astro-vs-sveltekit-2026-comparison/)
- [Astro in 2026: Why It's Beating Next.js for Content Sites (Cloudflare Acquisition)](https://dev.to/polliog/astro-in-2026-why-its-beating-nextjs-for-content-sites-and-what-cloudflares-acquisition-means-6kl)
- [BlockNote GitHub](https://github.com/TypeCellOS/BlockNote)
- [BlockNote vs Tiptap Comparison](https://tiptap.dev/alternatives/blocknote-vs-tiptap)
