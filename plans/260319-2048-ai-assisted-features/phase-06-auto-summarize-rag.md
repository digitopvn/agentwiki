# Phase 6: Auto-Summarize Upgrade & RAG Smart Suggestions

## Context
- Existing queue handler: `packages/api/src/queue/handler.ts` (uses Workers AI Llama 3.1 8B)
- Existing embedding service: `packages/api/src/services/embedding-service.ts`
- Existing search service: `packages/api/src/services/search-service.ts` (hybrid FTS + Vectorize)
- AI service from Phase 3: `packages/api/src/ai/ai-service.ts`
- Provider registry from Phase 2: `packages/api/src/ai/ai-provider-registry.ts`
- `documents.summary` field already exists in schema

## Overview
- **Priority:** P2
- **Status:** Pending
- **Effort:** 6h
- Upgrade auto-summarize to use tenant's configured AI provider (instead of hardcoded Workers AI). Add RAG-powered smart suggestions that query Vectorize for related docs and inject context into AI prompts.

## Key Insights
- Queue handler currently uses `@cf/meta/llama-3.1-8b-instruct` hardcoded — upgrade to use tenant's preferred provider
- Vectorize already stores document embeddings — perfect for RAG context retrieval
- Search service already has `semanticSearch()` — reuse for finding related docs
- Need fallback to Workers AI if tenant has no AI provider configured
- `POST /api/ai/suggest` endpoint already defined in Phase 3 — implement the RAG logic here

## Requirements

### Functional
- Auto-summarize uses tenant's configured AI provider when available
- Falls back to Workers AI (Llama 3.1) when no provider configured
- RAG suggestions: query Vectorize → retrieve top-k related doc chunks → inject into AI prompt → return suggestions
- Suggestions endpoint returns 1-3 contextual writing suggestions

### Non-Functional
- Summarize job completes within 30s (Workers CPU limit)
- RAG retrieval: top 5 similar chunks, max 2000 chars context
- No duplicate embeddings — reuse existing embedding pipeline

## Architecture

```
POST /api/ai/suggest (from Phase 3 route)
  → Get document context from request
  → Query Vectorize for similar chunks (existing embedding-service)
  → Retrieve full text of top-k related documents from D1
  → Build RAG prompt with related context
  → Call AI provider (tenant's configured or default)
  → Return suggestions as JSON array

Queue: generate-summary (upgraded)
  → Load tenant's AI settings from D1
  → If provider configured → call provider.generateText()
  → If no provider → fall back to Workers AI (existing behavior)
  → Update documents.summary
```

## Related Code Files

### Files to Modify
- `packages/api/src/queue/handler.ts` — upgrade `generateSummary` to use tenant provider
- `packages/api/src/ai/ai-service.ts` — implement `suggest()` method with RAG logic

### Files to Create
- None (all logic goes into existing files)

## Implementation Steps

### 1. Upgrade queue handler `generateSummary`

```typescript
// In handler.ts - modify generateSummary:
async function generateSummary(env: Env, documentId: string, tenantId: string) {
  const db = drizzle(env.DB)
  const doc = await db.select(/* ... */)
  if (!doc.length || !doc[0].content) return

  const truncated = doc[0].content.slice(0, 3000)

  // Try tenant's configured provider first
  const aiService = new AIService()
  try {
    const result = await aiService.generateSummaryWithProvider(env, tenantId, doc[0].title, truncated)
    if (result) {
      await db.update(documents).set({ summary: result }).where(eq(documents.id, documentId))
      await embedDocumentJob(env, documentId, tenantId)
      return
    }
  } catch (err) {
    console.warn('AI provider summary failed, falling back to Workers AI:', err)
  }

  // Fallback: Workers AI (existing behavior)
  const result = await (env.AI as Ai).run('@cf/meta/llama-3.1-8b-instruct' as never, { /* existing code */ })
  if (result.response) {
    await db.update(documents).set({ summary: result.response.trim() }).where(eq(documents.id, documentId))
  }
  await embedDocumentJob(env, documentId, tenantId)
}
```

### 2. Add `generateSummaryWithProvider` to AI service

```typescript
// In ai-service.ts
async generateSummaryWithProvider(env: Env, tenantId: string, title: string, content: string): Promise<string | null> {
  const { provider, apiKey, model } = await this.getActiveProvider(env, tenantId)
  if (!provider) return null // no provider configured

  const response = await provider.generateText(apiKey, {
    model,
    messages: [
      { role: 'system', content: 'Summarize in 1-2 concise sentences. Detect and match the document language. Output ONLY the summary.' },
      { role: 'user', content: `Title: ${title}\n\n${content}` },
    ],
    maxTokens: 150,
  })

  return response.content || null
}
```

### 3. Implement RAG suggest logic in AI service

```typescript
// In ai-service.ts - implement suggest() method
async suggest(env: Env, tenantId: string, userId: string, body: AISuggestBody): Promise<string[]> {
  // Step 1: Get embedding for current context
  const contextEmbedding = await this.getEmbedding(env, body.context)

  // Step 2: Query Vectorize for similar document chunks
  const similarChunks = await env.VECTORIZE.query(contextEmbedding, {
    topK: 5,
    filter: { tenantId },
    returnMetadata: true,
  })

  // Step 3: Retrieve related document content from D1
  const relatedContext = await this.fetchRelatedContent(env, similarChunks, body.documentId)

  // Step 4: Build RAG prompt
  const { provider, apiKey, model } = await this.getActiveProvider(env, tenantId)
  if (!provider) throw new Error('No AI provider configured')

  const response = await provider.generateText(apiKey, {
    model,
    messages: [
      {
        role: 'system',
        content: `You are a wiki writing assistant. Based on the user's current context and related documents from the same wiki, suggest ${body.maxSuggestions || 3} short writing continuations or related topics to explore. Return as a JSON array of strings. Each suggestion should be 1-2 sentences.`
      },
      {
        role: 'user',
        content: `Current context:\n${body.context.slice(0, 2000)}\n\nRelated wiki content:\n${relatedContext.slice(0, 2000)}`
      },
    ],
    maxTokens: 500,
  })

  // Parse JSON array from response
  try {
    return JSON.parse(response.content)
  } catch {
    return [response.content] // fallback: return as single suggestion
  }
}

// Helper: get embedding via Workers AI
private async getEmbedding(env: Env, text: string): Promise<number[]> {
  const result = await (env.AI as Ai).run('@cf/baai/bge-base-en-v1.5' as never, {
    text: [text.slice(0, 512)],
  } as never) as { data: number[][] }
  return result.data[0]
}

// Helper: fetch related doc content
private async fetchRelatedContent(env: Env, matches: VectorizeMatches, excludeDocId: string): Promise<string> {
  const docIds = matches.matches
    .filter(m => m.metadata?.documentId !== excludeDocId)
    .map(m => m.metadata?.documentId)
    .filter(Boolean)

  if (!docIds.length) return ''

  const db = drizzle(env.DB)
  const docs = await db
    .select({ title: documents.title, content: documents.content })
    .from(documents)
    .where(inArray(documents.id, docIds as string[]))
    .limit(3)

  return docs.map(d => `## ${d.title}\n${d.content?.slice(0, 500)}`).join('\n\n')
}
```

### 4. Log usage for summarize and suggest actions

Both auto-summarize and suggest should log to `ai_usage` table with action `'summarize'` and `'suggest'` respectively.

## Todo List

- [x] Upgrade `generateSummary` in queue handler to use tenant provider
- [x] Add `generateSummaryWithProvider` to AI service
- [x] Implement `suggest()` method with RAG logic in AI service
- [x] Add embedding helper for context vectorization
- [x] Add related content fetcher from Vectorize matches
- [x] Log usage for both actions
- [x] Test summarize with provider configured
- [x] Test summarize fallback to Workers AI
- [x] Test suggest with related documents
- [x] Run `pnpm type-check`

## Success Criteria

- Document save triggers summarize using tenant's AI provider
- When no provider configured, falls back to Workers AI (no regression)
- `/api/ai/suggest` returns 1-3 relevant writing suggestions
- Suggestions reference related wiki content (verifiable by checking output)
- Usage logged for both summarize and suggest actions

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| AI provider call in queue exceeds 30s | Medium | Use fast/cheap model for summaries; truncate content to 3000 chars |
| Vectorize returns irrelevant results | Low | Filter by tenantId, exclude current doc, rank by similarity |
| No related docs for new wikis | Low | Return empty suggestions gracefully |
| JSON parse failure on suggestions | Low | Fallback: return raw response as single suggestion |

## Security Considerations

- Queue handler runs in trusted context — no user input validation needed
- Suggest endpoint validates via auth guard + Zod schema
- Related doc fetching respects tenant isolation (Vectorize filter)
- No cross-tenant data leakage in RAG context

## Next Steps

→ All phases complete. Run integration tests, deploy, update docs.
