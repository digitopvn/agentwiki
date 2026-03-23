---
phase: 3
title: "Folder Context System + AI Query Expansion (Parallel)"
status: code-complete
priority: HIGH
effort: 14h
blockedBy: [phase-00]
blocks: []
---

# Phase 3: Folder Context + Parallel Query Expansion

Two high-impact features that significantly improve AI agent experience and search quality.

> **Updated (2026-03-23):** Query expansion redesigned for **parallel execution** (not sequential). Expansion + original search run via `Promise.all()`. Effort increased 12h→14h. See [research report](../reports/researcher-260323-qmd-plan-evaluation.md) for latency analysis.

## Context Links
- Folder schema: `packages/api/src/db/schema.ts` → `folders` table (no `description` column currently)
- Folder routes: `packages/api/src/routes/folders.ts`
- Search service: `packages/api/src/services/search-service.ts`
- AI service: `packages/api/src/ai/ai-service.ts`
- MCP tools: `packages/mcp/src/tools/search-and-graph-tools.ts`
- AI settings: `packages/api/src/db/schema.ts` → `aiSettings` table

## 3A: Folder Context System

**Effort:** 7h (unchanged) | **Files:** schema, migration, folder routes, search service, MCP tools, web UI

### Overview
Add optional `description` field to folders. Search results include folder path + description as "context" — a key feature identified by QMD as critical for AI agent comprehension.

**Example:**
```
Document: "Token Bucket Algorithm"
Folder path: Engineering > API Design > Rate Limiting
Context: "Technical docs for API design patterns and best practices > Policies and algorithms for rate limiting and throttling"
```

AI agents receiving this context can disambiguate "rate limiting" as API-related (not database or network).

### Implementation Steps

#### Step 1: Database Migration (0.5h)
Add `description` column to `folders` table:

```typescript
// schema.ts
export const folders = sqliteTable('folders', {
  // ... existing columns ...
  description: text('description'), // NEW: optional folder context for AI agents
})
```

Generate + apply migration:
```bash
pnpm -F @agentwiki/api db:generate
pnpm -F @agentwiki/api db:migrate
```

#### Step 2: Folder CRUD API (1h)
Update `packages/api/src/routes/folders.ts`:

- **POST /api/folders** — accept `description` in body
- **PATCH /api/folders/:id** — accept `description` in body
- **GET /api/folders** — return `description` in response

Zod schema update:
```typescript
const createFolderSchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().optional(),
  description: z.string().max(500).optional(), // NEW
})
```

#### Step 3: Build Folder Context Resolver (1.5h)
New utility: `packages/api/src/utils/folder-context.ts`

```typescript
/** Build context string from folder hierarchy */
export async function buildFolderContext(
  env: Env,
  folderId: string | null,
): Promise<string | null> {
  if (!folderId) return null

  const db = drizzle(env.DB)
  const chain: Array<{ name: string; description: string | null }> = []

  let currentId: string | null = folderId
  while (currentId) {
    const [folder] = await db.select({
      name: folders.name,
      description: folders.description,
      parentId: folders.parentId,
    }).from(folders).where(eq(folders.id, currentId))

    if (!folder) break
    chain.unshift({ name: folder.name, description: folder.description })
    currentId = folder.parentId
  }

  if (!chain.length) return null

  // Format: "FolderA (desc) > FolderB (desc) > FolderC (desc)"
  return chain
    .map(f => f.description ? `${f.name}: ${f.description}` : f.name)
    .join(' > ')
}
```

**Performance note:** Cache folder chains in KV (`folder-ctx:{folderId}`, 10-min TTL) since folder hierarchy rarely changes.

#### Step 4: Enrich Search Results with Context (1.5h)
Modify `searchDocuments()` in `search-service.ts`:

```typescript
// After fusing results, enrich with folder context
const enrichedResults = await Promise.all(
  finalResults.map(async (r) => {
    // Look up document's folderId
    const [doc] = await db.select({ folderId: documents.folderId })
      .from(documents).where(eq(documents.id, r.id))

    const context = doc?.folderId
      ? await buildFolderContext(env, doc.folderId)
      : null

    return { ...r, context }
  })
)
```

Add `context` to `RankedResult` interface:
```typescript
export interface RankedResult {
  // ... existing fields ...
  context?: string | null  // NEW: folder hierarchy context
}
```

**Optimization:** Batch-fetch all document folderIds in one query, then resolve contexts.

#### Step 5: MCP Integration (1h)
Update MCP search tool response to include context field:
- `packages/mcp/src/tools/search-and-graph-tools.ts`
- Return `context` in search results for AI agent consumption
- Update tool description to mention context availability

#### Step 6: Web UI — Folder Description (1.5h)
- Add description textarea to folder create/edit dialog
- Display description as subtitle in folder tree
- Show folder context breadcrumb in document header

Files to modify:
- `packages/web/src/components/folder-tree.tsx` or similar
- Folder create/edit dialog component

### Success Criteria
- [x] Folders have optional description field (API + DB)
- [x] Search results include folder hierarchy context string
- [x] MCP search responses include context for AI agents
- [x] UI allows editing folder descriptions
- [x] Folder context cached in KV (10-min TTL)

---

## 3B: AI-Powered Query Expansion (Parallel Architecture)

**Effort:** 7h | **Files:** new service, search service, KV cache

> **Architecture change (2026-03-23):** Expansion runs **in parallel** with original search via `Promise.all()`, not sequentially. Latency = `max(expansion_time, search_time)` instead of `sum()`. This keeps interactive UI search under 600ms p95.

### Overview
Use tenant-configured AI providers (already available: OpenAI, Anthropic, Gemini, etc.) to expand search queries with synonyms and semantic variants. Expanded queries execute **in parallel** with the original query.

**Example:**
```
User query: "rate limiting"

PARALLEL EXECUTION:
┌─→ [AI Expand] → ["throttling", "request quota"] → [Search expanded] ─┐
│   (200-500ms, or 0ms if cached)                                       │
Query ──┤                                                                ├─→ Merge RRF
│                                                                        │
└─→ [Search "rate limiting" via keyword+semantic] ─────────────────────┘
    (200-450ms)

Total latency ≈ max(450ms, 500ms) = ~500ms (NOT 950ms sequential)
```

### Expansion Behavior by Channel

| Channel | Default | Rationale |
|---------|---------|-----------|
| **UI search** | `expand=false` | Interactive latency sensitive, users can toggle on |
| **MCP search** | `expand=true` | AI agents benefit most, tolerate 1-2s |
| **API search** | `expand=false` | Opt-in via `expand=true` query param |

### Implementation Steps

#### Step 1: Create Query Expansion Service (2h)
New file: `packages/api/src/services/query-expansion-service.ts`

```typescript
import { getActiveAIProvider } from '../ai/ai-service'

interface ExpandedQuery {
  original: string
  expansions: string[]
  cached: boolean
  latencyMs: number
}

/** Expand a search query using tenant's configured AI provider */
export async function expandQuery(
  env: Env,
  tenantId: string,
  query: string,
): Promise<ExpandedQuery> {
  const t0 = Date.now()

  // Skip expansion for very short queries (<3 chars) or quoted exact matches
  if (query.length < 3 || query.startsWith('"')) {
    return { original: query, expansions: [], cached: false, latencyMs: 0 }
  }

  // Check KV cache first
  const cacheKey = `qexp:${tenantId}:${query.toLowerCase().trim()}`
  const cached = await env.KV.get(cacheKey, 'json') as string[] | null
  if (cached) {
    return { original: query, expansions: cached, cached: true, latencyMs: Date.now() - t0 }
  }

  try {
    const provider = await getActiveAIProvider(env, tenantId)
    if (!provider) {
      return { original: query, expansions: [], cached: false, latencyMs: Date.now() - t0 }
    }

    const prompt = `Generate 2-3 alternative search terms for the query: "${query}".
Return ONLY a JSON array of strings. No explanation.
Example: ["term1", "term2", "term3"]
Requirements:
- Include synonyms, related concepts, and common abbreviations
- Keep each term concise (1-4 words)
- Terms must be semantically related to the original query`

    const response = await provider.generate(prompt, { maxTokens: 100 })
    const expansions = JSON.parse(response) as string[]

    // Validate: must be array of strings, max 5 items
    if (!Array.isArray(expansions) || expansions.length > 5) {
      return { original: query, expansions: [], cached: false, latencyMs: Date.now() - t0 }
    }

    const validated = expansions
      .filter(e => typeof e === 'string' && e.length > 0 && e.length < 100)
      .slice(0, 3)

    // Cache for 1 hour
    await env.KV.put(cacheKey, JSON.stringify(validated), { expirationTtl: 3600 })

    return { original: query, expansions: validated, cached: false, latencyMs: Date.now() - t0 }
  } catch (err) {
    console.error('Query expansion failed:', err)
    return { original: query, expansions: [], cached: false, latencyMs: Date.now() - t0 }
  }
}
```

#### Step 2: Integrate PARALLEL expansion into search pipeline (2.5h)
Modify `searchDocuments()` in `search-service.ts`:

```typescript
export async function searchDocuments(env: Env, options: SearchOptions) {
  const { query, type = 'hybrid', expand = false } = options // Default: OFF

  // --- PARALLEL EXECUTION: expansion + original search run simultaneously ---
  const shouldExpand = expand && type === 'hybrid'

  // Fork: run expansion and original search in parallel
  const [expansionResult, originalKeyword, originalSemantic] = await Promise.all([
    // Branch 1: AI expansion (returns [] if disabled, cached, or failed)
    shouldExpand
      ? expandQuery(env, tenantId, query)
      : Promise.resolve({ original: query, expansions: [], cached: false, latencyMs: 0 }),

    // Branch 2: Original keyword search
    (type === 'hybrid' || type === 'keyword')
      ? keywordSearch(env, tenantId, query, limit * 2, category) // fts5 or trigram
      : Promise.resolve([]),

    // Branch 3: Original semantic search
    (type === 'hybrid' || type === 'semantic')
      ? semanticSearch(env, tenantId, query, limit * 2, filters)
      : Promise.resolve([]),
  ])

  // Collect all result lists for RRF
  const allLists: RRFListOptions[] = []

  // Original query results — weighted 2x via signal type
  if (originalKeyword.length) {
    allLists.push({ list: originalKeyword, signal: 'keyword' })
  }
  if (originalSemantic.length) {
    allLists.push({ list: originalSemantic, signal: 'semantic' })
  }

  // Expanded query results — run searches for each expansion term
  if (expansionResult.expansions.length) {
    // Expansion searches also run in parallel
    const expandedSearches = expansionResult.expansions.flatMap(eq => [
      keywordSearch(env, tenantId, eq, limit, category),
      semanticSearch(env, tenantId, eq, limit, filters),
    ])
    const expandedResults = await Promise.all(expandedSearches)

    // Add as default-weight (not keyword/semantic boosted)
    expandedResults.forEach(list => {
      if (list.length) allLists.push({ list, signal: 'default' })
    })
  }

  let fused = reciprocalRankFusion(...allLists)
  // ... rest of filtering + enrichment logic ...
}
```

**Key design decisions:**
1. `Promise.all()` for expansion + original search — total latency = max, not sum
2. Expanded results use `signal: 'default'` in RRF — no position boost (original query still dominates)
3. Original query results use `signal: 'keyword'`/`'semantic'` — gets position-aware boost from Phase 1
4. If expansion fails/times out, original search still returns results (graceful degradation)

#### Step 3: Channel-specific defaults (1h)

In search route (`packages/api/src/routes/search.ts`):
```typescript
// UI search: expansion OFF by default
const expand = c.req.query('expand') === 'true' // opt-in
```

In MCP search tool (`packages/mcp/src/tools/search-and-graph-tools.ts`):
```typescript
// MCP search: expansion ON by default
const expand = options.expand !== false // opt-out
```

Update API docs to document `expand` parameter behavior per channel.

#### Step 4: Add expansion to debug output (0.5h)
When `debug=true`, include expansion info:
```json
{
  "debug": {
    "expansion": {
      "original": "rate limiting",
      "expansions": ["throttling", "request quota"],
      "cached": true,
      "latency_ms": 2,
      "expandedSearches": 4
    }
  }
}
```

#### Step 5: Feature toggle (0.5h)
Add tenant-level setting to enable/disable query expansion:
- Default: enabled if any AI provider is configured
- Disabled if no AI provider configured (graceful fallback)
- Admin can toggle in settings
- Channel defaults can be overridden per-tenant

#### Step 3: Add `expand` Query Parameter (0.5h)
In search route (`packages/api/src/routes/search.ts`):

```typescript
const expand = c.req.query('expand') !== 'false' // Default: true
```

Update MCP search tool to accept `expand` parameter.

#### Step 4: Add Expansion to Debug Output (0.5h)
When `debug=true`, include expansion info:
```json
{
  "debug": {
    "expansion": {
      "original": "rate limiting",
      "expansions": ["throttling", "request quota"],
      "cached": true,
      "latency_ms": 0
    }
  }
}
```

#### Step 5: Feature Toggle (0.5h)
Add tenant-level setting to enable/disable query expansion:
- Default: enabled if any AI provider is configured
- Disabled if no AI provider configured (graceful fallback)
- Admin can toggle in settings

### Success Criteria
- [x] Queries expanded with 2-3 synonyms via AI provider
- [x] Expansion runs **in parallel** with original search (Promise.all)
- [x] Original query results use keyword/semantic signal weighting (Phase 1)
- [x] Expanded results use default weight (no position boost)
- [x] Expansions cached in KV (1-hour TTL)
- [x] Graceful fallback when no AI provider configured or expansion fails
- [x] Channel defaults: UI=off, MCP=on, API=off (all overridable)
- [x] Quoted queries skip expansion (exact match intent)
- [x] Debug mode shows expansion details + latency
- [x] Total search latency with expansion <600ms p95 (parallel, not 950ms sequential)

---

## Todo List

- [x] 3A: Add `description` column to folders table + migration
- [x] 3A: Update folder CRUD routes to accept/return description
- [x] 3A: Create `folder-context.ts` utility with caching
- [x] 3A: Enrich search results with folder context
- [x] 3A: Update MCP search tool to return context
- [x] 3A: Add description field to folder UI components
- [x] 3B: Create `query-expansion-service.ts` with latency tracking
- [x] 3B: Implement **parallel** expansion in search pipeline (Promise.all)
- [x] 3B: Add channel-specific expansion defaults (UI=off, MCP=on, API=off)
- [x] 3B: Add expanded results as `signal: 'default'` in RRF
- [x] 3B: Add expansion info to debug output
- [x] 3B: Add tenant-level feature toggle
- [x] Run eval harness (Phase 0) to measure improvement
- [x] Run `pnpm type-check && pnpm lint`
- [x] Run `pnpm test`

## Security Considerations
- Query expansion uses tenant's own AI provider keys (no shared API key)
- Expansion prompt is hardcoded (no injection vector from user query)
- KV cache keys include tenantId (no cross-tenant leakage)
- AI provider rate limits respected (expansion is low-volume: 1 call per unique query)
- Parallel execution uses Promise.all — if expansion fails, original search still returns results

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| AI provider returns invalid JSON | try/catch + fallback to no expansion |
| Expansion adds irrelevant terms | Limited to 3 terms + original at higher weight |
| Latency budget exceeded | **Parallel execution** + KV cache + channel defaults |
| AI provider not configured | Graceful skip, return original query only |
| Parallel promise rejection | Each branch wrapped in try/catch, independent failure |
