# Phase 3: AI API Routes & Service Layer

## Context
- Provider registry from Phase 2: `packages/api/src/ai/ai-provider-registry.ts`
- Existing routes pattern: `packages/api/src/routes/*.ts`
- Existing rate limiter: `packages/api/src/middleware/rate-limiter.ts`
- Existing queue handler: `packages/api/src/queue/handler.ts`
- Encryption util from Phase 1: `packages/api/src/utils/encryption.ts`

## Overview
- **Priority:** P1
- **Status:** Pending
- **Effort:** 10h
- AI service layer (business logic) + Hono routes + prompt builder. Handles settings CRUD, rate limiting, token tracking, SSE streaming.

## Key Insights
- Hono supports `c.stream()` for SSE responses — no extra dependencies
- Existing rate limiter uses KV — extend with AI-specific rate limits
- Settings management: admin-only CRUD, encrypted API keys
- ClaudeKit pattern: separate generate (slash commands) from transform (selection actions)

## Requirements

### Functional
- `POST /api/ai/generate` — slash command generation (SSE stream)
- `POST /api/ai/transform` — text transformation (SSE stream)
- `POST /api/ai/suggest` — RAG suggestions (JSON response)
- `GET /api/ai/settings` — list configured providers (admin)
- `PUT /api/ai/settings` — upsert provider config (admin)
- `DELETE /api/ai/settings/:providerId` — remove provider (admin)
- `GET /api/ai/usage` — usage statistics (admin)

### Non-Functional
- Rate limit: 15 requests/min per user for generate/transform
- SSE streaming with proper `Content-Type: text/event-stream`
- Token usage logged per request
- API keys masked in GET responses (`sk-****1234`)

## Architecture

```
packages/api/src/
├── ai/
│   ├── ai-service.ts           # Business logic: resolve provider, decrypt key, dispatch
│   └── ai-prompt-builder.ts    # Prompt templates for each command/action
├── routes/
│   └── ai.ts                   # Hono route definitions
└── index.ts                    # Register ai routes
```

### Request Flow

```
Client → POST /api/ai/generate
  → Auth Guard (JWT/API key)
  → Rate Limiter (KV: ai:{userId}, 15/min)
  → Route Handler
    → AI Service
      → Load tenant AI settings from D1
      → Decrypt API key (AES-256-GCM)
      → Build prompt (ai-prompt-builder)
      → Get provider adapter (registry)
      → Call provider.streamText()
      → Pipe ReadableStream as SSE
      → Log usage to ai_usage table
  → SSE Response (text/event-stream)
```

## Related Code Files

### Files to Create
- `packages/api/src/ai/ai-service.ts`
- `packages/api/src/ai/ai-prompt-builder.ts`
- `packages/api/src/routes/ai.ts`

### Files to Modify
- `packages/api/src/index.ts` — register AI routes

## Implementation Steps

### 1. Create prompt builder (`ai-prompt-builder.ts`)

Build system + user prompts for each command/action:

```typescript
// Generate commands
function buildGeneratePrompt(command, context, prompt?) {
  switch (command) {
    case 'write': return { system: 'You are a wiki content writer...', user: `Write about: ${prompt}\n\nContext:\n${context}` }
    case 'continue': return { system: 'Continue writing naturally...', user: `Continue from:\n${context}` }
    case 'summarize': return { system: 'Summarize concisely in 2-3 sentences...', user: context }
    case 'list': return { system: 'Generate a structured list...', user: `Topic: ${prompt}\n\nContext:\n${context}` }
    case 'explain': return { system: 'Explain simply and clearly...', user: context }
  }
}

// Transform actions
function buildTransformPrompt(action, selectedText, opts?) {
  switch (action) {
    case 'edit': return { system: 'Edit text per instruction. Output ONLY edited text.', user: `Instruction: ${opts.instruction}\n\nText:\n${selectedText}` }
    case 'shorter': return { system: 'Condense text while keeping meaning. Output ONLY condensed text.', user: selectedText }
    case 'longer': return { system: 'Expand with more detail. Output ONLY expanded text.', user: selectedText }
    case 'tone': return { system: `Rewrite in ${opts.tone} tone. Output ONLY rewritten text.`, user: selectedText }
    case 'translate': return { system: `Translate to ${opts.language}. Output ONLY translation.`, user: selectedText }
    case 'fix-grammar': return { system: 'Fix grammar and spelling. Output ONLY corrected text.', user: selectedText }
  }
}
```

Key prompt rules (from ClaudeKit patterns):
- Always include "Output ONLY the result. No filler."
- Detect input language, maintain same language unless translating
- Truncate context to 3000 chars max to avoid token waste

### 2. Create AI service (`ai-service.ts`)

```typescript
export class AIService {
  // Resolve active provider for tenant
  async getActiveProvider(env, tenantId): Promise<{ provider: AIProvider, apiKey: string, model: string }>

  // Generate text (slash commands)
  async generate(env, tenantId, userId, body: AIGenerateBody): Promise<ReadableStream>

  // Transform text (selection actions)
  async transform(env, tenantId, userId, body: AITransformBody): Promise<ReadableStream>

  // Smart suggestions (RAG)
  async suggest(env, tenantId, userId, body: AISuggestBody): Promise<string[]>

  // Settings CRUD
  async getSettings(env, tenantId): Promise<AIProviderSetting[]>
  async upsertSetting(env, tenantId, body): Promise<void>
  async deleteSetting(env, tenantId, providerId): Promise<void>

  // Usage stats
  async getUsage(env, tenantId, opts?): Promise<AIUsageRecord[]>

  // Internal: log usage
  private async logUsage(env, tenantId, userId, providerId, model, action, tokens): Promise<void>
}
```

### 3. Create routes (`routes/ai.ts`)

```typescript
const ai = new Hono<{ Bindings: Env }>()

// Require auth for all AI routes
ai.use('/*', authGuard)

// Generate (slash commands) — SSE stream
ai.post('/generate', async (c) => {
  // Validate body with aiGenerateSchema
  // Rate limit check (KV)
  // Call aiService.generate() → ReadableStream
  // Return SSE response
  return c.newResponse(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
})

// Transform (selection actions) — SSE stream
ai.post('/transform', async (c) => { /* similar to generate */ })

// Suggest (RAG) — JSON
ai.post('/suggest', async (c) => { /* returns JSON array */ })

// Settings (admin only)
ai.get('/settings', requirePermission('admin'), async (c) => { /* list providers, mask keys */ })
ai.put('/settings', requirePermission('admin'), async (c) => { /* upsert provider config */ })
ai.delete('/settings/:providerId', requirePermission('admin'), async (c) => { /* remove provider */ })

// Usage (admin only)
ai.get('/usage', requirePermission('admin'), async (c) => { /* return usage stats */ })
```

### 4. Register routes in `index.ts`

Add `app.route('/api/ai', ai)` to the main Hono app.

### 5. SSE streaming pattern

```typescript
// In route handler
const stream = await aiService.generate(env, tenantId, userId, body)

return new Response(stream.pipeThrough(new TransformStream({
  transform(chunk, controller) {
    // Wrap chunks in SSE format: "data: {text}\n\n"
    const text = new TextDecoder().decode(chunk)
    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ text })}\n\n`))
  },
  flush(controller) {
    controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
  }
})), {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  }
})
```

## Todo List

- [x] Create `ai-prompt-builder.ts` with generate + transform prompt templates
- [x] Create `ai-service.ts` with full business logic
- [x] Create `routes/ai.ts` with all 7 endpoints
- [x] Register `/api/ai` routes in `index.ts`
- [x] Test SSE streaming locally
- [x] Verify rate limiting works
- [x] Run `pnpm type-check`

## Success Criteria

- `POST /api/ai/generate` returns SSE stream with AI-generated text
- `POST /api/ai/transform` returns SSE stream with transformed text
- `PUT /api/ai/settings` stores encrypted API key
- `GET /api/ai/settings` returns masked keys
- Rate limiter blocks after 15 requests/min
- Token usage logged to `ai_usage` table
- `pnpm type-check` passes

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| SSE connection drops | Medium | Client reconnects, content already inserted |
| Provider returns 401/403 | Medium | Return clear error: "Invalid API key for {provider}" |
| Large context exceeds token limit | Medium | Truncate to 3000 chars in prompt builder |

## Security Considerations

- Auth guard on all routes (JWT or API key)
- Admin-only for settings and usage endpoints
- Rate limiting prevents abuse
- API keys decrypted per-request, never cached in memory
- Input validation via Zod before processing

## Next Steps

→ Phase 4: Editor AI Features (frontend consumes these endpoints)
→ Phase 5: Settings UI (frontend for settings/usage endpoints)
