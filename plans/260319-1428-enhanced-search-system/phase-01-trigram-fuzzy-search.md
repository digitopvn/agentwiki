# Phase 1: Trigram Fuzzy Search

## Context
- [Brainstorm report](../reports/brainstorm-260319-1428-enhanced-search-system.md)
- Current keyword search: `packages/api/src/services/search-service.ts` — `keywordSearch()` uses `LIKE %query%`
- Queue handler: `packages/api/src/queue/handler.ts`
- DB schema: `packages/api/src/db/schema.ts`

## Overview
- **Priority:** P1 — Foundation for all other phases
- **Status:** Pending
- **Description:** Replace SQL LIKE keyword search with trigram-based fuzzy matching. Documents indexed via word-level trigram extraction, searched via trigram overlap scoring.

## Key Insights
- D1 (SQLite) does not support FTS5 → trigram index is the best alternative
- Word-level trigrams (not sliding window on full text) reduce storage ~60%
- Stop words removal further reduces noise and storage
- Existing queue infrastructure (`agentwiki-jobs`) can be reused for trigram indexing
- RRF fusion already combines multiple result lists — trigram results slot in as replacement for LIKE results

## Requirements

### Functional
- Fuzzy search tolerates typos (1-2 char differences)
- Results ranked by trigram overlap score (higher = more relevant)
- Title matches weighted higher than content matches
- Support incremental index updates on document create/update/delete
- Bulk re-index command for existing documents

### Non-Functional
- Search latency < 200ms for 10K docs
- Trigram index build < 5s per document (async via queue)
- Storage < 1GB for 10K docs

## Architecture

```
Document CRUD ──→ Queue (type: 'index-trigrams')
                        │
                        ▼
              ┌─────────────────┐
              │ Trigram Service  │
              │ tokenize()      │
              │ removeStopWords()│
              │ generateTrigrams()│
              │ indexDocument()  │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  search_trigrams │
              │  (D1 table)     │
              └────────┬────────┘
                       │
           Search query│
                       ▼
              ┌─────────────────┐
              │ trigramSearch()  │ ← replaces keywordSearch()
              │ in search-service│
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │   RRF Fusion    │
              │ (trigram + semantic)│
              └─────────────────┘
```

## Related Code Files

### Modify
| File | Changes |
|------|---------|
| `packages/api/src/db/schema.ts` | Add `searchTrigrams` table definition |
| `packages/api/src/services/search-service.ts` | Replace `keywordSearch()` with `trigramSearch()` |
| `packages/api/src/queue/handler.ts` | Add `'index-trigrams'` job type |
| `packages/api/src/routes/search.ts` | No changes needed (API params unchanged) |

### Create
| File | Purpose |
|------|---------|
| `packages/api/src/utils/trigram.ts` | Trigram extraction: `tokenize()`, `generateWordTrigrams()` |
| `packages/api/src/utils/stop-words.ts` | English stop words list constant |
| `packages/api/src/services/trigram-service.ts` | `indexDocument()`, `deleteDocumentTrigrams()`, `trigramSearch()` |
| `packages/api/src/db/migrations/0002_*.sql` | Migration for `search_trigrams` table |

## Implementation Steps

### Step 1: Create stop words utility
Create `packages/api/src/utils/stop-words.ts`:
```ts
/** Common English stop words excluded from trigram indexing */
export const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'as', 'be', 'was', 'are',
  'been', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these',
  'those', 'not', 'no', 'so', 'if', 'then', 'than', 'when', 'where',
  'who', 'what', 'which', 'how', 'all', 'each', 'every', 'both',
  'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own',
  'same', 'also', 'just', 'about', 'into', 'over', 'after', 'before',
])
```

### Step 2: Create trigram extraction utility
Create `packages/api/src/utils/trigram.ts`:
```ts
import { STOP_WORDS } from './stop-words'

/** Tokenize text into lowercase words, remove stop words and short words */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')  // remove punctuation
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w))
}

/** Generate character trigrams from a single word */
export function wordTrigrams(word: string): string[] {
  if (word.length < 3) return [word]
  const trigrams: string[] = []
  for (let i = 0; i <= word.length - 3; i++) {
    trigrams.push(word.slice(i, i + 3))
  }
  return trigrams
}

/** Extract unique trigrams from text with field context */
export function extractTrigrams(text: string): Map<string, number> {
  const words = tokenize(text)
  const freqMap = new Map<string, number>()
  for (const word of words) {
    for (const tri of wordTrigrams(word)) {
      freqMap.set(tri, (freqMap.get(tri) ?? 0) + 1)
    }
  }
  return freqMap
}
```

### Step 3: Add schema table
Add to `packages/api/src/db/schema.ts`:
```ts
/** Trigram index for fuzzy search */
export const searchTrigrams = sqliteTable('search_trigrams', {
  trigram: text('trigram').notNull(),
  documentId: text('document_id').notNull().references(() => documents.id),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  field: text('field').notNull(), // 'title' | 'summary' | 'content'
  frequency: integer('frequency').notNull().default(1),
}, (table) => ({
  pk: primaryKey({ columns: [table.trigram, table.documentId, table.field] }),
  trigramTenantIdx: index('idx_trigram_tenant').on(table.trigram, table.tenantId),
}))
```

### Step 4: Generate and apply D1 migration
Run `pnpm drizzle-kit generate` in `packages/api` to create migration file, then apply via `wrangler d1 migrations apply`.

### Step 5: Create trigram service
Create `packages/api/src/services/trigram-service.ts`:

**`indexDocument(env, docId, tenantId)`:**
1. Fetch document (title, summary, content) from D1
2. Delete existing trigrams for this docId
3. Extract trigrams from each field with `extractTrigrams()`
4. Batch insert into `search_trigrams` (batch of 100 rows per INSERT)

**`deleteDocumentTrigrams(env, docId)`:**
1. DELETE FROM search_trigrams WHERE document_id = ?

**`trigramSearch(env, tenantId, query, limit, category?)`:**
1. Extract query trigrams via `extractTrigrams(query)`
2. SQL query:
```sql
SELECT document_id,
       SUM(frequency) as raw_score,
       COUNT(DISTINCT trigram) as matched_trigrams
FROM search_trigrams
WHERE trigram IN (?, ?, ...)
  AND tenant_id = ?
GROUP BY document_id
ORDER BY matched_trigrams DESC, raw_score DESC
LIMIT ?
```
3. Fetch document details (title, slug, content) for matched IDs
4. Apply title boost: if trigram also matches title field, boost score ×2
5. Extract snippet and return as `RankedResult[]`

### Step 6: Update queue handler
In `packages/api/src/queue/handler.ts`:
- Add `case 'index-trigrams':` that calls `indexDocument()`
- Modify `generateSummary()` to also enqueue `'index-trigrams'` after embedding

### Step 7: Replace keywordSearch in search-service
In `packages/api/src/services/search-service.ts`:
- Replace `keywordSearch()` call with `trigramSearch()` from trigram-service
- Keep same RRF fusion logic (no changes to `reciprocalRankFusion`)

### Step 8: Enqueue trigram jobs on document mutations
In document routes/service where documents are created/updated:
- Add `env.QUEUE.send({ type: 'index-trigrams', documentId, tenantId })` alongside existing embed job
- On document delete: call `deleteDocumentTrigrams()` synchronously

### Step 9: Bulk re-index script
Add a one-time admin endpoint or CLI command:
```
POST /api/admin/reindex-trigrams  (admin auth only)
```
Fetches all documents for tenant, enqueues `'index-trigrams'` jobs in batches.

## Todo List
- [ ] Create `packages/api/src/utils/stop-words.ts`
- [ ] Create `packages/api/src/utils/trigram.ts`
- [ ] Add `searchTrigrams` table to `packages/api/src/db/schema.ts`
- [ ] Generate + apply D1 migration
- [ ] Create `packages/api/src/services/trigram-service.ts`
- [ ] Update `packages/api/src/queue/handler.ts` — add `'index-trigrams'` job
- [ ] Update `packages/api/src/services/search-service.ts` — replace `keywordSearch()`
- [ ] Enqueue trigram jobs in document create/update routes
- [ ] Handle trigram cleanup on document delete
- [ ] Add bulk re-index admin endpoint
- [ ] Test fuzzy matching with typos (1-2 char diff)
- [ ] Test search latency with 1K+ trigram rows

## Success Criteria
- "javscript" finds "JavaScript" documents
- "reat hooks" finds "React Hooks" documents
- Search results ranked by relevance (not random LIKE order)
- No regression on semantic search quality
- Trigram index builds async without blocking document saves

## Risk Assessment
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Trigram table too large | Medium | High | Word-level extraction, monitor D1 size |
| Slow trigram query on large tables | Low | Medium | Composite index on (trigram, tenant_id) |
| Queue backlog during bulk re-index | Medium | Low | Batch enqueue with delays |

## Security Considerations
- Trigram queries use parameterized SQL (no injection risk)
- Admin re-index endpoint requires admin role auth
- Tenant isolation enforced via `tenant_id` in all queries

## Next Steps
- After P1: Phase 2 uses trigram infrastructure for fuzzy title matching in autocomplete
- Monitor D1 storage after initial bulk index
