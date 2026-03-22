---
phase: 3
title: "Folder Context System + AI Query Expansion"
status: pending
priority: HIGH
effort: 12h
---

# Phase 3: Folder Context + Query Expansion

Two high-impact features that significantly improve AI agent experience and search quality.

## Context Links
- Folder schema: `packages/api/src/db/schema.ts` → `folders` table (no `description` column currently)
- Folder routes: `packages/api/src/routes/folders.ts`
- Search service: `packages/api/src/services/search-service.ts`
- AI service: `packages/api/src/ai/ai-service.ts`
- MCP tools: `packages/mcp/src/tools/search-and-graph-tools.ts`
- AI settings: `packages/api/src/db/schema.ts` → `aiSettings` table

## 3A: Folder Context System

**Effort:** 7h | **Files:** schema, migration, folder routes, search service, MCP tools, web UI

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
- [ ] Folders have optional description field (API + DB)
- [ ] Search results include folder hierarchy context string
- [ ] MCP search responses include context for AI agents
- [ ] UI allows editing folder descriptions
- [ ] Folder context cached in KV (10-min TTL)

---

## 3B: AI-Powered Query Expansion

**Effort:** 5h | **Files:** new service, search service, KV cache

### Overview
Use tenant-configured AI providers (already available: OpenAI, Anthropic, Gemini, etc.) to expand search queries with synonyms and semantic variants before executing search.

**Example:**
```
User query: "rate limiting"
AI expansion: ["rate limiting", "throttling", "request quota", "API rate control"]
→ Run 4 queries through keyword + semantic pipeline
→ Fuse all results with original query weighted 2x
```

### Implementation Steps

#### Step 1: Create Query Expansion Service (2h)
New file: `packages/api/src/services/query-expansion-service.ts`

```typescript
import { getActiveAIProvider } from '../ai/ai-service'

interface ExpandedQuery {
  original: string
  expansions: string[]
  cached: boolean
}

/** Expand a search query using tenant's configured AI provider */
export async function expandQuery(
  env: Env,
  tenantId: string,
  query: string,
): Promise<ExpandedQuery> {
  // Skip expansion for very short queries (<3 chars) or quoted exact matches
  if (query.length < 3 || query.startsWith('"')) {
    return { original: query, expansions: [], cached: false }
  }

  // Check KV cache first
  const cacheKey = `qexp:${tenantId}:${query.toLowerCase().trim()}`
  const cached = await env.KV.get(cacheKey, 'json') as string[] | null
  if (cached) {
    return { original: query, expansions: cached, cached: true }
  }

  try {
    const provider = await getActiveAIProvider(env, tenantId)
    if (!provider) {
      return { original: query, expansions: [], cached: false }
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
      return { original: query, expansions: [], cached: false }
    }

    const validated = expansions
      .filter(e => typeof e === 'string' && e.length > 0 && e.length < 100)
      .slice(0, 3)

    // Cache for 1 hour
    await env.KV.put(cacheKey, JSON.stringify(validated), { expirationTtl: 3600 })

    return { original: query, expansions: validated, cached: false }
  } catch (err) {
    console.error('Query expansion failed:', err)
    return { original: query, expansions: [], cached: false }
  }
}
```

#### Step 2: Integrate into Search Pipeline (1.5h)
Modify `searchDocuments()` in `search-service.ts`:

```typescript
export async function searchDocuments(env: Env, options: SearchOptions) {
  const { query, type = 'hybrid', expand = true } = options

  // Query expansion (only for hybrid mode, can be disabled)
  let queries = [query]
  let expansionInfo: ExpandedQuery | null = null

  if (expand && type === 'hybrid') {
    expansionInfo = await expandQuery(env, tenantId, query)
    if (expansionInfo.expansions.length) {
      queries = [query, ...expansionInfo.expansions]
    }
  }

  // Run all queries through keyword + semantic
  const allResults: RankedResult[][] = []

  for (const q of queries) {
    const isOriginal = q === query
    const weight = isOriginal ? 2 : 1 // Original query weighted 2x

    if (type === 'hybrid' || type === 'keyword') {
      const kw = await trigramSearch(env, tenantId, q, limit * 2, category)
      // Weight by duplicating in RRF input (simple but effective)
      allResults.push(kw)
      if (isOriginal) allResults.push(kw) // 2x weight for original
    }
    if (type === 'hybrid' || type === 'semantic') {
      const sem = await semanticSearch(env, tenantId, q, limit * 2, filters)
      allResults.push(sem)
      if (isOriginal) allResults.push(sem) // 2x weight for original
    }
  }

  let fused = reciprocalRankFusion(...allResults)
  // ... rest of filtering logic ...
}
```

**Latency concern:** Expansion adds ~200-500ms (AI API call). Mitigated by:
- KV cache (1-hour TTL, most queries are repeated)
- Only applies to hybrid mode
- `expand=false` query param to disable
- Expansion runs before search, not in parallel (simpler, sequential)

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
- [ ] Queries expanded with 2-3 synonyms via AI provider
- [ ] Original query weighted 2x in RRF fusion
- [ ] Expansions cached in KV (1-hour TTL)
- [ ] Graceful fallback when no AI provider configured
- [ ] `expand=false` disables expansion
- [ ] Quoted queries skip expansion (exact match intent)
- [ ] Debug mode shows expansion details

---

## Todo List

- [ ] 3A: Add `description` column to folders table + migration
- [ ] 3A: Update folder CRUD routes to accept/return description
- [ ] 3A: Create `folder-context.ts` utility with caching
- [ ] 3A: Enrich search results with folder context
- [ ] 3A: Update MCP search tool to return context
- [ ] 3A: Add description field to folder UI components
- [ ] 3B: Create `query-expansion-service.ts`
- [ ] 3B: Integrate expansion into search pipeline
- [ ] 3B: Add `expand` query param to search route + MCP
- [ ] 3B: Add expansion info to debug output
- [ ] 3B: Add tenant-level feature toggle
- [ ] Run `pnpm type-check && pnpm lint`
- [ ] Run `pnpm test`

## Security Considerations
- Query expansion uses tenant's own AI provider keys (no shared API key)
- Expansion prompt is hardcoded (no injection vector from user query)
- KV cache keys include tenantId (no cross-tenant leakage)
- AI provider rate limits respected (expansion is low-volume: 1 call per unique query)

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| AI provider returns invalid JSON | try/catch + fallback to no expansion |
| Expansion adds irrelevant terms | Limited to 3 terms + original weighted 2x |
| Latency budget exceeded | KV cache + `expand=false` toggle |
| AI provider not configured | Graceful skip, return original query only |
