# Brainstorm: Search Accuracy Percentage in Command Palette

**Issue:** [#55](https://github.com/digitopvn/agentwiki/issues/55)
**Date:** 2026-03-27
**Status:** Approved

## Problem Statement

Search results in command palette show no relevance indicator. Users can't judge result quality. Results need accuracy % badge + descending sort by accuracy.

## Current State

- **Trigram search**: Returns `score = matchedTrigrams / queryTrigrams.length` (0-1 overlap ratio)
- **Semantic search**: Returns `score = Vectorize cosine similarity` (0-1)
- **RRF fusion**: Replaces original scores with rank-based score (~0.016) — original scores lost
- **Suggestions**: Title prefix (no score), history (no score), fuzzy trigram (has matchCount but not exposed)
- **Frontend**: Displays title + snippet/category, score field ignored

## Chosen Approach: Preserve & Blend (Option A)

**Formula:** `accuracy = max(keywordScore, semanticScore) * 100`

### Why max() instead of avg():
- Single-signal results (keyword-only or semantic-only) shouldn't be penalized
- A doc with 95% keyword match and 0% semantic (not indexed yet) should show 95%, not 47.5%
- max() reflects the strongest signal for that document

## Design

### Backend Changes

#### 1. Extend `RankedResult` (packages/api/src/utils/rrf.ts)
```typescript
export interface RankedResult {
  id: string
  title: string
  slug: string
  snippet: string
  score?: number
  category?: string
  context?: string | null
  keywordScore?: number   // NEW: trigram overlap ratio (0-1)
  semanticScore?: number  // NEW: cosine similarity (0-1)
  accuracy?: number       // NEW: max(kw, sem) * 100 → percentage
}
```

#### 2. Trigram service (packages/api/src/services/trigram-service.ts)
- Already computes overlap ratio as `score`
- Add: `keywordScore: score` to result object

#### 3. Semantic search (packages/api/src/services/search-service.ts)
- Already has `score: m.score` (Vectorize cosine sim)
- Add: `semanticScore: score` to result object

#### 4. RRF fusion (packages/api/src/utils/rrf.ts)
- When merging duplicate docs: merge `keywordScore` and `semanticScore` from both sources
- After fusion: compute `accuracy = Math.round(max(keywordScore ?? 0, semanticScore ?? 0) * 100)`

#### 5. Extend `SearchResult` (packages/shared/src/types/search.ts)
```typescript
export interface SearchResult {
  id: string
  title: string
  slug: string
  snippet?: string
  score?: number
  category?: string
  accuracy?: number  // NEW: 0-100 percentage
}
```

#### 6. Suggestions accuracy (packages/api/src/services/suggest-service.ts)
- **Title prefix**: accuracy = 100 (exact prefix match)
- **History**: accuracy = undefined (no relevance metric)
- **Fuzzy trigram**: accuracy = Math.round(matchCount / trigramKeys.length * 100)

#### 7. Extend `SuggestItem` (packages/shared/src/types/search.ts)
```typescript
export interface SuggestItem {
  text: string
  source: 'title' | 'history' | 'fuzzy'
  documentId?: string
  slug?: string
  accuracy?: number  // NEW: 0-100 percentage
}
```

### Frontend Changes

#### 8. CommandItem badge (packages/web/src/components/command-palette/command-palette.tsx)
- Add accuracy badge to `CommandItem` component
- Color coding: >= 80% green, >= 50% yellow, < 50% red/gray
- Badge position: right-aligned, small pill

#### 9. Sort results by accuracy descending
- Search results already sorted by RRF score (which correlates with accuracy)
- Verify ordering maintained after accuracy computation

### Files to Modify

| File | Change |
|------|--------|
| `packages/api/src/utils/rrf.ts` | Add keywordScore/semanticScore merge + accuracy computation |
| `packages/api/src/services/trigram-service.ts` | Set `keywordScore` on results |
| `packages/api/src/services/search-service.ts` | Set `semanticScore` on results |
| `packages/api/src/services/suggest-service.ts` | Add accuracy to suggestions |
| `packages/shared/src/types/search.ts` | Add `accuracy` to SearchResult + SuggestItem |
| `packages/web/src/components/command-palette/command-palette.tsx` | Add accuracy badge UI |

### Files to Read (context)
| File | Reason |
|------|--------|
| `packages/api/src/routes/search.ts` | Verify response mapping |
| `packages/api/src/services/fts5-search-service.ts` | FTS5 also needs keywordScore |
| `packages/api/src/services/storage-search-service.ts` | Storage search needs scores too |

## Risk Assessment

- **Low risk**: No RRF algorithm change, just preserving extra fields through pipeline
- **Cache invalidation**: KV cached results won't have accuracy until cache expires (5min TTL) — acceptable
- **FTS5 service**: Also needs `keywordScore` set (same pattern as trigram)
- **Storage search**: Both keyword and semantic variants need scores set

## Success Criteria

1. Search results display accuracy % badge (0-100%)
2. Results sorted by accuracy descending
3. Suggestions show accuracy where available
4. Color-coded badge: green >= 80%, yellow >= 50%, gray < 50%
5. No performance regression (no extra DB queries)

## Next Steps

Create implementation plan with phases → implement → test → review.
