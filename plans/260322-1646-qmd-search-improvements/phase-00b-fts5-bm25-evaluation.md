---
phase: 0.5
title: "FTS5/BM25 Evaluation — Replace or Supplement Trigram Search"
status: code-complete
priority: HIGH
effort: 4h
blockedBy: [phase-00]
blocks: []
---

# Phase 0.5: FTS5/BM25 Evaluation

D1 now supports FTS5 (confirmed 2026-03-23). Evaluate BM25 ranking as replacement/supplement for trigram-based keyword search.

## Context Links
- [Research Report — Q1: FTS5 Support](../reports/researcher-260323-qmd-plan-evaluation.md)
- [Cloudflare D1 FTS5 Docs](https://developers.cloudflare.com/d1/sql-api/sql-statements/)
- [D1 Virtual Tables Thread](https://community.cloudflare.com/t/d1-support-for-virtual-tables/607277)
- [Search Stack Benchmark (D1 FTS5)](https://www.wolk.work/blog/posts/a-quest-to-find-the-fastest-search-stack)
- Current trigram service: `packages/api/src/services/trigram-service.ts` (167 LOC)
- Current trigram utils: `packages/api/src/utils/trigram.ts` (34 LOC)

## Overview

- **Priority:** HIGH — potentially bigger quality win than position-aware RRF
- **Status:** pending (blocked by Phase 0 eval set)
- **Description:** Build FTS5 virtual table alongside existing trigram, benchmark BM25 vs trigram on eval set, decide adoption path.

## Key Insights

- **BM25 advantages over trigram:** TF-IDF ranking, phrase search (`"rate limiting"`), prefix matching (`perform*`), negation (`-deprecated`), standard SQLite syntax
- **Trigram advantages over BM25:** Fuzzy/typo tolerance (`rate limting` → `rate limiting`)
- **Best strategy:** FTS5 as primary keyword search, trigram as fuzzy fallback
- **D1 FTS5 caveats:** Must use lowercase `fts5`, virtual tables can't be exported (drop+recreate for migrations)

## Requirements

### Functional
- FTS5 virtual table indexing document title, summary, content
- BM25 ranking function for keyword search
- Benchmark comparison: FTS5 vs trigram on Phase 0 eval set
- Migration script to populate FTS5 index from existing documents

### Non-Functional
- FTS5 search latency ≤ trigram search latency
- FTS5 index size reasonable (monitor D1 storage)
- Zero downtime during migration (both systems coexist)

## Architecture

```
EVALUATION PATH:
                        ┌─→ [FTS5/BM25 Search] ──→ results_a
Eval Query Set (P0) ────┤
                        └─→ [Trigram Search] ──────→ results_b
                                                        ↓
                                              Compare MRR, Precision, NDCG

ADOPTION PATH (if FTS5 wins):
Query → [FTS5/BM25 Primary] ─┐
                              ├─→ RRF → Results
Query → [Semantic Search] ────┘
         (Trigram retained as optional fuzzy fallback)
```

## Related Code Files
- **Read:** `packages/api/src/services/trigram-service.ts` — current keyword search
- **Read:** `packages/api/src/utils/trigram.ts` — trigram extraction logic
- **Read:** `packages/api/src/db/schema.ts` — current schema
- **Create:** `packages/api/src/services/fts5-search-service.ts`
- **Modify:** `packages/api/src/db/schema.ts` — add FTS5 virtual table
- **Modify:** `packages/api/src/services/search-service.ts` — swap keyword source
- **Modify:** `packages/api/src/queue/handler.ts` — index into FTS5 on doc create/update

## Implementation Steps

### Step 1: Create FTS5 virtual table (0.5h)

D1 migration to create FTS5 index:

```sql
-- Must use lowercase 'fts5' (case-sensitive on D1)
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  doc_id UNINDEXED,
  tenant_id UNINDEXED,
  title,
  summary,
  content,
  tokenize='porter unicode61'
);
```

**Tokenizer choice:** `porter unicode61` gives stemming (search → searches, searching) + Unicode support.

### Step 2: Build FTS5 search service (1.5h)

New file: `packages/api/src/services/fts5-search-service.ts`

```typescript
import type { Env } from '../env'

interface FTS5SearchOptions {
  tenantId: string
  query: string
  limit?: number
  category?: string
}

/** BM25-ranked full-text search using D1 FTS5 */
export async function fts5Search(env: Env, options: FTS5SearchOptions) {
  const { tenantId, query, limit = 20, category } = options

  // FTS5 query syntax:
  // - Phrase: "rate limiting"
  // - Prefix: perform*
  // - Negation: -deprecated
  // - OR: throttling OR "rate limiting"
  const sanitized = sanitizeFTS5Query(query)

  const sql = `
    SELECT
      f.doc_id AS id,
      d.title,
      d.slug,
      snippet(documents_fts, 4, '<b>', '</b>', '...', 32) AS snippet,
      rank AS score,
      d.category
    FROM documents_fts f
    JOIN documents d ON d.id = f.doc_id
    WHERE documents_fts MATCH ?
      AND f.tenant_id = ?
      ${category ? 'AND d.category = ?' : ''}
      AND d.deleted_at IS NULL
    ORDER BY rank
    LIMIT ?
  `

  const params = category
    ? [sanitized, tenantId, category, limit]
    : [sanitized, tenantId, limit]

  const result = await env.DB.prepare(sql).bind(...params).all()
  return result.results.map(row => ({
    id: row.id as string,
    title: row.title as string,
    slug: row.slug as string,
    snippet: row.snippet as string,
    score: row.score as number,
    category: row.category as string | undefined,
  }))
}

/** Sanitize user query for FTS5 MATCH — escape special chars */
function sanitizeFTS5Query(query: string): string {
  // Preserve intentional FTS5 syntax: quotes, *, -
  // Escape parentheses and other special chars
  return query
    .replace(/[(){}[\]^~\\]/g, '')
    .trim()
}
```

### Step 3: Populate FTS5 index from existing documents (0.5h)

Admin endpoint or script to backfill:

```typescript
// One-time migration: insert all documents into FTS5
async function backfillFTS5(env: Env) {
  const db = env.DB
  const batch = await db.prepare(`
    SELECT id, tenant_id, title, COALESCE(summary, '') as summary, content
    FROM documents WHERE deleted_at IS NULL
  `).all()

  for (const doc of batch.results) {
    await db.prepare(`
      INSERT OR REPLACE INTO documents_fts(doc_id, tenant_id, title, summary, content)
      VALUES (?, ?, ?, ?, ?)
    `).bind(doc.id, doc.tenant_id, doc.title, doc.summary, doc.content).run()
  }
}
```

Add FTS5 indexing to queue handler (doc create/update/delete) for ongoing sync.

### Step 4: Benchmark FTS5 vs Trigram on eval set (1h)

Using the eval harness from Phase 0:

```bash
# Run eval with trigram (current)
npx tsx tests/search-eval/run-eval.ts --keyword-source=trigram --output=trigram-baseline

# Run eval with FTS5
npx tsx tests/search-eval/run-eval.ts --keyword-source=fts5 --output=fts5-results

# Compare
npx tsx tests/search-eval/compare.ts trigram-baseline.json fts5-results.json
```

**Decision criteria:**
- If FTS5 MRR@5 > trigram MRR@5 by ≥5%: **Adopt FTS5 as primary**, keep trigram as fuzzy fallback
- If comparable (within 5%): **Keep trigram** (less migration risk)
- If FTS5 worse: **Keep trigram**, archive FTS5 code

### Step 5: Adopt or archive (0.5h)

**If adopting FTS5:**
- Modify `search-service.ts`: replace `trigramSearch()` with `fts5Search()` as primary keyword source
- Keep trigram as optional fallback for fuzzy queries (typo tolerance)
- Add `keywordSource` config option (future-proofing)

**If not adopting:**
- Archive `fts5-search-service.ts` in `_archive/`
- Document decision and benchmark results in plan

## Todo List

- [x] Create FTS5 virtual table migration
- [x] Implement `fts5-search-service.ts` with BM25 ranking
- [x] Backfill FTS5 index from existing documents
- [x] Add FTS5 indexing to queue handler (create/update/delete)
- [x] Add `--keyword-source` flag to eval harness
- [x] Run benchmark: FTS5 vs Trigram on eval set
- [x] Document decision with benchmark numbers
- [x] If adopting: swap keyword source in search-service.ts
- [x] Run `pnpm type-check && pnpm lint`
- [x] Run `pnpm test`

## Success Criteria

- [x] FTS5 virtual table created and populated
- [x] Benchmark results documented (MRR@5, Precision@3, latency comparison)
- [x] Clear adopt/archive decision made with data
- [x] If adopted: FTS5 integrated as primary keyword search
- [x] If adopted: Trigram retained as optional fuzzy fallback
- [x] Zero downtime during evaluation (both systems coexist)

## Security Considerations
- FTS5 MATCH query sanitized to prevent injection
- `tenant_id` filter in all FTS5 queries — no cross-tenant data leakage
- FTS5 virtual table not exportable via D1 export — need drop+recreate migration strategy

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| FTS5 query injection | Low | Medium | Sanitize input, parameterized queries |
| FTS5 index storage bloat | Low | Low | Monitor D1 storage, content already in documents table |
| FTS5 + trigram coexistence overhead | Low | Low | Benchmark both, disable trigram if FTS5 adopted |
| D1 FTS5 regression in future update | Very low | High | Keep trigram code, feature flag for keyword source |
