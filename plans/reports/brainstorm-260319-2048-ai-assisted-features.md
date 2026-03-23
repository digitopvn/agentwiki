# Brainstorm: AI-Assisted Features (#23)

**Date:** 2026-03-19
**Issue:** https://github.com/digitopvn/agentwiki/issues/23
**Status:** Approved → Creating plan

---

## Problem Statement

AgentWiki needs AI-assisted writing features: slash commands, selection toolbar (edit/shorten/lengthen/tone/translate), multi-provider support (6 providers), auto-summarize, and smart suggestions (RAG).

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | Workers Paid | 30s CPU limit sufficient for AI API calls |
| API Keys | Platform (admin/tenant) | Centralized cost control, simpler UX |
| Providers | All 6 from day 1 | User requirement |
| Frontend | Full custom, no AI SDK | Zero dependencies, full control, MIT-compatible |
| Backend | Custom provider adapters | Each ~60 LOC, common interface |
| Extra | Auto-summarize + RAG suggestions | Leverages existing Vectorize + Queue infrastructure |

## Architecture

### Provider Abstraction

```typescript
interface AIProvider {
  id: string;
  name: string;
  generateText(req: AIRequest): Promise<AIResponse>;
  streamText(req: AIRequest): ReadableStream;
}
```

6 adapters: OpenAI, Anthropic, Google Gemini, OpenRouter, MiniMax, Alibaba (DashScope)

### New DB Tables

- `ai_settings` — per-tenant provider configs (encrypted API keys)
- `ai_usage` — token tracking per user/provider/action

### API Routes

| Route | Purpose |
|-------|---------|
| `POST /api/ai/generate` | Slash command generation (SSE stream) |
| `POST /api/ai/transform` | Selection transformation (SSE stream) |
| `POST /api/ai/suggest` | RAG smart suggestions |
| `GET/PUT /api/ai/settings` | Provider configuration |
| `GET /api/ai/usage` | Usage statistics |

### Frontend Components

**Slash Commands:** /ai-write, /ai-continue, /ai-summarize, /ai-list, /ai-explain
**Selection Toolbar:** Edit with AI, shorter, longer, tone, translate, fix grammar
**Settings Page:** Provider cards, API key management, model selection, usage dashboard

### Auto-summarize

Queue `AI_SUMMARIZE` job on document save → AI generates excerpt + summary → stored in documents table.

### Smart Suggestions (RAG)

Query Vectorize for related docs → inject context → AI generates contextual suggestions.

## File Structure

```
packages/api/src/ai/
├── ai-provider-interface.ts
├── ai-provider-registry.ts
├── ai-service.ts
├── ai-prompt-builder.ts
└── providers/ (6 adapter files)
packages/api/src/routes/ai.ts
packages/web/src/components/editor/ai-slash-commands.ts
packages/web/src/components/editor/ai-selection-toolbar.tsx
packages/web/src/components/settings/ai-settings.tsx
packages/web/src/hooks/use-ai.ts
packages/shared/src/ai-types.ts
packages/shared/src/ai-constants.ts
```

## Security

- API keys encrypted at rest (AES-256-GCM)
- Rate limiting 15 req/min per user (KV-backed)
- Admin-only settings access
- Token usage tracking
- Keys never exposed to frontend

## Risks

| Risk | Mitigation |
|------|-----------|
| Workers timeout | SSE streaming, no CPU blocking |
| MiniMax/Alibaba instability | Graceful fallback, retry |
| API key leakage | Encrypt at rest, masked in UI |
| Cost explosion | Rate limits + usage tracking + alerts |

## References

- ClaudeKit-Web: AI generation/transformation endpoints, AISelectionToolbar, BlockNote integration patterns
- BlockNote APIs: SuggestionMenuController (slash), FormattingToolbar (selection), insertBlocks/replaceBlocks (content)
- Provider SDKs: OpenAI, Anthropic, Google have official JS SDKs; OpenRouter is OpenAI-compatible; MiniMax/Alibaba use REST

## Unresolved Questions

1. MiniMax has no official npm SDK — REST-only adapter may lack streaming support?
2. Alibaba DashScope PAYG rates not documented — only fixed monthly tiers visible
3. Should auto-summarize use the tenant's configured provider or a hardcoded cheap model?
