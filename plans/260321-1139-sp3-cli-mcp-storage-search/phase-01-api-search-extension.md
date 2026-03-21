# Phase 1: API Search Extension

## Context
- [SP3 Plan](./plan.md)
- Search service: `packages/api/src/services/search-service.ts`
- Search routes: `packages/api/src/routes/search.ts`
- Embedding service: `packages/api/src/services/embedding-service.ts`
- File extractions table from SP1

## Overview
- **Priority:** P2
- **Status:** Completed
- **Description:** Add `source` query parameter to search API to search documents, storage file extractions, or both. Extend keyword + semantic search to query file_extractions table.

## Key Insights
- Current search: trigram fuzzy (D1) + semantic (Vectorize) + RRF fusion
- Vectorize vectors for uploads will have `source_type: 'upload'` and `upload_id` metadata (from SP1)
- RRF can merge doc results + storage results seamlessly
- `source` param is orthogonal to existing filters (category, tags, date)

## Requirements

### Functional
- `GET /api/search?q=query&source=docs` — existing behavior (default)
- `GET /api/search?q=query&source=storage` — search file_extractions only
- `GET /api/search?q=query&source=all` — search both, merge via RRF
- Storage keyword search: LIKE on file_extractions.extracted_text
- Storage semantic search: Vectorize filter `source_type=upload`
- Storage results include: upload_id, filename, snippet from extracted text, score

### Non-functional
- Default source=docs (backward compatible)
- Storage search respects tenant isolation
- Performance: storage search < 2s p95

## Architecture

### Search Flow with Source

```
GET /api/search?q=query&source=all
  ↓
searchDocuments(env, { ..., source: 'all' })
  ↓
source includes 'docs':
  ├─ trigramSearch → doc keyword results
  └─ semanticSearch (filter: source_type absent) → doc semantic results
  ↓
source includes 'storage':
  ├─ storageKeywordSearch → file extraction keyword results
  └─ semanticSearch (filter: source_type=upload) → storage semantic results
  ↓
RRF fusion of all result sets
  ↓
Return unified results with `resultType: 'document' | 'upload'`
```

### Result Interface Extension

```typescript
interface SearchResult extends RankedResult {
  resultType: 'document' | 'upload'
  uploadId?: string    // for upload results
  filename?: string    // for upload results
}
```

## Related Code Files

### Modify
- `packages/api/src/services/search-service.ts` — add source param, storage search functions
- `packages/api/src/routes/search.ts` — parse source query param
- `packages/shared/src/types.ts` — add SearchSource type, extend SearchResult

### Create
- `packages/api/src/services/storage-search-service.ts` — keyword + semantic search for file_extractions

## Implementation Steps

1. **Add SearchSource type**
   ```typescript
   export type SearchSource = 'docs' | 'storage' | 'all'
   ```

2. **Create storage-search-service.ts**
   - `storageKeywordSearch(env, tenantId, query, limit)`:
     - Query file_extractions WHERE tenant_id=? AND extracted_text LIKE ?
     - JOIN uploads for filename, content_type
     - Return results with upload_id, filename, snippet
   - `storageSemanticSearch(env, tenantId, query, limit)`:
     - Vectorize query with filter `{ org_id: tenantId, source_type: 'upload' }`
     - Map results to upload_id via vector metadata
     - Fetch upload metadata from D1

3. **Extend searchDocuments in search-service.ts**
   - Add `source` to SearchOptions (default: 'docs')
   - When source includes 'docs': existing flow
   - When source includes 'storage': call storage search functions
   - When source='all': merge all result sets via RRF
   - Add `resultType` to each result

4. **Update search route**
   - Parse `source` query param: `c.req.query('source') ?? 'docs'`
   - Pass to searchDocuments

5. **Update search response**
   - Results include `resultType` field
   - Storage results include `uploadId`, `filename`

6. **Snippet extraction for storage results**
   - Extract relevant snippet from extracted_text around query match
   - Reuse existing `extractSnippet` utility

7. **Run type-check + build + test**

## Todo List

- [x] Add SearchSource type to shared
- [x] Create storage-search-service.ts (keyword + semantic)
- [x] Extend searchDocuments with source param
- [x] Update search route to parse source
- [x] Add resultType to search results
- [x] Snippet extraction for storage results
- [x] Run type-check + build
- [x] Test: source=docs (backward compat)
- [x] Test: source=storage (file extraction results)
- [x] Test: source=all (merged results)

## Success Criteria

- `source=docs` returns same results as before (backward compatible)
- `source=storage` returns results from file_extractions
- `source=all` returns merged results from both
- Results include resultType for client to distinguish
- Tenant isolation maintained
