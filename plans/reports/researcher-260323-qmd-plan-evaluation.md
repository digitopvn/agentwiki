# Research Report: QMD Plan Unresolved Questions & Evaluation

**Date:** 2026-03-23
**Issue:** [#38](https://github.com/digitopvn/agentwiki/issues/38)
**Plan:** [260322-1646-qmd-search-improvements](../260322-1646-qmd-search-improvements/plan.md)
**Methodology:** WebSearch (5 queries), WebFetch (2 pages), codebase exploration (35 file reads)

---

## Part 1: Answers to Unresolved Questions

### Q1: Has D1 added FTS5 support?

**Answer: YES — D1 now supports FTS5.**

[D1 SQL docs](https://developers.cloudflare.com/d1/sql-api/sql-statements/) confirm FTS5 module + `fts5vocab` are available. [Community thread](https://community.cloudflare.com/t/d1-support-for-virtual-tables/607277) and [third-party benchmarks](https://www.wolk.work/blog/posts/a-quest-to-find-the-fastest-search-stack) confirm it works in production.

**Caveats:**
- Must use lowercase `fts5` (case-sensitive on D1)
- Virtual tables cannot be exported via D1 export tool (workaround: drop + recreate)
- Standard SQLite FTS5 syntax applies (MATCH, rank, bm25())

**Impact on Plan:**
This is a **significant finding**. The brainstorm report stated "D1 does NOT support FTS5 extension loading" — this is now **outdated**. BM25 via FTS5 should be **reconsidered** as a replacement or supplement to trigram search.

**Recommendation:** Add a **Phase 0** or modify Phase 1 to evaluate FTS5/BM25 vs trigram search. BM25 provides:
- Better ranking (TF-IDF-based vs raw trigram frequency)
- Native phrase search (`"rate limiting"`)
- Prefix matching (`perform*`)
- Negation (`-deprecated`)
- Potentially faster than trigram table scans

**Trade-off:** Trigram gives fuzzy/typo tolerance that FTS5 lacks. Best approach: **use both** — FTS5 for primary keyword ranking, trigram as fallback for fuzzy matches. Or FTS5 primary + Vectorize semantic as fuzzy fallback.

---

### Q2: Is 200-500ms query expansion latency acceptable?

**Answer: Conditionally YES — but must be opt-in and cached.**

**Industry benchmarks:**
- Users perceive <100ms as instant, 100-300ms as sluggish, >300ms as broken ([Salesforce engineering](https://engineering.salesforce.com/scaling-real-time-search-to-30-billion-queries-with-sub-second-latency-and-0-downtime/))
- Perplexity achieves 358ms median across full multi-stage pipeline including expansion ([iPullRank analysis](https://ipullrank.com/expanding-queries-with-fanout))
- [Elastic Labs](https://www.elastic.co/search-labs/blog/text-expansion-pruning) shows token pruning yields 3-4x latency improvement for expansion

**AgentWiki context:**
- Current p95: ~450ms (already near threshold)
- Adding 200-500ms expansion → 650-950ms total (unacceptable for interactive UI)
- MCP/API consumers (AI agents) tolerate higher latency — 1-2s acceptable

**Recommendation:**
1. **UI search:** NO expansion by default. Cache + optional toggle (`expand=true`)
2. **MCP search:** Expansion ON by default (agents benefit most, tolerate latency)
3. **API search:** Expansion opt-in via query param
4. **KV cache:** Aggressive caching (1-hour TTL) reduces repeat query latency to ~0ms
5. **Parallel execution:** Run expansion + regular search in parallel, merge results — total latency = max(expansion, regular search) not sum

**Critical insight from research:** Run expanded queries **in parallel** with the original query, not sequentially. This means expansion latency only adds overhead for cache-miss first queries, and even then only the delta between AI call and regular search.

---

### Q3: Re-embedding cost after chunking strategy change?

**Answer: Moderate one-time cost, manageable.**

**Workers AI pricing ([official docs](https://developers.cloudflare.com/workers-ai/platform/pricing/)):**
- Model: `@cf/baai/bge-base-en-v1.5`
- Cost: **$0.067 per 1M input tokens** (6,058 neurons/M tokens)
- Free tier: **10,000 neurons/day** (~1.65M tokens/day free
- Base rate: $0.011 per 1,000 neurons

**Cost estimation (per 1,000 documents):**

| Metric | Current (2000 char chunks) | New (1000 char chunks) |
|--------|---------------------------|----------------------|
| Avg chunks/doc (5KB doc) | ~3 chunks | ~6 chunks |
| Tokens/chunk | ~512 | ~256 |
| Total tokens/doc | ~1,536 | ~1,536 |
| Total tokens/1K docs | ~1.5M | ~1.5M |
| Cost/1K docs | **$0.10** | **$0.10** |

**Key insight:** Smaller chunks = more chunks, but same total tokens. **Total embedding cost stays roughly the same** because you embed the same content regardless of chunk size. Overlap reduction (30%→15%) actually **reduces** total tokens slightly.

**Vectorize costs:**
- Vectorize pricing: included in Workers Paid plan (no per-vector cost)
- Upsert limit: 1,000 vectors per batch
- For 1K docs × 6 chunks = 6,000 vectors → 6 batch upserts

**Queue processing time:**
- 5 texts per AI batch → 6 chunks/doc = ~1.2 AI calls/doc
- 1K docs = ~1,200 AI calls
- At ~200ms/call = ~4 minutes total processing time via queue

**Recommendation:**
- Run re-embedding as background queue batch job
- Process during low-traffic hours
- Cost negligible (<$1 for most tenants)
- **Do NOT block on this** — it's a one-time migration cost

---

### Q4: Do we have search quality eval set?

**Answer: NO — and we should build one BEFORE implementing changes.**

**Codebase check:** No test queries, golden results, or eval harness found in the repository.

**Why eval-first matters:**
Without baseline measurements, we can't prove improvements. Position-aware RRF might actually worsen results for certain query types. Query expansion might introduce noise.

**Recommended eval methodology ([Weaviate](https://weaviate.io/blog/retrieval-evaluation-metrics), [Pinecone](https://www.pinecone.io/learn/offline-evaluation/)):**

1. **Build eval set (30-50 queries):**
   - 10 exact-match queries (known title/term)
   - 10 semantic queries (concept-based, no exact keywords)
   - 10 fuzzy queries (typos, abbreviations)
   - 10 multi-concept queries ("rate limiting in microservices")
   - 5-10 negative queries (should return nothing or specific exclusions)

2. **Metrics to track:**
   - **MRR@5** (Mean Reciprocal Rank) — is the right doc in top 5?
   - **Precision@3** — are top 3 results relevant?
   - **NDCG@10** — overall ranking quality with graded relevance
   - **Latency p50/p95** — performance regression check

3. **Eval harness:**
   - Simple script: run each query, compare results against golden set
   - Store in `tests/search-eval/` with query JSON + expected doc IDs
   - Run before/after each search pipeline change

**Recommendation:**
- **Add Phase 0: Build Search Eval Set** (2-3 hours)
- Run against current pipeline to establish baseline
- Re-run after each phase to measure improvement
- This is the highest-ROI investment — without it, all other changes are blind

---

## Part 2: Plan Evaluation

### Overall Assessment: SOLID with critical updates needed

The plan is well-structured, correctly identifies high-value improvements, and rightly rejects unsuitable patterns. However, 3 findings require plan modifications.

### Critical Updates Required

#### 1. D1 FTS5 is now available → Reconsider BM25

**Severity:** HIGH — changes the "Should NOT Adopt" list

The plan's "Should NOT Adopt #2" (BM25/FTS5) was based on D1 not supporting FTS5. This is **no longer true**. FTS5 is now production-ready on D1.

**Recommended action:**
- Add **Phase 0.5: FTS5/BM25 Evaluation** (3-4h)
- Build FTS5 virtual table alongside existing trigram index
- Benchmark BM25 ranking vs trigram scoring on eval set
- If BM25 wins (likely): migrate keyword search to FTS5, keep trigram as fuzzy fallback
- If comparable: keep trigram (less migration risk)

**Why this matters:** BM25 provides TF-IDF ranking that trigram search lacks. This could be a bigger quality improvement than position-aware RRF. FTS5 also natively supports phrase search and negation — features QMD has via FTS5 that AgentWiki currently lacks.

#### 2. Query expansion must be parallel, not sequential

**Severity:** MEDIUM — changes Phase 3 architecture

Plan implies expansion runs before search. Should run **in parallel**:

```
Query ──┬─→ [AI Expand] → [Search expanded queries] ──┐
        │                                               ├─→ Merge + RRF
        └─→ [Search original query] ───────────────────┘
```

This caps latency at `max(expansion_time, search_time)` instead of `sum()`. For cached expansions, zero added latency.

#### 3. Add Phase 0: Eval Set (before any changes)

**Severity:** HIGH — without this, no way to measure improvement

Must establish baseline MRR/Precision/NDCG before touching the pipeline. Otherwise we're optimizing blind.

---

### Phase-by-Phase Evaluation

#### Phase 1: Quick Wins (RRF + Hash + Cache) — 5h estimate

| Item | Assessment | Effort Accuracy | Risk |
|------|-----------|-----------------|------|
| **Position-Aware RRF** | Good. Low-risk, easy revert. Code is clean 44 LOC. | Accurate (1-2h) | Low — but need eval set to prove improvement |
| **Content Hash** | Good. `contentHash()` already exists in `document-service.ts:249-278`. Just need to store hash in DB + check before queueing embed. | Accurate (1-2h) | Very low |
| **Search Cache** | Good. KV infrastructure exists. Simple key=hash(query+filters), value=results. | Accurate (1-2h) | Low — TTL + invalidation on doc change |

**Verdict:** Phase 1 is well-scoped. Proceed as-is. Only concern: RRF weighting changes should be validated against eval set.

**Codebase alignment:**
- `rrf.ts` (44 LOC) — clean, easy to modify
- `embedding-service.ts` (71 LOC) — straightforward hash check addition
- `search-service.ts` (272 LOC) — cache layer wraps existing search

---

#### Phase 2: Smart Chunking + Debug (5h estimate)

| Item | Assessment | Effort Accuracy | Risk |
|------|-----------|-----------------|------|
| **Smart Chunking** | Partially already done! `chunker.ts` already splits by headings. Missing: code block preservation, reduced chunk size, heading chain metadata. | Slightly overestimated — 1-2h since heading split exists | Low — but triggers full re-embed |
| **Search Debug** | Good. Clean addition to search response. | Accurate (2-3h) | None |

**Verdict:** Phase 2 is good. Key correction: current chunker (62 LOC) already splits on `#{1,3}` headings. The "smart chunking" improvement is incremental, not a rewrite:
- Add code block detection (don't split inside ``` blocks)
- Reduce maxChars 2000→1000, overlap 600→150
- Pass heading chain as Vectorize metadata

**Codebase finding:** Chunk metadata already includes `heading` field in Vectorize upsert. Just needs heading chain (parent > child) instead of single heading.

---

#### Phase 3: Context + Expansion (12h estimate)

| Item | Assessment | Effort Accuracy | Risk |
|------|-----------|-----------------|------|
| **Folder Context** | Good concept. Schema: add `description TEXT` to folders table. API + UI changes needed. | Accurate (6-8h including UI, API, MCP, migration) | Low |
| **Query Expansion** | Architecture needs revision (parallel not sequential). Cache strategy sound. | Slightly underestimated if including parallel merge logic — 6-8h | Medium — latency, AI cost |

**Verdict:** Phase 3 is the highest-impact but needs architectural update for expansion parallelism. Folder context is straightforward additive change.

**Concern about expansion:** The plan says "new `query-expansion-service.ts`" — this is correct, but should also modify `search-service.ts` to run expansion + original search in parallel (Promise.all), not serially.

---

### Effort Estimate Assessment

| Phase | Plan Estimate | Revised Estimate | Delta |
|-------|--------------|------------------|-------|
| Phase 0 (NEW: Eval Set) | — | 3h | +3h |
| Phase 0.5 (NEW: FTS5 Eval) | — | 4h | +4h |
| Phase 1 | 5h | 5h | 0 |
| Phase 2 | 5h | 4h | -1h |
| Phase 3 | 12h | 14h | +2h |
| **Total** | **22h** | **30h** | **+8h** |

The +8h comes from: eval set (3h), FTS5 evaluation (4h), and expansion parallelism complexity (+2h). These are high-ROI investments.

---

### Priority Re-ordering Recommendation

**Original order:** Phase 1 → 2 → 3

**Recommended order:**

```
Phase 0:   Build eval set + baseline metrics          (3h)  — MUST DO FIRST
Phase 0.5: FTS5/BM25 evaluation                      (4h)  — game-changer if positive
Phase 1:   Quick wins (RRF + Hash + Cache)            (5h)  — safe, immediate impact
Phase 2:   Smart chunking + Debug mode                (4h)  — moderate impact
Phase 3:   Folder context + Query expansion (parallel) (14h) — highest impact, most complex
```

---

### Strengths of the Plan

1. **Correct rejection of local LLM, custom models, YAML config** — YAGNI applied well
2. **Leverages existing AI providers** for expansion — pragmatic cloud-native approach
3. **Content hash optimization** — uses existing `contentHash()` function, minimal new code
4. **Phased rollout** — independent phases reduce risk
5. **Clear file mapping** — every change maps to specific files
6. **Success metrics defined** — measurable targets for each improvement

### Weaknesses of the Plan

1. **No eval baseline** — biggest gap. Optimizing without measurement
2. **Outdated D1 FTS5 assumption** — FTS5 now available, BM25 should be reconsidered
3. **Sequential expansion architecture** — latency budget breaks if not parallel
4. **Chunking effort overestimated** — heading split already exists
5. **Missing trigram+FTS5 hybrid strategy** — could combine for best of both
6. **No A/B testing strategy** — how to compare old vs new pipeline per-tenant?

---

### Risk Matrix (Updated)

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| No eval set → blind optimization | **Certain** | **High** | Build eval set first (Phase 0) |
| FTS5 migration complexity | Medium | Medium | Evaluate in isolation first, keep trigram as fallback |
| Query expansion latency | High | Medium | Parallel execution + KV cache + opt-in |
| Re-embedding batch load | Low | Low | Queue job during off-hours, ~4 min for 1K docs |
| D1 migration failure | Low | High | Test locally, backup, use `ALTER TABLE ADD COLUMN` |
| AI provider rate limits | Medium | Medium | Cache aggressively, exponential backoff |

---

## Unresolved Questions (Remaining)

1. **FTS5 + trigram coexistence:** Can both FTS5 virtual table and trigram D1 table exist simultaneously without performance overhead? Need to benchmark.
2. **Vectorize metadata limits:** Does Cloudflare Vectorize have a size limit on metadata per vector? Heading chains could be long.
3. **Multi-tenant expansion caching:** Should expansion cache be per-tenant or global? Same query in different tenants might need different expansions based on their document corpus.
4. **Queue priority:** Should re-embedding jobs have lower priority than real-time embed jobs for new documents?

---

## Sources

- [Cloudflare D1 SQL Statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/) — FTS5 confirmation
- [D1 Virtual Tables Community Thread](https://community.cloudflare.com/t/d1-support-for-virtual-tables/607277)
- [Workers AI Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) — $0.067/M tokens for embeddings
- [Salesforce Search Latency](https://engineering.salesforce.com/scaling-real-time-search-to-30-billion-queries-with-sub-second-latency-and-0-downtime/) — sub-second latency benchmarks
- [iPullRank: AI Query Expansion](https://ipullrank.com/expanding-queries-with-fanout) — Perplexity architecture analysis
- [Elastic Labs: Token Pruning](https://www.elastic.co/search-labs/blog/text-expansion-pruning) — 3-4x latency improvement
- [Weaviate: Retrieval Evaluation Metrics](https://weaviate.io/blog/retrieval-evaluation-metrics) — MRR, NDCG, Precision@K
- [Pinecone: Offline Evaluation](https://www.pinecone.io/learn/offline-evaluation/) — eval methodology
- [Fastest Search Stack Benchmark](https://www.wolk.work/blog/posts/a-quest-to-find-the-fastest-search-stack) — D1 FTS5 performance
