---
phase: 2
title: "Smart Markdown Chunking + Search Debug Mode"
status: code-complete
priority: MEDIUM
effort: 4h
blockedBy: [phase-00]
blocks: []
---

# Phase 2: Smart Chunking + Debug Mode

Improve embedding quality via structure-aware chunking and add search debugging capabilities.

## Context Links
- Current chunker: `packages/api/src/utils/chunker.ts` (62 LOC)
- Search route: `packages/api/src/routes/search.ts`
- Search service: `packages/api/src/services/search-service.ts`
- [Research Report](../reports/researcher-260323-qmd-plan-evaluation.md)

## 2A: Markdown-Aware Chunking

**Effort:** 2h | **Files:** `chunker.ts`, `embedding-service.ts`

> **Note (2026-03-23):** Codebase exploration confirmed `chunker.ts` ALREADY splits on headings `#{1,3}`. This phase is an **incremental improvement**, not a rewrite. Effort reduced from 3h to 2h.

### Current Behavior
- Splits on headings (h1-h3) — ✅ already done
- Fixed 2000 char max, 600 char overlap — too large, too much overlap
- Doesn't protect code blocks from splitting
- Doesn't track heading hierarchy (only immediate parent heading)
- Vectorize metadata already includes `heading` field — just needs chain instead of single

### New Behavior
- Reduce chunk size to ~1200 chars (~300 tokens) for more precise vector matches
- Reduce overlap to ~180 chars (~15%) — heading context replaces overlap need
- Never split inside code blocks (fenced ``` blocks kept intact)
- Track heading hierarchy chain as metadata: `"## API > ### Rate Limiting"`
- Track list blocks (don't split mid-list)

### Implementation Steps

1. **Refactor `chunkMarkdown()` to be structure-aware:**
   ```typescript
   export interface Chunk {
     index: number
     text: string
     heading: string | null       // immediate heading
     headingChain: string | null   // "## API > ### Auth > #### Tokens"
   }

   export function chunkMarkdown(
     content: string,
     maxChars = 1200,
     overlapChars = 180,
   ): Chunk[]
   ```

2. **Pre-process: identify protected blocks** that should not be split:
   ```typescript
   // Find all fenced code blocks
   const codeBlocks = findCodeBlockRanges(content) // [{start, end}]

   // Find all list blocks (consecutive lines starting with - or *)
   const listBlocks = findListBlockRanges(content)
   ```

3. **Split at structural boundaries** in priority order:
   - h1/h2/h3 headings (primary split points)
   - Blank lines between paragraphs (secondary split points)
   - Never split inside code blocks or list blocks
   - If a code block exceeds maxChars, keep it as one oversized chunk (better than splitting code)

4. **Build heading chain** during splitting:
   ```typescript
   const headingStack: string[] = []
   // On h1: reset stack, push h1
   // On h2: pop until h1, push h2
   // On h3: pop until h2, push h3
   // headingChain = headingStack.join(' > ')
   ```

5. **Update Vectorize metadata** in `embedding-service.ts`:
   ```typescript
   metadata: {
     org_id: tenantId,
     doc_id: docId,
     chunk_index: chunk.index,
     heading: chunk.heading ?? '',
     heading_chain: chunk.headingChain ?? '',  // NEW
     category: category ?? '',
   }
   ```

6. **Queue re-embedding job** for all existing documents:
   - Create one-time admin endpoint or script
   - Enqueue `embed` jobs for all documents
   - Run during low-traffic window

### Success Criteria
- [x] Code blocks never split across chunks
- [x] Heading chain appears in Vectorize metadata
- [x] Average chunk size reduced from ~2000 to ~1200 chars
- [x] All existing documents re-embedded after deploy

---

## 2B: Search Debug Mode

**Effort:** 2h | **Files:** `search.ts` route, `search-service.ts`, shared types

### Current Behavior
Search API returns only results. No visibility into scoring, timing, or which signals contributed.

### New Behavior
`GET /api/search?q=test&debug=true` returns additional debug info:

```json
{
  "results": [...],
  "debug": {
    "timings": {
      "keyword_ms": 35,
      "semantic_ms": 210,
      "fusion_ms": 1,
      "total_ms": 246
    },
    "counts": {
      "keyword_candidates": 12,
      "semantic_candidates": 8,
      "fused_total": 15,
      "returned": 10
    },
    "cache": {
      "hit": false,
      "key": "search:tenant_abc:hybrid:docs:10:test:"
    },
    "top_scores": [
      {
        "id": "doc_123",
        "keyword_rank": 1,
        "semantic_rank": 3,
        "rrf_score": 0.032,
        "position_weight": 0.75
      }
    ]
  }
}
```

### Implementation Steps

1. **Add `SearchDebugInfo` type** to shared package:
   ```typescript
   export interface SearchDebugInfo {
     timings: { keyword_ms: number; semantic_ms: number; fusion_ms: number; total_ms: number }
     counts: { keyword_candidates: number; semantic_candidates: number; fused_total: number; returned: number }
     cache: { hit: boolean; key: string }
     topScores?: Array<{
       id: string
       keyword_rank: number | null
       semantic_rank: number | null
       rrf_score: number
     }>
   }
   ```

2. **Modify `searchDocuments()` return type** when debug is requested:
   ```typescript
   interface SearchResult {
     results: RankedResult[]
     debug?: SearchDebugInfo
   }

   export async function searchDocuments(
     env: Env,
     options: SearchOptions & { debug?: boolean },
   ): Promise<SearchResult>
   ```

3. **Instrument search pipeline** with timing:
   ```typescript
   const t0 = Date.now()
   const keywordResults = await trigramSearch(...)
   const t1 = Date.now()
   const semanticResults = await semanticSearch(...)
   const t2 = Date.now()
   const fused = reciprocalRankFusion(...)
   const t3 = Date.now()

   if (options.debug) {
     debug = {
       timings: { keyword_ms: t1-t0, semantic_ms: t2-t1, fusion_ms: t3-t2, total_ms: t3-t0 },
       counts: { keyword_candidates: keywordResults.length, ... },
       ...
     }
   }
   ```

4. **Add `debug` query param** in search route:
   ```typescript
   const debug = c.req.query('debug') === 'true'
   const result = await searchDocuments(env, { ...options, debug })
   ```

5. **Skip cache when debug=true** (always compute fresh for debugging).

6. **Restrict debug to admin/editor roles** — don't expose internal scoring to viewers.

### Success Criteria
- [x] `debug=true` returns timing + scoring breakdown
- [x] Debug info only available to admin/editor roles
- [x] No performance impact when debug is off (no timing instrumentation)
- [x] Cache skipped when debugging

---

## Todo List

- [x] 2A: Refactor `chunker.ts` with code block protection
- [x] 2A: Add heading chain tracking to `Chunk` interface
- [x] 2A: Update Vectorize metadata with `heading_chain`
- [x] 2A: Write re-embedding script/endpoint
- [x] 2B: Add `SearchDebugInfo` type to shared package
- [x] 2B: Instrument search pipeline with timing
- [x] 2B: Add `debug` query param to search route
- [x] 2B: Restrict debug to admin/editor roles
- [x] Run `pnpm type-check && pnpm lint`
- [x] Run `pnpm test`

## Security Considerations
- Debug mode restricted to admin/editor — no scoring leakage to viewers
- No sensitive data in debug output (only IDs, ranks, timings)
