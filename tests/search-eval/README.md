# Search Evaluation Harness

Measure search quality with standardized metrics across pipeline changes.

## Quick Start

```bash
# 1. Bootstrap golden set from current search results
npx tsx tests/search-eval/run-eval.ts --bootstrap --url=http://localhost:8787 --token=$AGENTWIKI_API_KEY

# 2. Review & edit eval-queries.json — adjust expectedSlugs + relevanceGrades

# 3. Run baseline evaluation
npx tsx tests/search-eval/run-eval.ts --label=baseline --verbose --url=http://localhost:8787 --token=$AGENTWIKI_API_KEY

# 4. After pipeline changes, run again and compare
npx tsx tests/search-eval/run-eval.ts --label=after-rrf --compare=tests/search-eval/results/baseline.json --verbose
```

## Metrics

| Metric | What it measures | Target |
|--------|-----------------|--------|
| **MRR@5** | Is the right doc in top 5? (position matters) | >0.7 |
| **Precision@3** | Are top 3 results relevant? | >0.8 |
| **Recall@10** | Were all expected docs found in top 10? | >0.9 |
| **NDCG@10** | Overall ranking quality with graded relevance | >0.7 |
| **Hit Rate@5** | % of queries with ≥1 relevant doc in top 5 | >90% |
| **Latency p50/p95** | Response time distribution | <300ms / <500ms |

## Adding Queries

Edit `eval-queries.json`. Each query needs:
- `id`: Unique identifier (e.g., `"exact-04"`)
- `type`: One of `exact`, `semantic`, `fuzzy`, `multi-concept`, `negative`
- `query`: The search text
- `expectedSlugs`: Document slugs ordered by relevance
- `relevanceGrades`: Optional graded relevance (3=perfect, 2=relevant, 1=partial, 0=irrelevant)

## Running Tests

```bash
# Unit tests for metrics
pnpm vitest run tests/search-eval/metrics.test.ts

# Filter by query type
npx tsx tests/search-eval/run-eval.ts --type=semantic --verbose

# Compare keyword sources (Phase 0.5)
npx tsx tests/search-eval/run-eval.ts --keyword-source=fts5 --label=fts5 --compare=results/baseline.json
```
