---
title: "Phase 5: Storage, Search & AI"
status: pending
priority: P1
effort: 24h
---

# Phase 5: Storage, Search & AI

## Context Links
- [Cloudflare Research — R2, Vectorize, Workers AI](../reports/researcher-01-260318-1655-cloudflare-ecosystem.md)
- [Architecture — Hybrid Search & Chunking](../reports/researcher-02-260318-1655-knowledge-platform-architecture.md)
- [Phase 3 — FTS5 Foundation](./phase-03-core-api-database.md)

## Overview
R2 file upload/download with presigned URLs. Vectorize embedding pipeline via Queues. Hybrid search combining D1 FTS5 (keyword) + Vectorize (semantic) fused via Reciprocal Rank Fusion. Search UI integration in Cmd+K.

## Key Insights
- R2 presigned URLs: browser uploads directly to R2, bypassing Workers memory limits
- Vectorize: metadata filtering by `org_id` for tenant isolation
- bge-base-en: 768-dim embeddings via Workers AI (good quality for knowledge docs)
- Chunking: section-based (split on headings) with 150-token overlap
- Hybrid search: FTS5 BM25 scores + Vectorize cosine similarity → RRF fusion
- Queue pipeline: doc create/update → chunk → embed → store in Vectorize (async)

## Requirements

### Functional
- Upload images/files from editor (drag-drop, paste, file picker)
- Presigned URL for secure browser-to-R2 upload
- Media gallery: browse uploaded files within document/tenant
- Embedding generation on document create/update (async via Queue)
- Hybrid search: keyword + semantic combined
- Search API: `/api/search?q=...&type=hybrid|keyword|semantic`
- Search UI in Cmd+K modal with result previews

### Non-Functional
- File upload < 2s for files up to 10MB
- Search latency < 200ms for hybrid search
- Embedding generation < 30s per document (async, non-blocking)

## Architecture

### File Upload Flow
```
Browser                    Workers API                 R2
  │                            │                        │
  ├─ POST /api/uploads ───────►│                        │
  │  { filename, contentType } │                        │
  │                            ├─ Generate presigned ──►│
  │◄── { uploadUrl, fileKey } ─┤    PUT URL             │
  │                            │                        │
  ├─ PUT uploadUrl ────────────┼───────────────────────►│
  │  (file bytes, direct)      │                        │
  │                            │                        │
  ├─ POST /api/uploads/confirm►│                        │
  │  { fileKey }               ├─ Store metadata in D1  │
  │◄── { url, id } ───────────┤                        │
```

### Embedding Pipeline
```
Document Create/Update
  │
  ├─► Queue: { type: 'embed', docId, content }
  │
  ▼
Queue Consumer
  ├─ Chunk content (by headings, 512 tokens max, 150 overlap)
  ├─ For each chunk:
  │   ├─ Workers AI: bge-base-en → 768-dim embedding
  │   └─ Vectorize: upsert { id: docId-chunkN, values, metadata: { org_id, doc_id, chunk_index } }
  └─ Update document: embedded_at timestamp
```

### Hybrid Search
```
Query: "authentication best practices"
  │
  ├─► FTS5: MATCH query → BM25 ranked results (top 20)
  ├─► Workers AI: embed query → 768-dim vector
  │   └─► Vectorize: query(vector, topK: 20, filter: { org_id })
  │
  ▼
RRF Fusion:
  score(doc) = Σ 1/(k + rank_fts) + 1/(k + rank_vec)  [k=60]
  │
  ▼
  Return top 10 merged results with snippets
```

## Related Code Files

### Files to Create
- `packages/api/src/routes/uploads.ts` — presigned URL + confirm routes
- `packages/api/src/routes/search.ts` — search endpoint
- `packages/api/src/services/upload-service.ts` — R2 presigned URL logic
- `packages/api/src/services/search-service.ts` — hybrid search fusion
- `packages/api/src/services/embedding-service.ts` — chunk + embed logic
- `packages/api/src/queue/embedding-worker.ts` — Queue consumer for embeddings
- `packages/api/src/utils/chunker.ts` — markdown section chunker
- `packages/api/src/utils/rrf.ts` — Reciprocal Rank Fusion algorithm
- `packages/web/src/components/editor/image-upload.tsx` — upload UI in editor
- `packages/web/src/components/editor/media-gallery.tsx` — browse uploads
- `packages/web/src/hooks/use-search.ts` — search hook
- `packages/web/src/hooks/use-uploads.ts` — upload hook
- `packages/shared/src/types/search.ts` — search types
- `packages/shared/src/types/uploads.ts` — upload types

### Files to Modify
- `packages/api/src/db/schema.ts` — add `uploads` table
- `packages/api/src/queue/handler.ts` — add embed job type
- `packages/api/src/services/document-service.ts` — trigger embed on create/update
- `packages/api/src/index.ts` — register upload + search routes
- `packages/web/src/components/command-palette/command-palette.tsx` — add search results
- `packages/web/src/components/editor/editor.tsx` — add image upload handler

## Implementation Steps

### 1. Upload Schema + Service (3h)
1. Add `uploads` table to schema:
   ```sql
   uploads (
     id TEXT PRIMARY KEY,
     tenant_id TEXT NOT NULL,
     document_id TEXT,           -- nullable (orphan uploads allowed)
     file_key TEXT NOT NULL,     -- R2 object key: {tenant_id}/media/{id}/{filename}
     filename TEXT NOT NULL,
     content_type TEXT NOT NULL,
     size_bytes INTEGER NOT NULL,
     uploaded_by TEXT NOT NULL,
     created_at INTEGER NOT NULL
   )
   ```
2. `services/upload-service.ts`:
   - `generatePresignedUpload(tenantId, filename, contentType)`:
     ```typescript
     const fileKey = `${tenantId}/media/${nanoid()}/${filename}`
     // R2 doesn't have native presigned URLs in Workers binding
     // Use: generate a signed token, validate on confirm
     // OR: proxy upload through Worker (for files < 100MB)
     ```
   - **Alternative approach** (simpler): proxy upload through Worker
     ```typescript
     // POST /api/uploads with multipart/form-data
     // Worker reads stream, pipes to R2
     const object = await env.R2.put(fileKey, request.body, {
       httpMetadata: { contentType }
     })
     ```
   - `getFileUrl(fileKey)`: generate time-limited URL or serve via Worker route
   - `deleteFile(fileKey)`: remove from R2 + delete record
3. `routes/uploads.ts`:
   - `POST /api/uploads` — accept file, store in R2, return URL
   - `GET /api/uploads` — list uploads for tenant/document
   - `DELETE /api/uploads/:id` — delete file
   - `GET /api/files/:key+` — serve file from R2 (with auth check)

### 2. Editor Image Upload (2h)
1. `components/editor/image-upload.tsx`:
   - Drag-drop zone over editor
   - Paste handler for clipboard images
   - File picker button in toolbar
   - Upload progress indicator
   - On success: insert image block into BlockNote with URL
2. BlockNote custom image upload handler:
   ```typescript
   const editor = useCreateBlockNote({
     uploadFile: async (file: File) => {
       const formData = new FormData()
       formData.append('file', file)
       const res = await apiFetch('/uploads', { method: 'POST', body: formData })
       return res.url // returned URL inserted into editor
     }
   })
   ```

### 3. Markdown Chunker (2h)
1. `utils/chunker.ts`:
   ```typescript
   interface Chunk { text: string; index: number; heading?: string }

   export function chunkMarkdown(content: string, maxTokens = 512, overlap = 150): Chunk[] {
     // 1. Split by headings (##, ###, etc.)
     // 2. If section > maxTokens, split by paragraphs
     // 3. If paragraph > maxTokens, split by sentences
     // 4. Add overlap: append last N tokens of prev chunk to start of next
     // 5. Return chunks with index + parent heading context
   }
   ```
2. Token estimation: ~4 chars per token (rough; use `encode` if accurate count needed)

### 4. Embedding Pipeline (4h)
1. `services/embedding-service.ts`:
   - `generateEmbeddings(docId, content, tenantId)`:
     ```typescript
     const chunks = chunkMarkdown(content)
     for (const chunk of chunks) {
       const embedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
         text: [chunk.text]
       })
       await env.VECTORIZE.upsert([{
         id: `${docId}-${chunk.index}`,
         values: embedding.data[0],
         metadata: { org_id: tenantId, doc_id: docId, chunk_index: chunk.index, heading: chunk.heading }
       }])
     }
     ```
   - `deleteEmbeddings(docId)` — remove all chunks for doc from Vectorize
   - `reembedDocument(docId)` — delete old + generate new
2. `queue/embedding-worker.ts`:
   - Process `embed` type messages
   - Retry with exponential backoff on AI rate limits
   - Batch Vectorize upserts (up to 200 vectors per call)

### 5. Hybrid Search Service (4h)
1. `utils/rrf.ts`:
   ```typescript
   export function reciprocalRankFusion(
     results: { id: string; rank: number }[][],
     k = 60
   ): { id: string; score: number }[] {
     const scores = new Map<string, number>()
     for (const resultSet of results) {
       for (const { id, rank } of resultSet) {
         scores.set(id, (scores.get(id) || 0) + 1 / (k + rank))
       }
     }
     return [...scores.entries()]
       .map(([id, score]) => ({ id, score }))
       .sort((a, b) => b.score - a.score)
   }
   ```
2. `services/search-service.ts`:
   - `search(tenantId, query, type = 'hybrid', limit = 10)`:
     ```typescript
     // Keyword search via FTS5
     const ftsResults = await searchFTS(tenantId, query, 20)

     // Semantic search via Vectorize
     const queryEmbed = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [query] })
     const vecResults = await env.VECTORIZE.query(queryEmbed.data[0], {
       topK: 20,
       filter: { org_id: { $eq: tenantId } }
     })

     // Fuse results
     const fused = reciprocalRankFusion([
       ftsResults.map((r, i) => ({ id: r.id, rank: i + 1 })),
       vecResults.matches.map((r, i) => ({ id: r.id.split('-')[0], rank: i + 1 }))  // extract docId from chunk ID
     ])

     // Fetch full documents for top results
     const docs = await fetchDocuments(tenantId, fused.slice(0, limit).map(r => r.id))
     return docs.map(d => ({ ...d, snippet: generateSnippet(d.content, query) }))
     ```
3. `routes/search.ts`:
   - `GET /api/search?q=&type=hybrid|keyword|semantic&limit=10&category=&tags=`
   - Returns: `{ results: [{ id, title, snippet, score, category, tags }], total }`

### 6. Search UI Integration (3h)
1. `hooks/use-search.ts`:
   - Debounced search (300ms) via TanStack Query
   - `useSearch(query, options)` — calls `/api/search`
2. Update `command-palette.tsx`:
   - Type to search → show results in real-time
   - Result items: title, snippet (highlighted match), category badge
   - Enter → open document in tab
   - Show search type toggle (all / keyword / semantic)
3. Loading state + no results state

### 7. Media Gallery (2h)
1. `components/editor/media-gallery.tsx`:
   - Modal triggered from editor toolbar "Insert Image"
   - Grid view of uploaded images for current tenant
   - Click to insert into editor
   - Upload new from gallery
   - Search/filter by filename

### 8. Embed-on-Save Integration (2h)
1. Modify `document-service.ts`:
   - On create: queue embed job
   - On update: queue re-embed job (delete old chunks first)
   - On delete: queue delete-embeddings job
2. Add `embedded_at` column to documents table (track embedding freshness)

### 9. Caching Layer (2h)
1. KV cache for search results:
   - Key: `search:{tenantId}:{queryHash}`
   - TTL: 60s (short, because docs change)
   - Invalidate on document mutation within tenant
2. KV cache for folder tree:
   - Key: `folders:{tenantId}`
   - TTL: 300s
   - Invalidate on folder mutation
3. R2 file serving with Cache-Control headers (1 hour for media)

## Todo List
- [ ] Add uploads table to schema + migration
- [ ] Implement R2 upload service (proxy through Worker)
- [ ] Create upload routes (POST, GET, DELETE, serve files)
- [ ] Integrate image upload into BlockNote editor
- [ ] Implement markdown chunker (heading-based, with overlap)
- [ ] Implement embedding service (Workers AI + Vectorize)
- [ ] Add embed job to Queue consumer
- [ ] Implement RRF fusion algorithm
- [ ] Implement hybrid search service (FTS5 + Vectorize + RRF)
- [ ] Create search API route
- [ ] Integrate search into Cmd+K command palette
- [ ] Build media gallery component
- [ ] Add KV caching for search results + folder tree
- [ ] Wire embed-on-save into document service
- [ ] Add embedded_at column to documents

## Success Criteria
- Upload image from editor → stored in R2, displayed in editor
- Document save triggers async embedding generation
- Hybrid search returns relevant results combining keyword + semantic
- Search results include snippets with query term highlighting
- Cmd+K search works in real-time with debounce
- Media gallery shows all tenant uploads
- KV cache reduces repeated search latency

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Workers AI rate limits on embeddings | High | Medium | Queue with backoff; batch documents; cache embeddings |
| Vectorize eventual consistency | Medium | Low | Show "indexing..." status; UI messaging |
| R2 upload size limits through Worker | Medium | Medium | Stream body; set 100MB max; presigned for larger |
| FTS5 + Vectorize result mismatch | Low | Medium | RRF handles gracefully; tune k parameter |

## Security Considerations
- R2 file access requires auth (served through Worker, not direct R2 URL)
- File upload: validate content type, max size (10MB default), scan filename
- Presigned URLs: short TTL (15 min), scoped to tenant prefix
- Search: always filter by tenant_id in both FTS5 and Vectorize
- Rate limit search endpoint (50 req/min) — expensive operation

## Next Steps
- Phase 6: Sharing & Publishing (share links serve R2-hosted published HTML)
- Phase 7: Knowledge Graph (uses document_links + embeddings for similarity edges)
