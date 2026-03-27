# Phase 1: Backend Scoring Pipeline

**Priority:** P0 — must complete before frontend
**Status:** pending

## Overview

Preserve individual keyword/semantic scores through the RRF fusion pipeline and compute accuracy percentage. Also add accuracy to suggestions.

## Context Links

- Brainstorm: `plans/reports/brainstorm-260327-1535-search-accuracy-percentage.md`
- RRF util: `packages/api/src/utils/rrf.ts`
- Trigram service: `packages/api/src/services/trigram-service.ts`
- FTS5 service: `packages/api/src/services/fts5-search-service.ts`
- Search service: `packages/api/src/services/search-service.ts`
- Storage search: `packages/api/src/services/storage-search-service.ts`
- Suggest service: `packages/api/src/services/suggest-service.ts`
- Shared types: `packages/shared/src/types/search.ts`

## Implementation Steps

### Step 1: Extend shared types (`packages/shared/src/types/search.ts`)

Add `accuracy` field to `SearchResult` and `SuggestItem`:

```typescript
export interface SearchResult {
  // ...existing fields...
  accuracy?: number  // 0-100 relevance percentage
}

export interface SuggestItem {
  // ...existing fields...
  accuracy?: number  // 0-100 relevance percentage
}
```

### Step 2: Extend `RankedResult` (`packages/api/src/utils/rrf.ts`)

Add `keywordScore` and `semanticScore` fields:

```typescript
export interface RankedResult {
  // ...existing fields...
  keywordScore?: number   // trigram overlap ratio or BM25 normalized (0-1)
  semanticScore?: number  // cosine similarity (0-1)
  accuracy?: number       // max(kw, sem) * 100
}
```

In `reciprocalRankFusion()`:
- When merging duplicate docs (existing block), also merge `keywordScore`/`semanticScore` by taking max of each
- After sorting, compute `accuracy = Math.round(max(keywordScore ?? 0, semanticScore ?? 0) * 100)` for each result

```typescript
// In the duplicate merge block:
if (existing) {
  existing.score += rrfScore
  // Merge individual signal scores
  if (item.keywordScore != null) {
    existing.result = { ...existing.result, keywordScore: Math.max(existing.result.keywordScore ?? 0, item.keywordScore) }
  }
  if (item.semanticScore != null) {
    existing.result = { ...existing.result, semanticScore: Math.max(existing.result.semanticScore ?? 0, item.semanticScore) }
  }
  // ...existing snippet logic...
}

// After sort, before return:
return Array.from(scores.values())
  .sort((a, b) => b.score - a.score)
  .map(({ result, score }) => ({
    ...result,
    score,
    accuracy: Math.round(Math.max(result.keywordScore ?? 0, result.semanticScore ?? 0) * 100),
  }))
```

### Step 3: Set `keywordScore` in trigram service (`packages/api/src/services/trigram-service.ts`)

Line ~162: the existing `score: match.matchedTrigrams / trigramKeys.length` is the overlap ratio. Add `keywordScore`:

```typescript
return {
  // ...existing fields...
  score: match.matchedTrigrams / trigramKeys.length,
  keywordScore: match.matchedTrigrams / trigramKeys.length,  // NEW
}
```

### Step 4: Set `keywordScore` in FTS5 service (`packages/api/src/services/fts5-search-service.ts`)

FTS5 BM25 scores aren't 0-1 normalized. Use min-max normalization within the result batch:

```typescript
const rows = (result.results ?? []).map((row) => ({
  id: row.id as string,
  title: row.title as string,
  slug: row.slug as string,
  snippet: extractSnippet((row.content as string) ?? '', query),
  score: Math.abs(row.score as number),
  category: (row.category as string) ?? undefined,
}))

// Normalize BM25 scores to 0-1 for keywordScore
const maxScore = Math.max(...rows.map(r => r.score), 1) // avoid /0
return rows.map(r => ({
  ...r,
  keywordScore: r.score / maxScore,
}))
```

### Step 5: Set `semanticScore` in semantic search (`packages/api/src/services/search-service.ts`)

In `semanticSearch()` function (~line 422-428):

```typescript
return {
  // ...existing fields...
  score: m.score,
  semanticScore: m.score,  // NEW — Vectorize cosine sim is already 0-1
}
```

### Step 6: Set scores in storage search (`packages/api/src/services/storage-search-service.ts`)

**storageKeywordSearch** — LIKE match has no relevance score. Set `keywordScore: 1.0` (binary match):

```typescript
return results.map((r) => ({
  // ...existing fields...
  keywordScore: 1.0,  // LIKE is binary match
}))
```

**storageSemanticSearch** — already has `m.score`:

```typescript
return {
  // ...existing fields...
  score: m.score,
  semanticScore: m.score,  // NEW
}
```

### Step 7: Add accuracy to suggestions (`packages/api/src/services/suggest-service.ts`)

- **Title prefix** (line 55-61): `accuracy: 100` (exact prefix match = perfect relevance)
- **History** (line 82-83): No relevance signal → omit accuracy (undefined)
- **Fuzzy trigram** (line 129-134): `accuracy: Math.round((row.matchCount / trigramKeys.length) * 100)`
  - Need to capture `trigramKeys.length` from outer scope into the fuzzy loop

```typescript
// Source 1: Title prefix
suggestions.push({
  text: row.title, source: 'title',
  documentId: row.id, slug: row.slug,
  accuracy: 100,  // NEW
})

// Source 3: Fuzzy trigram
suggestions.push({
  text: doc.title, source: 'fuzzy',
  documentId: doc.id, slug: doc.slug,
  accuracy: Math.round((row.matchCount / trigramKeys.length) * 100),  // NEW
})
```

### Step 8: Verify search route passes accuracy through (`packages/api/src/routes/search.ts`)

The route returns `searchResult.results` directly (line 80). Since `RankedResult` now includes `accuracy`, it flows through automatically. No change needed — just verify.

## Todo

- [ ] Extend `SearchResult` + `SuggestItem` with `accuracy` field
- [ ] Extend `RankedResult` with `keywordScore`, `semanticScore`, `accuracy`
- [ ] Update RRF fusion to merge signal scores + compute accuracy
- [ ] Set `keywordScore` in trigram service
- [ ] Set `keywordScore` in FTS5 service (with BM25 normalization)
- [ ] Set `semanticScore` in semantic search
- [ ] Set scores in storage keyword + semantic search
- [ ] Add accuracy to suggest service (title=100, fuzzy=overlap%)
- [ ] Verify route passes accuracy through

## Risk Assessment

- **Low**: No algorithm changes, just adding fields through existing pipeline
- **FTS5 normalization**: Min-max within batch is approximate but consistent
- **Cache**: Existing KV cached results won't have accuracy until 5min TTL expires — acceptable
