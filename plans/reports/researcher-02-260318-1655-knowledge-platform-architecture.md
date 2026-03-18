---
title: AgentWiki Architecture Patterns Research
date: 2026-03-18
type: research
---

# AgentWiki Knowledge Platform Architecture Research

## Executive Summary

Research covers 8 critical architectural domains for enterprise knowledge management platform serving humans (web UI) and AI agents (CLI/API). Focus on production-ready patterns, security standards, and proven technology choices.

---

## 1. Multi-Tenant Architecture & Isolation

### Pattern: Pool Pattern (Recommended)
- **Model**: Single database, single schema, shared tables with `tenant_id` column
- **Trade-off**: Maximum resource efficiency vs minimal isolation
- **Data Leak Risk**: 92% of SaaS breaches stem from isolation failures (missing WHERE tenant_id = ? clauses)

### Row-Level Security (RLS) Implementation
PostgreSQL RLS moves filtering responsibility to database engine, enforcing access at query execution level:
```
- Application filters by tenant (primary defense)
- Database RLS filters by tenant (defense-in-depth, catches application misses)
- Single points of failure eliminated: one missed filter affects single tenant only
```

### API Key Management for AI Agents
- Store hashed API keys (never plaintext) with tenant association
- Implement key rotation policies (30-90 day expiry recommended)
- Track key usage via audit logs (which agent, which documents, when)
- Support key scoping: limit API key to specific document collections/permissions

### RBAC Permission Model
Standard tiers for knowledge platforms:
- **Admin**: Full CRUD on tenant resources, user management, settings
- **Editor**: Create/edit/delete documents within assigned collections
- **Viewer**: Read-only access to shared documents
- **Agent**: API-only, scoped to specific collections/read operations

**Implementation**: Store as (tenant_id, user_id, role, resource_type) tuples, check at request time.

---

## 2. Markdown + YAML Frontmatter Pipeline

### Parsing Libraries
- **gray-matter** (Recommended): Industry standard, battle-tested across Gatsby, VitePress, TinaCMS
  - Supports YAML, TOML, JSON frontmatter
  - Fast, low dependencies
  - Export: `{ data: {...}, content: "..." }`

- **remark ecosystem** (For AST-based processing):
  - `remark-frontmatter`: Parse frontmatter syntax (doesn't extract values)
  - `remark-parse-frontmatter`: Parse + validate YAML with schema (revalidator)
  - Integrates with unified ecosystem for composable transforms

### YAML Schema Design
```yaml
---
title: Document Title
category: Engineering  # taxonomy for filtering
tags: [architecture, database]
access: private|specific|public  # sharing model
shared_with: ["user@example.com", "agent-key-id"]
version: 1
created_at: 2026-03-18
updated_at: 2026-03-18
---
```

### Rendering Pipeline
1. **Parse**: gray-matter extracts frontmatter + markdown content
2. **Validate**: JSON Schema validates frontmatter against platform schema
3. **Transform**: remark plugins for syntax highlighting, math, custom blocks
4. **Render**: Render to HTML (using remark-html or react-markdown)

**Security**: Sanitize HTML output (remark-html-sanitize) to prevent XSS.

---

## 3. Hybrid Search: Vector + Full-Text + Semantic

### Architecture
```
Document Ingestion
  ├─ Chunking (syntactic, semantic, or hierarchical)
  ├─ Full-text indexing (SQLite FTS5 or Postgres pg_trgm)
  ├─ Embedding generation (SentenceTransformer, MiniLM)
  └─ Vector storage (Postgres pgvector, or vector DB)

Query Processing
  ├─ Parse query into embeddings + keywords
  ├─ Parallel search: vector similarity + full-text BM25
  ├─ Combine results (RRF: Reciprocal Rank Fusion)
  └─ Rerank (optional: +10-30% precision, +50-100ms latency)
```

### Chunking Strategy
- **Recommended**: Semantic + hierarchical overlap
  - Chunk by heading/section (preserve context)
  - Add 150-token overlap (7% recall improvement per NVIDIA benchmarks)
  - Fallback to recursive chunking for unstructured content
  - Max chunk size: 512 tokens (embedding context limit)

### Embedding Pipeline
- **Model**: E5-small/MiniLM-L6 (efficient, 384-dim, good for knowledge docs)
- **Normalization**: L2-normalize for cosine similarity
- **Storage**: Postgres with pgvector extension (single-table simplicity)
- **Index**: HNSW or IVFFlat for similarity search at scale

### Re-ranking
- Apply BM25 full-text scores + cosine similarity scores
- Fuse via Reciprocal Rank Fusion (RRF) formula
- Optional: LLM reranking for top-5 results (expensive, high precision)

---

## 4. Knowledge Graph Visualization

### Library Comparison

| Library | Nodes | Customization | Use Case |
|---------|-------|---------------|----------|
| **Cytoscape.js** | 10K-100K | High | Graph algorithms, force-directed |
| **D3.js** | 100K+ | Maximum | Custom layouts, animation-heavy |
| **react-force-graph** | 1K-10K | Medium | React integration, quick setup |
| **Sigma.js** | 100K+ | Medium | WebGL rendering, performance |

### Recommended: Cytoscape.js
- Handles 10-100K nodes comfortably
- Force-directed layouts (spring embedder)
- Rich node/edge styling
- Built-in physics + animation
- React wrapper available (cytoscape-react)

### Link Extraction & Bidirectional Links
1. **Link Detection**: Scan markdown for wikilinks `[[Document Name]]`
2. **Extract Relationships**:
   - Forward links: `Document A → Document B`
   - Backlinks: Auto-compute reverse edges
3. **Storage**: Edge table with (source_doc_id, target_doc_id, link_type, context)
4. **Visualization**:
   - Node = document
   - Edge = link + text preview on hover
   - Color = document category/type

### Agentic Extensions (2026)
- Agents autonomously decide node grouping based on semantic similarity
- Dynamic graph updates as agents crawl/analyze documents
- Annotation layer for agent reasoning (why is this node connected?)

---

## 5. Content Versioning & Publishing

### Append-Only Changelog Model
Simpler than git-like:
```
documents table: (id, title, tenant_id, current_content)
document_versions table: (id, doc_id, content, author, timestamp, change_summary)
```
- Always append new version, never overwrite
- Efficient: cheap reads, cheap writes
- Trade-off: No branching, no merge conflicts

### HTML Export & Publishing
1. **Export Pipeline**:
   - Fetch document + dependencies (linked documents)
   - Render markdown → HTML with inline CSS
   - Generate table of contents from headings
   - Export as self-contained HTML file

2. **Public Sharing URLs**:
   - Generate short ephemeral URLs: `/share/{token}`
   - Token maps to (doc_id, permissions, expiry)
   - No auth required to access shared link
   - Expiry: 7-90 days, configurable per document

3. **Access Control**:
   - Private: Owner + explicitly shared users
   - Specific: Share via email invites (create invite tokens)
   - Public: Anyone with link can view

---

## 6. CLI Design for API Wrapper

### Framework Recommendation
- **Commander.js** (35M weekly downloads):
  - Lightweight, minimal dependencies
  - Excellent TypeScript support
  - Better for simple, single-file CLIs
  - ~20KB bundled

- **oclif** (Salesforce open source):
  - Plugin architecture for extensible CLIs
  - Auto-generates help, shell completions
  - Better for multi-command tools (5+ commands)
  - Requires more boilerplate

### AuthN for CLI: Device Code Flow

**Flow**:
1. User runs: `agentwiki login`
2. CLI generates code: `ABCD1234`
3. CLI prints: `Authenticate at https://agentwiki.com/device?code=ABCD1234`
4. User opens URL, signs in
5. CLI polls backend for completion
6. Backend returns API token (or error)
7. CLI stores token locally: `~/.agentwiki/credentials.json` (encrypted)

**Advantages**:
- No password shared with CLI
- Works for headless/SSH terminals
- Better UX than API key entry

### Command Structure
```bash
agentwiki login                    # Device code auth
agentwiki doc list                 # List documents
agentwiki doc get <id>             # Fetch document (JSON)
agentwiki doc create --file x.md   # Create from file
agentwiki doc search <query>       # Hybrid search
agentwiki doc link <id>            # Generate share link
agentwiki graph export <id>        # Export graph as JSON
```

### Local State Management
- Config: `~/.agentwiki/config.json` (tenant_id, default collection)
- Credentials: `~/.agentwiki/credentials.json` (API token, encrypted with keychain/credential store)
- Cache: `~/.agentwiki/cache/` (optional, for search indexes)

---

## 7. Enterprise Security Standards

### OWASP Top 10 for Knowledge Platforms

| Risk | Mitigation |
|------|-----------|
| **Injection** (SQL, Command) | Parameterized queries, schema validation, no dynamic SQL |
| **AuthN/AuthZ** | MFA, session timeout (30 min), RBAC enforcement |
| **Sensitive Data** | Encrypt PII (names, emails) at rest, TLS 1.3+ in transit |
| **XXE/XPath** | Disable XML external entities, sanitize markdown |
| **Broken Access Control** | RLS at database layer, check user permissions on every request |
| **Broken Auth** | No hardcoded tokens, rotate API keys, device code flow for CLI |
| **SSRF** | Whitelist allowed domains for links, no redirect to user-supplied URLs |
| **Insecure Deserialization** | Validate JSON schema, no pickle/eval, use type-safe parsers |
| **Vulnerable Components** | Audit dependencies monthly, patch within 24h for critical CVEs |
| **Insufficient Logging** | Log auth events, API calls, document access by agent/user |

### Rate Limiting
- API: 100 req/min per API key (burst: 20 req/sec)
- Web: 1000 req/min per session
- Search: 50 queries/min (expensive operation)

### Audit Logging
```
audit_logs table:
  - tenant_id, user_id/agent_id, action, resource, timestamp, ip_address, user_agent
  - Immutable: no deletes, append-only
  - Retention: 1 year
  - Searchable: tenant_id + date range
```

### Data Encryption

| Layer | Method |
|-------|--------|
| **At Rest** | AES-256-GCM (D1 handles encryption automatically) |
| **In Transit** | TLS 1.3+, HSTS header |
| **API Keys** | Hash with bcrypt/Argon2, store hash only |
| **PII in Logs** | Tokenize (replace email with anon ID) |

### RBAC/ABAC Model
- **RBAC**: Role-based (Admin, Editor, Viewer, Agent)
- **ABAC**: Attribute-based for fine-grain control:
  - User attribute: department
  - Resource attribute: classification (public, internal, confidential)
  - Policy: Allow if (user.department == resource.owner_dept OR user.role == Admin)

---

## 8. Content Sharing Model

### Access Levels

| Level | Who Can Access | Behavior |
|-------|---|---|
| **Private** | Owner only | Not visible to other users; agent needs explicit API key scoping |
| **Specific** | Owner + invited users | Share via email; invitee gets read access; can revoke anytime |
| **Public** | Anyone with link | Share via short URL token; no auth required; optional expiry |

### Share Link Implementation
```
share_links table:
  - token (32-char random), doc_id, created_by, created_at, expires_at, access_level
  - Query: GET /api/share/{token}/document → fetch doc if valid + not expired
  - Cleanup: Cron job removes expired links daily
```

### Email-Based Sharing
1. Owner clicks "Share" → enters email addresses
2. Backend sends invite email with personal link: `/share/{token}?invitee=user@example.com`
3. Invitee clicks link → auto-grants read access if not already invited
4. Optional: User must sign in first (social login, magic link)

### Agent-Based Sharing (API Scoping)
- Create API key with constraints: `{ key_id, tenant_id, doc_collections: ["collection-a"], permissions: ["read", "search"] }`
- Agent uses scoped key → can only access documents in specified collections
- Useful for: Third-party agents, vendor access, sandbox environments

---

## Technology Stack Recommendations

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Database** | SQLite (D1) + pgvector | Single-tenant friendly, embedding support |
| **Frontmatter** | gray-matter | Battle-tested, low overhead |
| **Markdown → HTML** | remark + rehype plugins | Composable, security-focused |
| **Vector Embeddings** | SentenceTransformer (E5-small) | Lightweight, 384-dim, semantic quality |
| **Graph Viz** | Cytoscape.js + React | Handles 10K+ nodes, good JS ecosystem |
| **CLI Framework** | Commander.js | Lightweight, TypeScript, quick CLI setup |
| **Auth Flow** | Device Code OAuth 2.0 | Secure, headless-friendly, industry standard |
| **Audit Logging** | Append-only table + immutable constraints | Tamper-proof, queryable |

---

## Unresolved Questions

1. **Embedding Re-training**: How to update embeddings when documents change? Full re-embed or incremental?
2. **Graph Cycle Detection**: For bidirectional links, how to prevent circular dependencies in knowledge graph?
3. **Vector DB Scale**: At what document count (1M+?) does pgvector become insufficient vs dedicated vector DB?
4. **Semantic Chunking Cost**: What's acceptable overhead of semantic chunking vs regex-based chunking in ingestion pipeline?
5. **Agentic Reasoning Audit Trail**: How to log agent decision-making for knowledge graph construction?

---

## Sources

- [Data Isolation in Multi-Tenant SaaS: Architecture & Security Guide](https://redis.io/blog/data-isolation-multi-tenant-saas/)
- [Multi-Tenant Database Architecture Patterns Explained](https://www.bytebase.com/blog/multi-tenant-database-architecture-patterns-explained/)
- [Multi-tenant data isolation with PostgreSQL Row Level Security](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)
- [Parse Markdown Frontmatter In MDX, Remark, and Unified](https://dev.to/phuctm97/parse-markdown-frontmatter-in-mdx-remark-and-unified-1026)
- [remark-frontmatter Plugin](https://github.com/remarkjs/remark-frontmatter)
- [gray-matter: YAML Frontmatter Parser](https://github.com/jonschlinkert/gray-matter)
- [Building Production RAG: Architecture, Chunking, Evaluation & Monitoring (2026 Guide)](https://blog.premai.io/building-production-rag-architecture-chunking-evaluation-monitoring-2026-guide/)
- [RAG Pipeline Deep Dive: Ingestion, Chunking, Embedding, and Vector Search](https://medium.com/@derrickryangiggs/rag-pipeline-deep-dive-ingestion-chunking-embedding-and-vector-search-abd3c8bfc177)
- [Elastic Hybrid Search Guide](https://www.elastic.co/what-is/hybrid-search)
- [Agentic Knowledge Graphs: Visualizing AI Reasoning with Cytoscape.js](https://medium.com/@visrow/agentic-knowledge-graphs-visualizing-ai-reasoning-in-real-time-with-a2ui-and-cytoscape-js-aff2266b3ff6)
- [Cytoscape.js Documentation](https://js.cytoscape.org/)
- [Crafting Robust Node.js CLIs with oclif and Commander.js](https://leapcell.io/blog/crafting-robust-node-js-clis-with-oclif-and-commander-js)
- [oclif: The Open CLI Framework](https://oclif.io/)
- [How to Build a CLI with Node.js: Commander vs yargs vs oclif](https://www.pkgpulse.com/blog/how-to-build-cli-nodejs-commander-yargs-oclif)
