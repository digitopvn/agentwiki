# Phase 2: Provider Adapters

## Context
- AI types from Phase 1: `packages/shared/src/types/ai.ts`
- Provider research: `plans/reports/researcher-260319-2047-ai-providers-sdk-comparison.md`
- ClaudeKit reference: `D:/www/digitop/claudekit/claudekit-web/lib/claude.ts`

## Overview
- **Priority:** P1
- **Status:** Pending
- **Effort:** 8h
- 6 provider adapters implementing common `AIProvider` interface. Each ~60-80 LOC. All use `fetch()` directly (no SDKs) for Cloudflare Workers compatibility.

## Key Insights
- All providers support SSE streaming via `text/event-stream`
- OpenRouter + Alibaba DashScope are OpenAI-compatible — share adapter base
- MiniMax has unique API format — needs custom parsing
- Anthropic uses different auth header (`x-api-key` vs `Authorization: Bearer`)
- No npm SDKs needed — raw `fetch()` works on Workers and avoids bundle bloat

## Requirements

### Functional
- Common `AIProvider` interface with `generateText()` and `streamText()`
- Registry to resolve provider by ID
- Each adapter handles auth, request format, response parsing, token counting
- Streaming returns `ReadableStream` for SSE forwarding

### Non-Functional
- Each adapter file under 100 LOC
- Zero external dependencies (only `fetch`)
- Graceful error handling with provider-specific error messages

## Architecture

```
packages/api/src/ai/
├── ai-provider-interface.ts    # Interface + types (NEW)
├── ai-provider-registry.ts     # Registry pattern (NEW)
└── providers/
    ├── openai-adapter.ts       # OpenAI Chat Completions
    ├── anthropic-adapter.ts    # Anthropic Messages API
    ├── google-adapter.ts       # Google Gemini generateContent
    ├── openrouter-adapter.ts   # OpenRouter (OpenAI-compatible)
    ├── minimax-adapter.ts      # MiniMax chatcompletion_v2
    └── alibaba-adapter.ts      # Alibaba DashScope (OpenAI-compatible)
```

### Provider API Details

| Provider | Endpoint | Auth Header | Stream Format |
|----------|----------|-------------|---------------|
| OpenAI | `api.openai.com/v1/chat/completions` | `Authorization: Bearer {key}` | SSE `data: {json}` |
| Anthropic | `api.anthropic.com/v1/messages` | `x-api-key: {key}` + `anthropic-version: 2023-06-01` | SSE `data: {json}` |
| Google | `generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent` | `x-goog-api-key: {key}` | JSON stream (newline-delimited) |
| OpenRouter | `openrouter.ai/api/v1/chat/completions` | `Authorization: Bearer {key}` | SSE (OpenAI format) |
| MiniMax | `api.minimax.chat/v1/text/chatcompletion_v2` | `Authorization: Bearer {key}` | SSE `data: {json}` |
| Alibaba | `dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` | `Authorization: Bearer {key}` | SSE (OpenAI format) |

## Related Code Files

### Files to Create
- `packages/api/src/ai/ai-provider-interface.ts`
- `packages/api/src/ai/ai-provider-registry.ts`
- `packages/api/src/ai/providers/openai-adapter.ts`
- `packages/api/src/ai/providers/anthropic-adapter.ts`
- `packages/api/src/ai/providers/google-adapter.ts`
- `packages/api/src/ai/providers/openrouter-adapter.ts`
- `packages/api/src/ai/providers/minimax-adapter.ts`
- `packages/api/src/ai/providers/alibaba-adapter.ts`

## Implementation Steps

### 1. Create provider interface (`ai-provider-interface.ts`)

```typescript
import type { AIRequest, AIResponse, AIMessage } from '@agentwiki/shared'

export interface AIProvider {
  readonly id: string
  readonly name: string
  generateText(apiKey: string, req: AIRequest): Promise<AIResponse>
  streamText(apiKey: string, req: AIRequest): Promise<ReadableStream>
}

// Helper: parse SSE stream into text chunks
export function parseSSEStream(
  response: Response,
  extractContent: (data: unknown) => string | null,
): ReadableStream {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) { controller.close(); return }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') { controller.close(); return }
        try {
          const parsed = JSON.parse(data)
          const content = extractContent(parsed)
          if (content) controller.enqueue(new TextEncoder().encode(content))
        } catch { /* skip malformed chunks */ }
      }
    },
  })
}
```

### 2. Create registry (`ai-provider-registry.ts`)

```typescript
import type { AIProvider } from './ai-provider-interface'
import type { AIProviderId } from '@agentwiki/shared'
import { OpenAIAdapter } from './providers/openai-adapter'
import { AnthropicAdapter } from './providers/anthropic-adapter'
import { GoogleAdapter } from './providers/google-adapter'
import { OpenRouterAdapter } from './providers/openrouter-adapter'
import { MiniMaxAdapter } from './providers/minimax-adapter'
import { AlibabaAdapter } from './providers/alibaba-adapter'

const providers: Record<AIProviderId, AIProvider> = {
  openai: new OpenAIAdapter(),
  anthropic: new AnthropicAdapter(),
  google: new GoogleAdapter(),
  openrouter: new OpenRouterAdapter(),
  minimax: new MiniMaxAdapter(),
  alibaba: new AlibabaAdapter(),
}

export function getProvider(id: AIProviderId): AIProvider {
  const provider = providers[id]
  if (!provider) throw new Error(`Unknown AI provider: ${id}`)
  return provider
}
```

### 3. Implement OpenAI adapter (`providers/openai-adapter.ts`)

Standard OpenAI Chat Completions format. Extract content from `choices[0].delta.content` for streaming, `choices[0].message.content` for non-streaming.

### 4. Implement Anthropic adapter (`providers/anthropic-adapter.ts`)

Uses different request format (`messages` + `max_tokens` at top level). Auth via `x-api-key` header. Extract from `content[0].text` (non-stream) or `content_block_delta.delta.text` (stream).

### 5. Implement Google adapter (`providers/google-adapter.ts`)

Uses `generateContent` endpoint with `contents[].parts[].text` format. Streaming via `streamGenerateContent?alt=sse`. Different response shape: `candidates[0].content.parts[0].text`.

### 6. Implement OpenRouter adapter (`providers/openrouter-adapter.ts`)

Extends OpenAI format — same request/response shape, different base URL. Add `HTTP-Referer` and `X-Title` headers per OpenRouter docs.

### 7. Implement MiniMax adapter (`providers/minimax-adapter.ts`)

Uses `/v1/text/chatcompletion_v2` with `model`, `messages` format. Response: `choices[0].message.content`. Streaming: standard SSE.

### 8. Implement Alibaba adapter (`providers/alibaba-adapter.ts`)

DashScope compatible mode = OpenAI format. Base URL: `dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`. Same parsing as OpenAI.

## Todo List

- [x] Create `ai-provider-interface.ts` with interface + SSE parser helper
- [x] Create `ai-provider-registry.ts`
- [x] Implement `openai-adapter.ts`
- [x] Implement `anthropic-adapter.ts`
- [x] Implement `google-adapter.ts`
- [x] Implement `openrouter-adapter.ts`
- [x] Implement `minimax-adapter.ts`
- [x] Implement `alibaba-adapter.ts`
- [x] Run `pnpm type-check`

## Success Criteria

- All 6 adapters implement `AIProvider` interface
- `getProvider('openai').generateText(key, req)` returns `AIResponse`
- `getProvider('anthropic').streamText(key, req)` returns `ReadableStream`
- SSE parser correctly handles `[DONE]` sentinel and malformed chunks
- `pnpm type-check` passes

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| MiniMax API format changes | Medium | Adapter is isolated, easy to fix |
| Google streaming differs from SSE | Medium | Use `alt=sse` param for standard SSE format |
| Rate limits from providers | Low | Our own rate limiting (Phase 3) prevents abuse |

## Security Considerations

- API keys passed as function params, never stored in adapter state
- No API keys in logs — error messages omit key values
- Each adapter validates response status before parsing

## Next Steps

→ Phase 3: AI API Routes & Service Layer (uses registry to dispatch requests)
