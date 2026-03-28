# Code Review: Search Accuracy Percentage (Issue #55)

**Date:** 2026-03-27
**Reviewer:** code-reviewer
**Branch:** feat-search-accuracy-percentage
**Scope:** 8 files, ~60 LOC added/modified for accuracy feature

---

## Overall Assessment

The feature is well-designed with clean data flow: individual signal scores (0-1) propagate through the search pipeline and are unified into a user-facing 0-100% accuracy badge via RRF fusion. The UI component is minimal and well-integrated. One critical bug found in the single-signal code path.

---

## Critical Issues

### 1. [BUG] Single-signal search skips accuracy computation

**File:** `packages/api/src/services/search-service.ts` line 119
**Impact:** When only one RRF input exists (e.g., keyword-only or semantic-only search, or when one signal returns 0 results), `reciprocalRankFusion()` is bypassed. The `accuracy` field is only computed inside RRF (rrf.ts:87), so these results will have `accuracy: undefined`.

```ts
// Line 119 — skips RRF when single input
let fused = rrfInputs.length > 1 ? reciprocalRankFusion(...rrfInputs) : rrfInputs[0]?.list ?? []
```

**Affected scenarios:**
- `type=keyword` search (only keyword input)
- `type=semantic` search (only semantic input)
- Hybrid search where one signal returns empty (e.g., no trigrams indexed yet, or Vectorize down)

**Fix:** Compute accuracy on the fallback path:
```ts
let fused = rrfInputs.length > 1
  ? reciprocalRankFusion(...rrfInputs)
  : (rrfInputs[0]?.list ?? []).map(r => ({
      ...r,
      accuracy: Math.round(Math.max(r.keywordScore ?? 0, r.semanticScore ?? 0) * 100),
    }))
```

---

## High Priority

### 2. [TYPE] `resultType` not in `RankedResult` interface

**File:** `packages/api/src/services/storage-search-service.ts` lines 45, 107-108
**Impact:** `resultType: 'upload'` is added to return objects but not declared in the `RankedResult` interface. The `satisfies RankedResult & { resultType: string }` workaround on line 108 papers over this, but line 45 (keyword search) has no `satisfies` annotation — relies on structural compatibility.

**Fix:** Either add `resultType?: string` to `RankedResult` or remove it (it's not consumed anywhere).

### 3. [EDGE CASE] BM25 normalization always makes top result 100%

**File:** `packages/api/src/services/fts5-search-service.ts` line 73
**Impact:** `Math.max(...rows.map(r => r.score), 1)` normalizes relative to the max score. The best FTS5 result always gets `keywordScore: 1.0` (hence accuracy 100%), even for poor matches. This is a relative ranking, not an absolute confidence measure. Users may see "100%" for queries with only marginal BM25 hits.

**Recommendation:** This is a design tradeoff — acceptable for MVP. Document that BM25 normalization is relative. Consider absolute thresholds or score calibration in a future iteration.

### 4. [EDGE CASE] Single FTS5 result with score < 1

**File:** `packages/api/src/services/fts5-search-service.ts` line 73
**Impact:** If `rows` is empty, `Math.max(...[])` returns `-Infinity`, but the guard value `1` prevents issues. If there's a single result with score 0.5, it normalizes to `0.5/1 = 0.5` which is correct. No bug, but edge case is covered.

---

## Medium Priority

### 5. [DESIGN] Accuracy formula uses `max()` — masks weak signals

**File:** `packages/api/src/utils/rrf.ts` line 87

`accuracy = max(keywordScore, semanticScore) * 100` means a document matching on keyword only (score 0.9) with zero semantic similarity still shows 90%. This is intentional per design doc, but users might expect accuracy to reflect combined confidence.

**Alternatives considered:**
- Weighted average: `0.6 * keyword + 0.4 * semantic` — penalizes single-signal matches too harshly
- Geometric mean: `sqrt(keyword * semantic)` — would make single-signal results 0%

Current approach (max) is the most user-friendly. No change needed.

### 6. [PERF] Suggest accuracy for title prefix is hardcoded `100`

**File:** `packages/api/src/services/suggest-service.ts` line 60

Title prefix matches always show 100% accuracy. This is semantically correct (exact prefix = highest confidence) but may create a misleading sense of precision. A title starting with the query prefix doesn't mean the document is relevant.

**Verdict:** Acceptable — prefix match is the strongest signal for autocomplete context.

---

## Low Priority

### 7. [A11Y] AccuracyBadge lacks screen reader context

**File:** `packages/web/src/components/command-palette/command-palette.tsx` line 281

The badge renders `{value}%` without `aria-label`. Screen readers will read "85 percent" which is fine, but adding `aria-label="85% relevance"` would provide better context.

### 8. [STYLE] AccuracyBadge color thresholds not dark-mode-aware for green/yellow

**File:** `packages/web/src/components/command-palette/command-palette.tsx` lines 271-278

Green and yellow variants use the same classes for both themes (`text-emerald-400 bg-emerald-500/10`). Only the gray variant differentiates light/dark. These colors may have low contrast on light backgrounds.

---

## Positive Observations

1. **Clean data flow** — Signal scores (keywordScore, semanticScore) are set at the source and merged in RRF. No leaky abstractions.
2. **Type safety** — `satisfies RankedResult` pattern ensures structural compliance at sources.
3. **Backward compatible** — `accuracy?: number` is optional on all interfaces. Existing consumers unaffected.
4. **FTS5 normalization guard** — `Math.max(..., 1)` prevents division by zero elegantly.
5. **Suggest deduplication** — `seenTexts` set prevents duplicate suggestions with different accuracy values.
6. **UI restraint** — Badge is minimal, doesn't clutter the palette. `tabular-nums` ensures consistent width.

---

## Score Propagation Verification

| Source | Score Field | Range | Verified |
|--------|-----------|-------|----------|
| trigram-service | `keywordScore` (overlap ratio) | 0-1 | OK |
| fts5-search-service | `keywordScore` (normalized BM25) | 0-1 | OK (relative) |
| search-service (semantic) | `semanticScore` (cosine sim) | 0-1 | OK |
| storage-search-service (keyword) | `keywordScore: 1.0` (binary) | 1 | OK |
| storage-search-service (semantic) | `semanticScore` (cosine sim) | 0-1 | OK |
| suggest-service (title) | `accuracy: 100` | 100 | OK |
| suggest-service (fuzzy) | `accuracy: matchCount/total*100` | 0-100 | OK |
| suggest-service (history) | no accuracy | undefined | OK (by design) |
| RRF fusion | `max(keyword, semantic) * 100` | 0-100 | OK |

---

## Recommended Actions (Priority Order)

1. **[CRITICAL]** Fix single-signal path in search-service.ts to compute accuracy when RRF is skipped
2. **[HIGH]** Clean up `resultType` on storage-search-service — either add to interface or remove
3. **[LOW]** Add `aria-label` to AccuracyBadge for accessibility
4. **[FUTURE]** Consider absolute BM25 score thresholds instead of relative normalization

---

## Metrics

- **Type Coverage:** Good — all new fields typed with optional markers
- **Test Coverage:** No new tests for accuracy computation (recommend unit test for RRF accuracy output)
- **Linting Issues:** 0 (no syntax errors detected)

---

## Unresolved Questions

1. Should storage keyword results (LIKE match) show accuracy 100%? LIKE is binary, but the match could be a substring in a large document — relevance may actually be low.
2. Should expanded query results contribute to accuracy? Currently they use `signal: 'default'` which doesn't set keywordScore/semanticScore, so expanded results may show 0% accuracy after fusion.
