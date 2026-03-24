---
phase: 0
title: "Search Evaluation Baseline"
status: code-complete
priority: CRITICAL
effort: 3h
blockedBy: []
blocks: [phase-00b, phase-01, phase-02, phase-03]
---

# Phase 0: Search Evaluation Baseline

Build eval set + harness to measure search quality before and after every pipeline change. Without this, all optimization is blind.

## Context Links
- [Research Report — Q4: Eval Set](../reports/researcher-260323-qmd-plan-evaluation.md)
- [Weaviate: Retrieval Evaluation Metrics](https://weaviate.io/blog/retrieval-evaluation-metrics)
- [Pinecone: Offline Evaluation](https://www.pinecone.io/learn/offline-evaluation/)
- Search service: `packages/api/src/services/search-service.ts`

## Overview

- **Priority:** CRITICAL — must complete before any search pipeline changes
- **Status:** pending
- **Description:** Create 40-50 test queries with expected results (golden set), build a harness script to run queries and compute MRR@5, Precision@3, NDCG@10, and latency p50/p95.

## Key Insights

- No existing test queries or golden results in the codebase
- Position-aware RRF, FTS5 migration, query expansion — all need before/after comparison
- Industry standard: 30-50 queries across query types for meaningful statistical signal

## Requirements

### Functional
- Eval set covering 5 query types (exact, semantic, fuzzy, multi-concept, negative)
- Automated harness that runs queries against live or test D1 + Vectorize
- Metrics: MRR@5, Precision@3, NDCG@10, latency p50/p95
- Human-readable report output (markdown table)

### Non-Functional
- Harness runs in <30 seconds for full eval set
- Idempotent — safe to run repeatedly
- Works against local dev and staging environments

## Architecture

```
tests/search-eval/
├── eval-queries.json        # 40-50 queries + expected doc IDs + relevance grades
├── run-eval.ts              # Harness script — runs queries, computes metrics
├── metrics.ts               # MRR, Precision@K, NDCG computation
├── baseline-results.json    # Auto-generated baseline snapshot
└── README.md                # How to run, how to add queries
```

## Related Code Files
- **Read:** `packages/api/src/services/search-service.ts` — understand search API shape
- **Read:** `packages/api/src/routes/search.ts` — understand query params
- **Create:** `tests/search-eval/eval-queries.json`
- **Create:** `tests/search-eval/run-eval.ts`
- **Create:** `tests/search-eval/metrics.ts`

## Implementation Steps

### Step 1: Define eval query schema (0.5h)

```typescript
// eval-queries.json
interface EvalQuery {
  id: string                    // e.g. "exact-01"
  type: 'exact' | 'semantic' | 'fuzzy' | 'multi-concept' | 'negative'
  query: string                 // search query text
  expectedDocIds: string[]      // ordered by relevance (most relevant first)
  relevanceGrades?: number[]    // 0=irrelevant, 1=partial, 2=relevant, 3=perfect
  notes?: string                // why this query matters
}
```

### Step 2: Build 40-50 test queries (1h)

Distribute across types:
- **10 exact-match:** Known titles/terms that should rank #1 (e.g., `"Token Bucket Algorithm"`)
- **10 semantic:** Concept queries with no exact keyword match (e.g., `"how to prevent API abuse"`)
- **10 fuzzy:** Typos, abbreviations, partial terms (e.g., `"rate limting"`, `"k8s"`)
- **10 multi-concept:** Compound queries (e.g., `"rate limiting in microservices"`)
- **5 negative:** Queries that should return empty or very specific results

**Bootstrapping approach:** Run current search for each query, manually grade top-10 results, save as golden set. This IS the baseline.

### Step 3: Implement metrics computation (0.5h)

```typescript
// metrics.ts
export function mrr(results: string[], expected: string[], k = 5): number {
  for (let i = 0; i < Math.min(results.length, k); i++) {
    if (expected.includes(results[i])) return 1 / (i + 1)
  }
  return 0
}

export function precisionAtK(results: string[], expected: string[], k = 3): number {
  const topK = results.slice(0, k)
  const relevant = topK.filter(id => expected.includes(id))
  return relevant.length / k
}

export function ndcg(results: string[], grades: number[], k = 10): number {
  // DCG = Σ (2^grade_i - 1) / log2(i + 2)
  // NDCG = DCG / ideal DCG
  const dcg = results.slice(0, k).reduce((sum, id, i) => {
    const grade = grades[results.indexOf(id)] ?? 0
    return sum + (Math.pow(2, grade) - 1) / Math.log2(i + 2)
  }, 0)

  const idealGrades = [...grades].sort((a, b) => b - a).slice(0, k)
  const idcg = idealGrades.reduce((sum, g, i) => {
    return sum + (Math.pow(2, g) - 1) / Math.log2(i + 2)
  }, 0)

  return idcg === 0 ? 0 : dcg / idcg
}
```

### Step 4: Build harness runner (1h)

```typescript
// run-eval.ts
// Usage: npx tsx tests/search-eval/run-eval.ts --env=local --output=baseline
import queries from './eval-queries.json'
import { mrr, precisionAtK, ndcg } from './metrics'

async function runEval(baseUrl: string) {
  const results = []

  for (const q of queries) {
    const t0 = Date.now()
    const res = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(q.query)}&limit=10`)
    const latency = Date.now() - t0
    const data = await res.json()
    const docIds = data.results.map(r => r.id)

    results.push({
      queryId: q.id,
      type: q.type,
      mrr5: mrr(docIds, q.expectedDocIds, 5),
      precision3: precisionAtK(docIds, q.expectedDocIds, 3),
      ndcg10: ndcg(docIds, q.relevanceGrades ?? [], 10),
      latencyMs: latency,
      topResults: docIds.slice(0, 5),
    })
  }

  // Aggregate
  const avgMRR = results.reduce((s, r) => s + r.mrr5, 0) / results.length
  const avgP3 = results.reduce((s, r) => s + r.precision3, 0) / results.length
  const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b)
  const p50 = latencies[Math.floor(latencies.length * 0.5)]
  const p95 = latencies[Math.floor(latencies.length * 0.95)]

  // Output markdown report
  console.log(`## Search Eval Results`)
  console.log(`| Metric | Value |`)
  console.log(`|--------|-------|`)
  console.log(`| Avg MRR@5 | ${avgMRR.toFixed(3)} |`)
  console.log(`| Avg Precision@3 | ${avgP3.toFixed(3)} |`)
  console.log(`| Latency p50 | ${p50}ms |`)
  console.log(`| Latency p95 | ${p95}ms |`)

  // Save snapshot
  const snapshot = { timestamp: new Date().toISOString(), results, avgMRR, avgP3, p50, p95 }
  await Bun.write('tests/search-eval/baseline-results.json', JSON.stringify(snapshot, null, 2))
}
```

## Todo List

- [x] Define `EvalQuery` schema in `eval-queries.json`
- [x] Populate 40-50 queries across 5 types
- [x] Bootstrap golden set by running current search + manual grading
- [x] Implement `metrics.ts` (MRR, Precision@K, NDCG)
- [x] Build `run-eval.ts` harness with markdown output
- [x] Run baseline evaluation, save `baseline-results.json`
- [x] Document in `README.md` how to add queries and run evals

## Success Criteria

- [x] 40+ eval queries with golden set doc IDs and relevance grades
- [x] Harness runs <30s, outputs markdown report
- [x] Baseline MRR@5, Precision@3, NDCG@10, latency p50/p95 captured
- [x] Can run `npx tsx tests/search-eval/run-eval.ts` after any pipeline change

## Security Considerations
- Eval harness reads from search API only — no mutations
- Test queries should not contain sensitive data
- Golden set doc IDs are internal references only

## Next Steps
- Run eval after EVERY subsequent phase (P0.5, P1, P2, P3)
- Compare results against baseline to prove/disprove improvements
- Expand eval set over time as new query patterns emerge
