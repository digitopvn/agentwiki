# AgentWiki: Project Overview & PDR

## Vision

AgentWiki enables enterprises and AI systems to build, manage, and share organizational knowledge through a unified platform. By combining intuitive human interfaces with programmatic APIs, it bridges the gap between traditional knowledge management and AI-driven knowledge discovery.

## Target Users

### Primary
1. **Enterprise Knowledge Teams** — Organizations needing centralized, searchable knowledge bases with version control and access management
2. **AI Agent Operators** — Teams building autonomous agents that need programmatic access to organization knowledge
3. **Technical Documentation Teams** — Teams managing technical docs, APIs, architecture decision records
4. **Product Teams** — Product managers, designers, engineers collaborating on specifications and designs

### Secondary
- Individual consultants/freelancers managing client knowledge
- Open-source project communities maintaining collective documentation
- Research teams managing collaborative papers and findings

## Core Value Propositions

| Proposition | Benefit |
|-----------|---------|
| **Unified Interface** | Humans edit in rich editor; agents query via API; both work on same data |
| **Multi-tenant SaaS** | Multiple organizations, isolated workspaces, enterprise-grade security |
| **Hybrid Search** | Find knowledge fast: keyword search for exact matches, semantic search for concepts |
| **Version History** | Track who changed what and when; audit trail for compliance |
| **Zero-friction Sharing** | Public links, granular access control, publish as web pages |
| **Cloudflare Native** | Edge-computed, no ops burden, automatic scaling, pay-as-you-go |

## Feature Matrix

### MVP (Implemented)

#### Knowledge Management
- [x] Create, read, update, delete documents
- [x] Rich text editor (BlockNote) with markdown export
- [x] Hierarchical folder structure
- [x] Document tagging and categorization
- [x] Version history with change tracking
- [x] Wikilinks between documents

#### Search & Discovery
- [x] Full-text keyword search (D1 FTS)
- [x] Semantic search (Cloudflare Vectorize)
- [x] Hybrid search with RRF fusion
- [x] Search filters (folder, tag, category)
- [x] Document preview in search results

#### Collaboration & Sharing
- [x] Multi-tenant workspace isolation
- [x] Role-based access control (Admin, Editor, Viewer, Agent)
- [x] Invite team members
- [x] Token-based share links (public/private)
- [x] Publish documents as web pages

#### Authentication
- [x] OAuth 2.0 (Google, GitHub)
- [x] Email-based user registration
- [x] Session management (JWT + refresh tokens)
- [x] API keys for agent/CLI access
- [x] Rate limiting and abuse prevention

#### Files & Attachments
- [x] File uploads to Cloudflare R2
- [x] Inline image embedding in documents
- [x] File deletion and cleanup
- [x] CDN serving from R2

#### AI Features
- [x] Auto-summarization via Workers AI
- [x] Vector embeddings via Vectorize
- [x] Async job processing via Queues

#### Developer Experience
- [x] REST API with OpenAPI schema
- [x] Command-line interface (CLI)
- [x] Type-safe SDKs (TypeScript)
- [x] Comprehensive error handling

### Phase 2 Roadmap (Planned)

#### Real-time Collaboration
- [ ] Operational Transform for concurrent editing
- [ ] WebSocket cursors and presence indicators
- [ ] Live comment threads
- [ ] Notification system (mentions, changes)

#### Enhanced Search
- [ ] Query syntax (AND, OR, NOT, "phrase search")
- [ ] Saved searches and filters
- [ ] Search analytics dashboard
- [ ] Custom ranking/boosting

#### Compliance & Security
- [ ] GDPR compliance (data export, deletion)
- [ ] SOC 2 audit readiness
- [ ] End-to-end encryption option
- [ ] IP whitelisting for enterprise

#### Performance & Reliability
- [ ] End-to-end test suite
- [ ] Performance benchmarks
- [ ] Disaster recovery & backups
- [ ] Multi-region failover

#### Graph & Visualization
- [ ] Interactive knowledge graph (Cytoscape.js)
- [ ] Document relationship analysis
- [ ] Graph-based recommendations
- [ ] Visualization exports

## Success Metrics

### User Adoption
- **Target**: 100 pilot customers in Year 1
- **Measure**: Monthly Active Users (MAU), retention rate (>80%)
- **Goal**: <30 min onboarding time, 95% uptime SLA

### Product Quality
- **Target**: <1% error rate on API
- **Measure**: Code coverage >80%, zero critical security incidents
- **Goal**: Response time <200ms for 95th percentile

### Business
- **Target**: Freemium + Premium tiers
- **Measure**: Annual Recurring Revenue (ARR), customer LTV
- **Goal**: 40% YoY growth, <$200 CAC

## Functional Requirements

### FR1: Document Management
- Users can create rich documents with formatting, lists, code blocks
- Documents automatically save every 30 seconds
- Support markdown export and import
- Version history tracks all edits with timestamps and author attribution

### FR2: Multi-tenant Architecture
- Each organization (tenant) has isolated database rows (tenant_id filtering)
- Users belong to one or more tenants with role-based permissions
- Shared resources (files, folders) are tenant-scoped
- Audit logs track all actions by tenant

### FR3: Search
- Keyword search via FTS returns results in <500ms for typical queries
- Semantic search processes all documents into vectors (bge-base-en)
- Hybrid search merges keyword + semantic via RRF
- Results ranked by relevance with snippets

### FR4: API for Agents
- RESTful endpoints for all document operations
- API keys with scopes and expiration
- Rate limiting by key (e.g., 1000 req/hour)
- Deterministic IDs for idempotent operations

### FR5: Authentication & Authorization
- OAuth 2.0 login (Google, GitHub) auto-creates users
- Role-based permissions: Admin (all), Editor (create/edit), Viewer (read), Agent (API only)
- Permission matrix enforced at middleware level
- Audit log on all permission changes

## Non-Functional Requirements

### NFR1: Performance
- API response time: <500ms p95 for search/list queries
- Database: Handle 10,000 documents per tenant with <1s query time
- Uploads: Support files up to 100MB
- Concurrent users: Support 100+ simultaneous editors per tenant

### NFR2: Scalability
- Multi-tenant sharding: Auto-scale to new D1 DB when tenant >10GB
- Cloudflare Workers: Auto-scale to handle 10k req/sec
- Vectorize: Batch embed 1000+ docs without degradation

### NFR3: Reliability
- SLA: 99.5% uptime (Cloudflare SLA)
- Data durability: 99.99% (D1 backup frequency)
- Audit logs: Immutable, queryable for compliance

### NFR4: Security
- HTTPS only (enforced)
- CORS headers (secure origins only)
- CSRF protection on state-changing requests
- Rate limiting (IP-based and key-based)
- PBKDF2 key hashing (salt + 100k iterations)
- XSS protection via Content-Security-Policy
- SQL injection prevention via Drizzle ORM

### NFR5: Usability
- Web UI loads in <3 seconds
- Mobile responsive (tested on iOS Safari, Chrome Android)
- Keyboard shortcuts for power users (Cmd+K search, Cmd+S save)
- Error messages are helpful and actionable

## Technical Constraints

1. **Cloudflare-only** — No external databases or compute; leverage CF edge network
2. **SQLite on D1** — No external SQL migration; fixed to D1's SQLite flavor
3. **TypeScript** — All code must be type-safe; enforce with CI type-check
4. **No external auth** — Use Arctic library for OAuth; no custom implementations
5. **Monorepo structure** — Single git repo with Turborepo task scheduling
6. **pnpm for package management** — Enforced in lockfile + CI

## Architectural Decisions

### AD1: Dual Storage for Documents
**Decision**: Store documents as both Markdown (content) + BlockNote JSON (contentJson)

**Rationale**:
- Markdown is portable, version-control friendly, universally compatible
- BlockNote JSON preserves rich formatting and structure
- Both are serializable, searchable, and diffable

**Trade-off**: Slight duplication; mitigated by automatic sync on save

### AD2: Async Embedding Pipeline
**Decision**: Generate embeddings asynchronously via Cloudflare Queues

**Rationale**:
- Embedding generation is CPU-intensive; don't block document saves
- Decouple document API from AI services
- Handle failures gracefully with retry logic

**Trade-off**: Short delay before semantic search works; acceptable for async workflows

### AD3: Multi-tenant per Single D1
**Decision**: Start with single D1 database; shard by tenant_id; auto-provision new DBs at 10GB

**Rationale**:
- Simple operations initially; low tenant count
- D1 supports up to 100GB with good performance
- Transparent sharding via Drizzle migration

**Trade-off**: Eventual need for distributed transaction handling (acceptable for MVP)

### AD4: JWT + Session Tokens
**Decision**: Short-lived JWT (15 min) + long-lived refresh token (7 days) in sessions table

**Rationale**:
- JWT enables stateless workers; no session store latency
- Refresh tokens revoked on logout (stored in D1)
- Supports mobile and SPA patterns

**Trade-off**: Token revocation non-instant (up to 15 min); acceptable for security posture

## Dependencies

### External Services
- **Cloudflare Workers** — Compute runtime
- **Cloudflare D1** — SQLite database
- **Cloudflare R2** — Object storage
- **Cloudflare KV** — Cache layer
- **Cloudflare Vectorize** — Vector database
- **Cloudflare Queues** — Job queue
- **Cloudflare Workers AI** — Embeddings + summarization
- **Google OAuth** — Authentication
- **GitHub OAuth** — Authentication

### Libraries
- **Hono** — Web framework
- **Drizzle ORM** — Database layer
- **Arctic** — OAuth client
- **BlockNote** — Rich editor
- **Zustand** — State management
- **TanStack Query** — Data fetching
- **Commander.js** — CLI framework

## Success Criteria for MVP

1. ✅ All core CRUD operations functional
2. ✅ Multi-tenant isolation enforced
3. ✅ Search working (keyword + semantic)
4. ✅ Auth (OAuth + API keys) secure
5. ✅ Web UI usable on desktop & mobile
6. ✅ CLI deployable via npm
7. ✅ <100ms latency for 95th percentile queries
8. ✅ Zero critical security vulnerabilities
9. ✅ 80% code coverage on services
10. ✅ Documentation complete and accurate

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| D1 performance at scale | High query latency | Implement caching (KV), optimize indexes, plan sharding |
| Vectorize cost/latency | Expensive embedding generation | Batch processing, cache vectors, rate limit embedding requests |
| Multi-tenant data leaks | Security breach | Enforce tenant_id filtering on all queries, audit logging |
| OAuth provider outages | Users can't log in | Keep local session tokens valid; support emergency access |
| Cloudflare API limits | Service disruption | Monitor usage, implement exponential backoff, contact support |

## Version Roadmap

| Version | Timeline | Focus |
|---------|----------|-------|
| **0.1.0** | Q1 2026 | MVP launch (now) |
| **0.2.0** | Q2 2026 | Real-time collab + E2E tests |
| **0.3.0** | Q3 2026 | Graph visualization + GDPR |
| **1.0.0** | Q4 2026 | Stable production release |
