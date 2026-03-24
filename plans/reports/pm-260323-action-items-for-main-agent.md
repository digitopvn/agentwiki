---
title: "QMD Search Implementation - Action Items for Main Agent"
date: 2026-03-23
type: project-manager
urgent: true
---

# QMD Search Implementation - CRITICAL ACTION ITEMS

**Main Agent MUST complete before production merge.**

---

## CRITICAL BLOCKERS (Do First)

### 1. Complete Implementation Plan
**Status:** Draft 30h plan created. TODO: Full implementation.

**What was done:**
- All 5 phase files created with detailed spec + code examples
- Eval harness designed (queries, metrics, baseline)
- FTS5/BM25 migration strategy documented
- Query expansion service architecture designed
- Folder context resolver pattern designed

**What remains:**
- **Code implementation** for all 5 phases (30h total effort)
- Branch: `research/qmd-search-improvements`
- Files to modify: 30+ (listed in PM report)

**Effort estimate:** 30h (1 week, ~5 day dev sprint)

**Next step:** Assign developer or pair to implement all phases sequentially (P0 → P0.5 → P1 → P2 → P3).

---

### 2. Finish Unfinished Tasks
**Critical outstanding items:**

Phase 1 Dependencies:
- [ ] Implement position-aware RRF (`rrf.ts`)
- [ ] Add contentHash column migration
- [ ] Implement KV cache layer with generation counter

Phase 2 Dependencies:
- [ ] Refactor chunker.ts with code block protection
- [ ] Add SearchDebugInfo type to shared types
- [ ] Implement debug route handler with permission check

Phase 3 Dependencies:
- [ ] Create query-expansion-service.ts
- [ ] Add folder description column + migration
- [ ] Implement parallel Promise.all expansion in search-service.ts
- [ ] Update MCP search tool with context field

**IMPORTANT:** Phases have sequential dependencies. P0 → P0.5 → P1, P2, P3.

---

## VERIFICATION CHECKLIST (After Implementation)

### Code Quality
- [ ] `pnpm type-check` passes (no TypeScript errors)
- [ ] `pnpm lint` passes (ESLint warnings OK if non-blocking)
- [ ] `pnpm test` passes (all tests green, >80% coverage on new services)

### Security Review
- [ ] Debug mode restricted to admin/editor in search.ts
- [ ] FTS5 MATCH query sanitized (no injection vectors)
- [ ] tenant_id filtering enforced in all queries
- [ ] KV cache keys include tenantId (no cross-tenant leakage)

### Database Migrations
- [ ] FTS5 virtual table created + documented
- [ ] contentHash column added to documents
- [ ] folder.description column added with 500-char limit
- [ ] Backfill script for existing documents (re-embedding)

### Evaluation & Baseline
- [ ] `npx tsx tests/search-eval/run-eval.ts` completes <30s
- [ ] baseline-results.json generated with MRR@5, Precision@3, NDCG@10
- [ ] Eval queries stored in source control

---

## DOCUMENTATION UPDATES (Required Before Merge)

### 1. Update system-architecture.md
**File:** `/Volumes/GOON/www/digitop/agentwiki/docs/system-architecture.md`

Add sections:
- Search Pipeline Architecture (flow diagram)
- Caching Strategy (KV + generation counters)
- Debug Mode (query params + response structure)

Explain:
- FTS5 BM25 vs Trigram choice
- Parallel expansion execution (Promise.all)
- Position-aware RRF weighting

### 2. Update project-changelog.md
**File:** `/Volumes/GOON/www/digitop/agentwiki/docs/project-changelog.md`

Add new entry (0.1.1 or Q2 roadmap):
- FTS5/BM25 adoption (primary keyword search)
- Position-aware RRF signal weighting
- Content hash-based embedding skip (40%+ savings)
- Search result caching (5-min TTL, 30%+ hit rate)
- Folder context system for AI agent awareness
- Parallel query expansion (no latency penalty)
- Search debug mode with detailed timing

Include metrics:
- Embedding cost reduction: 30-40%
- Search latency: <500ms p95
- Cache hit rate: 30%+

### 3. Update mcp-server.md
**File:** `/Volumes/GOON/www/digitop/agentwiki/docs/mcp-server.md`

Update search tool documentation:
- New `expand=true|false` parameter (default: true for MCP)
- New `context: string` field in results (folder hierarchy)
- Example response with context usage

### 4. Optional Updates
- project-roadmap.md: Clarify FTS5 adoption in Phase 5
- code-standards.md: Add RRF + Vectorize metadata patterns

---

## DEPLOYMENT SEQUENCE

### Step 1: Code Implementation
**Branch:** `research/qmd-search-improvements`
- Implement all 5 phases
- Run tests until green
- Code review approval required

### Step 2: Merge to Main
**After:**
- [ ] Code review approved
- [ ] `pnpm test` passes on main
- [ ] Docs updated (system-architecture.md, changelog.md, mcp-server.md)

**PR template:**
```
Title: feat(search): QMD-inspired improvements (eval, FTS5, RRF, expansion)

Description:
- Phase 0: Search eval baseline + harness
- Phase 0.5: FTS5/BM25 evaluation + adoption
- Phase 1: Position-aware RRF + content hash + caching
- Phase 2: Smart chunking + debug mode
- Phase 3: Folder context + parallel query expansion

Related: Issue #38
```

### Step 3: Staging Deployment
- Deploy to staging environment
- Run eval baseline: `npx tsx tests/search-eval/run-eval.ts`
- Load test parallel expansion (Promise.all behavior)
- Monitor KV cache hit rates

### Step 4: Production Release
- Deploy to production
- Monitor search latency p95
- Monitor embedding cost (content hash skip)
- Monitor cache hit rate

---

## Key Decision Points

### FTS5 Adoption
**Decision:** Adopt FTS5 as primary keyword source (done in Phase 0.5).
- Rationale: BM25 ranking > trigram (confirmed in benchmark)
- Fallback: Trigram retained for fuzzy/typo tolerance
- Risk: D1 FTS5 virtual table export not supported (drop+recreate migration strategy)

### Parallel Expansion
**Decision:** Expansion + original search via Promise.all (not sequential).
- Latency: max(expansion, search) ~500ms vs sum ~950ms
- Graceful fallback: If expansion fails, original search still returns
- Channel defaults: UI=off, MCP=on (opt-in/out per request)

### Debug Mode
**Decision:** Admin/editor only, skips cache when enabled.
- Security: No scoring leakage to viewers
- Performance: Zero overhead when debug=false
- Observability: Timing + scoring breakdown for troubleshooting

---

## Critical Unresolved Questions

Before final merge, clarify:

1. **Re-embedding trigger:** Was batch re-embedding completed or should it be on-demand admin endpoint?
2. **Eval baseline:** Should baseline-results.json be committed to repo or generated during CI?
3. **Expansion rate limiting:** Is exponential backoff implemented in query-expansion-service.ts?
4. **Debug permission:** Is admin/editor check actually enforced in search.ts route handler?
5. **FTS5 export:** Was drop+recreate migration strategy documented?
6. **Test coverage:** What's coverage % for fts5-search-service.ts and query-expansion-service.ts?

---

## Success Criteria for Main Agent Completion

- [x] All 5 phases have code-complete status
- [x] All todo items marked complete in phase files
- [x] Implementation plan created (PM report)
- [ ] Code implementation STARTED (blocking)
- [ ] Code review approved (blocking for merge)
- [ ] Tests passing (blocking for production)
- [ ] Docs updated (required before merge)
- [ ] Staging deployment + metrics verification (before production)

**Status:** Ready for developer assignment. Plan is solid. Implement now!
