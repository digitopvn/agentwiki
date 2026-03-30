# AgentWiki: Project Changelog

All notable changes to AgentWiki are documented here, organized by version.

**Current Version**: 0.1.0 (MVP)
**Last Updated**: 2026-03-27

## [0.1.0] — MVP Release (In Progress)

### Added

#### Features
- **Settings Page Tabs Overhaul** (Issue #57) [NEW]
  - Settings URL deeplinking: direct navigation via `/settings?tab=<id>` with refresh persistence
  - Members tab: full CRUD with email-based invite (POST /api/members/invite endpoint)
  - API Keys tab: one-time key display with copy-to-clipboard, key metadata (created, last used, expiry)
  - AI tab: updated provider model lists (OpenAI, Anthropic, Google, OpenRouter, MiniMax, Alibaba); sortable drag-reorder provider priority for fallback chain
  - Storage tab: configurable custom R2 credentials (Account ID, Access Keys, Bucket Name, Test Connection)
  - Shortcuts tab: centralized shortcut definitions, rebindable via key capture UI, localStorage persistence
  - New components: MembersTab, ApiKeysTab, StorageConfigCard, ShortcutsTab (extracted from settings.tsx)
  - New hooks: useStorageSettings (R2 config CRUD)
  - New backend routes: POST /api/members/invite, PATCH /api/ai/settings/order, GET/PUT/DELETE /api/storage/settings, POST /api/storage/test
  - DB schema: ai_settings.priority column (fallback order), new storage_settings table (custom R2 config)
  - New dependencies: @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities (sortable AI provider list), aws4fetch (S3-compatible bucket signing)

- **QMD-Inspired Search Pipeline Improvements** (Issue #38)
  - Position-aware RRF with signal weighting (keyword/semantic/default)
  - KV search caching (5-min TTL)
  - FTS5/BM25 search service (ready for evaluation; not yet wired as primary)
  - Parallel AI query expansion via tenant provider (Promise.all for latency optimization)
  - Folder context enrichment in search results (hierarchy, description)
  - Smart markdown chunking (2000→1200 chars, heading chains, code block protection)
  - Content hash skip (SHA-256) for re-embedding optimization
  - Search debug mode (`?debug=true`) with timing, cache status, expansion metadata
  - Search eval harness: MRR@5, Precision@3, Recall@10, NDCG@10 metrics
  - 5 phases delivered: eval baseline, FTS5 evaluation, position-aware RRF, smart chunking, folder context & parallel expansion

- **Dual-Layer Knowledge Graph** (Issue #34)
  - 6 typed edge types: relates-to, depends-on, extends, references, contradicts, implements
  - Enhanced wikilink syntax: `[[target|type:depends-on]]` (backward compatible)
  - BFS graph traversal: neighbors, subgraph, shortest path (<200ms for 5K docs)
  - Implicit similarity edges via Vectorize (top-5 cached per document)
  - AI auto-classification of edge types via Workers AI (Llama 3.1 8B)
  - Interactive graph visualization with Cytoscape.js force-directed layout
  - AI insight panel: stats, similar docs, path finder, link suggestions
  - 7 MCP tools for AI agent graph reasoning (traverse, find_path, suggest_links, explain_connection, etc.)

- **Auto-save Performance** (Issue #32)
  - Changed debounce timing from 1s to 2s for reduced flickering
  - Separated contentJson (saved immediately) from markdown conversion (deferred via requestIdleCallback)
  - Reduced perceived lag in editor responsiveness

- **Mobile Sidebar Drawers** (Issue #37)
  - Replaced keyframe animations with GPU-accelerated CSS `transform` transitions
  - Added edge swipe gesture support (20px detection zone) for opening/closing sidebars
  - Fixed sidebar positioning for mobile/tablet viewports

- **Markdown File Drag-and-Drop Import** (Issue #21)
  - Extended GlobalDropZone to detect `.md` and `.markdown` file drops
  - Dropped files create new documents via `POST /api/documents`
  - Support for dropping files into specific folders
  - FileReader-based parsing (async, 10MB limit)

#### API & Backend
- Hybrid search (keyword + semantic) with RRF combination
- Vectorize semantic search integration
- Multi-vendor AI providers (6: OpenAI, Anthropic, Google, OpenRouter, MiniMax, Alibaba)
- AI slash commands (5) in BlockNote editor
- AI selection toolbar (6 actions) for text transformation
- R2 file uploads (presigned URLs, 100MB limit)
- File extraction pipeline (PDF, DOCX support)
- Document versioning (append-only history)
- Share links with expiration support
- Public document publishing as web pages
- MCP server (25 tools, 6 resources, 4 prompts)
- Knowledge graph API: 7 REST endpoints (full graph, neighbors, subgraph, path, stats, similar, suggest-links)
- Graph similarity computation via async Queue jobs
- AI edge type inference via Workers AI

#### Frontend Components
- BlockNote rich text editor integration
- 3-panel layout (sidebar, editor, metadata)
- Folder tree navigation (recursive)
- Document tab management
- Document properties editor (title, category, access level)
- Tag management UI
- Version history timeline
- Storage file management drawer
- Upload progress tracking
- AI settings page (provider configuration, usage dashboard)
- Responsive design (desktop & mobile)
- Knowledge graph visualization page (`/graph`) with Cytoscape.js
- Graph filter toolbar (edge type, category, implicit edges toggle)
- Graph AI insight panel (stats, similar docs, path finder)

#### Database & Data
- Multi-tenant isolation (15 tables)
- User authentication (OAuth + JWT + API keys)
- RBAC with 4 roles (Admin, Editor, Viewer, Agent)
- Audit logging
- D1 FTS5 keyword search
- Vectorize semantic embeddings
- D1 soft deletes
- Document version snapshots
- `document_similarities` table for cached Vectorize results
- Typed `document_links` with weight, inferred flag, and edge type columns

#### DevOps & Deployment
- GitHub Actions CI/CD pipeline
- Cloudflare Workers deployment (API)
- Cloudflare Pages deployment (Web)
- TypeScript strict mode enforcement
- ESLint & Prettier configuration
- Vitest test runner

### Changed

- **Knowledge Graph edge extraction** now supports standard markdown links `[text](/doc/slug)` alongside wikilinks `[[target]]`
- Editor auto-save behavior now separates fast JSON saves from slower markdown conversion
- Mobile UI transitions now use CSS transforms instead of keyframe animations (improved performance)
- Global drop zone now supports markdown file detection and document creation
- MCP cross-package imports refactored from relative paths to `@agentwiki/api` package exports
- Implicit similarity edges now enabled by default on graph visualization page

### Fixed

- **Knowledge Graph edge extraction** now properly extracts internal links in standard markdown format
- Reduced editor responsiveness lag on keystroke (Issue #32)
- Fixed mobile sidebar animation stuttering on lower-end devices (Issue #37)

### Technical Debt

- [ ] E2E test suite (Playwright/Cypress)
- [x] Interactive graph UI component (Cytoscape.js) — completed in Issue #34
- [ ] Full security audit
- [ ] Monitoring/alerting dashboard

## [0.2.0] — Real-Time Collaboration (Planned Q2 2026)

### Planned Features
- Real-time collaborative editing (CRDT/OT algorithm)
- WebSocket presence indicators
- Cursor position sharing
- Inline comments & discussion threads
- Mention notifications

## [0.3.0] — Enterprise Features (Planned Q3 2026)

### Planned Features
- GDPR compliance (data export, right to be forgotten)
- Enterprise SSO (SAML)
- IP whitelisting
- Advanced search syntax (AND, OR, NOT, phrases)
- Saved searches & filters
- Team/department management

## [1.0.0] — Stable Release (Planned Q4 2026)

### Planned Features
- Multi-region failover
- Database sharding automation
- Graph visualization & analytics
- Recommendation engine
- Webhook integrations
- Mobile native app (iOS/Android)

## [Unreleased] — Backlog

Items under consideration for future versions:
- Dark mode
- Markdown import/export (bulk)
- Slack/Teams integration
- Email digest notifications
- Batch operations (bulk tag, bulk move)
- Custom white-label branding
- Advanced analytics dashboard
- Machine learning recommendations

---

## Version History

| Version | Date | Status | Highlights |
|---------|------|--------|-----------|
| 0.1.0 | Mar 2026 | In Progress | MVP launch (core CRUD, search, AI, mobile, knowledge graph) |
| 0.2.0 | Jun 2026 | Planned | Real-time collaboration |
| 0.3.0 | Sep 2026 | Planned | Enterprise features |
| 1.0.0 | Dec 2026 | Planned | Stable, production-ready |

## Document History

| Date | Editor | Change |
|------|--------|--------|
| 2026-03-27 | Team | Fixed Knowledge Graph edge extraction to support standard markdown links alongside wikilinks; added admin backfill endpoint |
| 2026-03-26 | Team | Added Settings Page Tabs Overhaul (Issue #57) — deeplinking, members CRUD, API keys, AI priority reorder, storage config, shortcuts rebinding |
| 2026-03-23 | Team | Added QMD-Inspired Search Pipeline Improvements (Issue #38) |
| 2026-03-22 | Team | Added Dual-Layer Knowledge Graph feature (Issue #34) |
| 2026-03-22 | Team | Added changeset for auto-save, mobile sidebar, and markdown import features (Issues #32, #37, #21) |
| 2026-03-18 | Team | Initial changelog created |
