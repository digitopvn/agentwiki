---
title: "Phase 3: Core API & Database Layer"
status: pending
priority: P1
effort: 28h
---

# Phase 3: Core API & Database Layer

## Context Links
- [Architecture Patterns — Versioning & Frontmatter](../reports/researcher-02-260318-1655-knowledge-platform-architecture.md)
- [Phase 2 — Auth middleware](./phase-02-auth-multi-tenant.md)

## Overview
Document CRUD, folder tree management, categories/tags, versioning, YAML frontmatter parsing, auto-summary via Workers AI, OpenAPI docs. Core data model powering all features.

## Key Insights
- Append-only versioning: `document_versions` table, never overwrite content
- gray-matter for frontmatter parsing; validate with Zod schemas
- Folder tree: adjacency list (parent_id) with `position` for ordering
- `document_links` table for wikilink extraction (backlinks + forward links)
- Workers AI for auto-summary — queue via Queues to avoid blocking requests
- Hono's built-in OpenAPI support via `@hono/zod-openapi` for API docs

## Requirements

### Functional
- Document CRUD with markdown + YAML frontmatter
- Folder hierarchy with drag-drop reorder support
- Categories (single) + tags (multiple) per document
- Version history with diff view support
- Wikilink extraction (`[[Page Name]]`) stored as edges
- Auto-summary generation via Workers AI (async)
- Paginated list endpoints with sorting/filtering
- OpenAPI/Swagger documentation auto-generated

### Non-Functional
- Document save < 100ms (excluding AI summary)
- List endpoint < 50ms for 100 items
- Version history < 30ms for recent 20 versions

## Architecture

### Database Schema
```sql
-- Core document tables
documents (
  id TEXT PRIMARY KEY,          -- nanoid
  tenant_id TEXT NOT NULL,
  folder_id TEXT,               -- nullable (root level)
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT NOT NULL,         -- markdown body (no frontmatter)
  content_json TEXT,             -- BlockNote JSON (synced on save)
  summary TEXT,                  -- AI-generated
  category TEXT,
  access_level TEXT DEFAULT 'private',  -- private|specific|public
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,            -- soft delete
  UNIQUE(tenant_id, slug)
)

document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  title TEXT NOT NULL,
  change_summary TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
)

document_tags (
  document_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (document_id, tag)
)

document_links (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  link_text TEXT,                -- display text from [[link_text|Page]]
  context TEXT,                  -- surrounding paragraph for preview
  PRIMARY KEY (source_id, target_id)
)

folders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  parent_id TEXT,               -- null = root
  name TEXT NOT NULL,
  position INTEGER DEFAULT 0,   -- sort order within parent
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)

categories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  color TEXT,                   -- hex color for UI
  UNIQUE(tenant_id, slug)
)
```

### API Routes
```
Documents:
  POST   /api/documents              — create document
  GET    /api/documents              — list (paginated, filterable)
  GET    /api/documents/:id          — get single document
  PUT    /api/documents/:id          — update document (creates version)
  DELETE /api/documents/:id          — soft delete
  GET    /api/documents/:id/versions — version history
  GET    /api/documents/:id/versions/:versionId — specific version
  GET    /api/documents/:id/links    — forward + backlinks

Folders:
  POST   /api/folders                — create folder
  GET    /api/folders                — get folder tree (tenant)
  PUT    /api/folders/:id            — rename / move / reorder
  DELETE /api/folders/:id            — delete (must be empty)

Categories:
  POST   /api/categories             — create
  GET    /api/categories             — list all
  PUT    /api/categories/:id         — update
  DELETE /api/categories/:id         — delete

Tags:
  GET    /api/tags                   — list all tags (tenant)
  GET    /api/tags/:tag/documents    — documents by tag
```

## Related Code Files

### Files to Create
- `packages/api/src/routes/documents.ts` — document CRUD routes
- `packages/api/src/routes/folders.ts` — folder tree routes
- `packages/api/src/routes/categories.ts` — category routes
- `packages/api/src/routes/tags.ts` — tag routes
- `packages/api/src/services/document-service.ts` — document business logic
- `packages/api/src/services/folder-service.ts` — folder tree logic
- `packages/api/src/services/version-service.ts` — version management
- `packages/api/src/services/link-service.ts` — wikilink extraction + storage
- `packages/api/src/services/summary-service.ts` — AI summary via Queues
- `packages/api/src/utils/frontmatter.ts` — gray-matter parse/serialize
- `packages/api/src/utils/slug.ts` — slug generation + conflict resolution
- `packages/api/src/utils/pagination.ts` — cursor/offset pagination helper
- `packages/api/src/queue/handler.ts` — Queue consumer entry
- `packages/api/src/queue/summary-worker.ts` — AI summary job processor
- `packages/shared/src/types/documents.ts` — document types
- `packages/shared/src/schemas/documents.ts` — Zod schemas for doc API

### Files to Modify
- `packages/api/src/db/schema.ts` — add all tables above
- `packages/api/src/index.ts` — register new routes + queue handler
- `packages/api/wrangler.toml` — queue consumer config

## Implementation Steps

### 1. Database Schema + Migration (3h)
1. Add all tables to `packages/api/src/db/schema.ts` using Drizzle
2. Create indexes: `(tenant_id, slug)`, `(tenant_id, folder_id)`, `(document_id, version)`, `(source_id)`, `(target_id)`
3. Enable FTS5 virtual table for full-text search:
   ```sql
   CREATE VIRTUAL TABLE documents_fts USING fts5(
     title, content, tenant_id UNINDEXED,
     content=documents, content_rowid=rowid
   );
   ```
4. Generate + apply migration

### 2. Shared Types & Schemas (2h)
1. `packages/shared/src/types/documents.ts`:
   - `Document`, `DocumentVersion`, `Folder`, `Category`, `Tag`, `DocumentLink`
   - `CreateDocumentInput`, `UpdateDocumentInput`, `ListDocumentsQuery`
2. `packages/shared/src/schemas/documents.ts`:
   - Zod schemas matching all types for request validation

### 3. Utility Functions (2h)
1. `utils/frontmatter.ts`:
   ```typescript
   import matter from 'gray-matter'
   export function parseFrontmatter(raw: string) {
     const { data, content } = matter(raw)
     // validate data against schema
     return { metadata: data, content }
   }
   export function serializeFrontmatter(metadata: object, content: string) {
     return matter.stringify(content, metadata)
   }
   ```
2. `utils/slug.ts`: generate slug from title, check uniqueness, append suffix if conflict
3. `utils/pagination.ts`: offset-based pagination with cursor support
   ```typescript
   export function paginationParams(query: { page?: number, limit?: number }) {
     const page = Math.max(1, query.page || 1)
     const limit = Math.min(100, Math.max(1, query.limit || 20))
     return { offset: (page - 1) * limit, limit, page }
   }
   ```

### 4. Document CRUD (6h)
1. `services/document-service.ts`:
   - `createDocument(tenantId, input)`:
     - Parse frontmatter if raw markdown provided
     - Generate slug from title
     - Insert into documents + initial version (v1)
     - Extract wikilinks → insert into document_links
     - Queue summary generation job
     - Sync FTS5 index
   - `getDocument(tenantId, id)` — fetch with tags, category, links
   - `updateDocument(tenantId, id, input)`:
     - Create new version (increment version number)
     - Update documents table (current content)
     - Re-extract wikilinks (diff and update)
     - Queue summary re-generation
     - Sync FTS5
   - `deleteDocument(tenantId, id)` — soft delete (set deleted_at)
   - `listDocuments(tenantId, filters)` — paginated, filter by folder/category/tag, sort by updated_at/title
   - `getVersionHistory(docId)` — list versions descending
   - `getVersion(docId, versionId)` — specific version content
   - `getDocumentLinks(docId)` — forward links + backlinks

2. `routes/documents.ts` — Hono routes with Zod OpenAPI:
   ```typescript
   import { createRoute, z } from '@hono/zod-openapi'
   // Each route: define schema → handler → return typed response
   ```

### 5. Folder Tree Management (3h)
1. `services/folder-service.ts`:
   - `createFolder(tenantId, name, parentId?)` — insert with position = max+1 in parent
   - `getFolderTree(tenantId)` — fetch all folders, build tree in memory (adjacency list → tree)
   - `moveFolder(id, newParentId, newPosition)` — update parent_id + reorder siblings
   - `renameFolder(id, name)` — simple update
   - `deleteFolder(id)` — verify empty (no docs, no subfolders), then delete
2. Tree-building utility:
   ```typescript
   function buildTree(folders: Folder[]): FolderNode[] {
     const map = new Map<string, FolderNode>()
     const roots: FolderNode[] = []
     folders.forEach(f => map.set(f.id, { ...f, children: [] }))
     folders.forEach(f => {
       if (f.parentId) map.get(f.parentId)?.children.push(map.get(f.id)!)
       else roots.push(map.get(f.id)!)
     })
     return roots
   }
   ```

### 6. Categories & Tags (2h)
1. `routes/categories.ts` — CRUD for categories (tenant-scoped)
2. `routes/tags.ts` — list tags, get documents by tag
3. Tag management is inline with document create/update (no separate tag entity beyond pivot table)

### 7. Wikilink Extraction (2h)
1. `services/link-service.ts`:
   - Parse markdown content for `[[Page Name]]` and `[[Page Name|Display Text]]`
   - Regex: `/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g`
   - Resolve page name → document ID via slug/title lookup
   - Store in document_links with context (surrounding text)
   - Compute backlinks: `SELECT * FROM document_links WHERE target_id = ?`

### 8. Auto-Summary via Workers AI + Queues (4h)
1. `services/summary-service.ts`:
   - `queueSummaryJob(docId, content)` — send to Queue
   - Queue message format: `{ type: 'generate-summary', docId, content }`
2. `queue/handler.ts` — Queue consumer entry:
   ```typescript
   export default {
     async queue(batch: MessageBatch, env: Env) {
       for (const msg of batch.messages) {
         switch (msg.body.type) {
           case 'generate-summary':
             await processSummary(msg.body, env)
             msg.ack()
             break
         }
       }
     }
   }
   ```
3. `queue/summary-worker.ts`:
   - Call Workers AI: `env.AI.run('@cf/mistral/mistral-7b-instruct-v0.2', { prompt: 'Summarize: ...' })`
   - Update document summary field in D1
   - Truncate input to 2000 tokens to stay within model limits

### 9. OpenAPI Documentation (2h)
1. Use `@hono/zod-openapi` — routes already define schemas
2. Add `GET /api/docs` serving Swagger UI (swagger-ui-dist)
3. Add `GET /api/openapi.json` returning OpenAPI spec
4. Tag routes by resource: Documents, Folders, Categories, Tags, Auth

### 10. FTS5 Sync (2h)
1. Trigger FTS5 update on document create/update/delete:
   ```sql
   INSERT INTO documents_fts(rowid, title, content, tenant_id)
     VALUES (?, ?, ?, ?);
   ```
2. Helper: `syncFTS(docId, title, content, tenantId)` — upsert into FTS5 table
3. Search helper: `searchFTS(tenantId, query, limit)`:
   ```sql
   SELECT d.* FROM documents_fts f
   JOIN documents d ON d.rowid = f.rowid
   WHERE documents_fts MATCH ? AND f.tenant_id = ?
   ORDER BY rank LIMIT ?
   ```

## Todo List
- [ ] Add document tables to Drizzle schema + generate migration
- [ ] Create FTS5 virtual table migration
- [ ] Implement shared types + Zod schemas for documents
- [ ] Implement frontmatter parser utility (gray-matter)
- [ ] Implement slug generator with conflict resolution
- [ ] Implement pagination helper
- [ ] Implement document CRUD service
- [ ] Implement document CRUD routes with OpenAPI
- [ ] Implement folder tree service + routes
- [ ] Implement categories CRUD routes
- [ ] Implement tags list + filter routes
- [ ] Implement wikilink extraction service
- [ ] Implement Queue consumer for async jobs
- [ ] Implement Workers AI summary generation
- [ ] Implement FTS5 sync on document mutations
- [ ] Setup OpenAPI docs endpoint (Swagger UI)
- [ ] Add indexes for performance

## Success Criteria
- Create document with markdown + frontmatter → stored correctly
- Update document → new version created, old version preserved
- Folder tree API returns correct hierarchy
- Wikilinks extracted and queryable as forward/backlinks
- FTS5 search returns relevant results within tenant
- Auto-summary generated asynchronously after doc creation
- OpenAPI spec accessible at `/api/docs`
- All endpoints enforce tenant isolation (tenant A cannot see tenant B docs)

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| FTS5 sync drift | Medium | Medium | Rebuild FTS index periodically via Queue job |
| D1 row size for large docs | Low | High | Chunk very large docs; set 1MB content limit |
| Workers AI rate limits | Medium | Low | Queue + retry with backoff; cache summaries |
| gray-matter bundle size | Low | Low | Tree-shake; only import parse function |

## Security Considerations
- All queries include `tenant_id` WHERE clause — no cross-tenant leaks
- Document content sanitized before storage (strip script tags)
- Soft delete preserves audit trail
- Version history immutable (append-only)
- Input validation via Zod on all endpoints
- SQL injection prevented by Drizzle parameterized queries

## Next Steps
- Phase 4: Web UI & Editor (consumes these API endpoints)
- Phase 5: Storage & Search (extends documents with R2 + Vectorize)
