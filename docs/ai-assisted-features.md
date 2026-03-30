# AI-Assisted Features

Multi-provider AI writing assistant integrated into AgentWiki's BlockNote editor. Supports 6 AI providers, slash commands, selection toolbar, auto-summarize, and RAG-powered suggestions.

## Overview

```
┌─────────────────────────────────────────────────┐
│              BlockNote Editor                     │
│  ┌──────────┐  ┌───────────────────┐            │
│  │ Slash     │  │ Selection Toolbar │            │
│  │ Commands  │  │ (AI transforms)   │            │
│  └─────┬────┘  └────────┬──────────┘            │
└────────┼────────────────┼───────────────────────┘
         │ SSE Stream     │ SSE Stream
┌────────▼────────────────▼───────────────────────┐
│              API Layer (Hono)                     │
│  POST /api/ai/generate  POST /api/ai/transform   │
│  POST /api/ai/suggest   GET/PUT /api/ai/settings │
│  ┌──────────────────────────────────────┐       │
│  │          AI Service Layer            │       │
│  │  Prompt Builder → Provider Registry  │       │
│  └──────────────┬───────────────────────┘       │
│                 │                                 │
│  ┌──────────────▼───────────────────────┐       │
│  │       6 Provider Adapters            │       │
│  │ OpenAI │ Anthropic │ Gemini          │       │
│  │ OpenRouter │ MiniMax │ Alibaba       │       │
│  └──────────────────────────────────────┘       │
└─────────────────────────────────────────────────┘
```

## Supported Providers

| Provider | Models | Auth | Streaming |
|----------|--------|------|-----------|
| **OpenAI** | gpt-4o, gpt-4o-mini, gpt-4-turbo | Bearer token | SSE |
| **Anthropic** | claude-sonnet-4, claude-haiku-4.5 | x-api-key header | SSE |
| **Google Gemini** | gemini-2.0-flash, gemini-1.5-pro | API key in URL | SSE (alt=sse) |
| **OpenRouter** | auto (routes to best model) | Bearer token | SSE |
| **MiniMax** | MiniMax-M1, MiniMax-T1 | Bearer token | SSE |
| **Alibaba** | qwen-turbo, qwen-plus, qwen-max | Bearer token (DashScope) | SSE |

All adapters use raw `fetch()` — no external SDKs. Each adapter implements the `AIProvider` interface with `generateText()` and `streamText()` methods.

## Editor Features

### Slash Commands

Type `/` in the editor to see AI commands alongside default BlockNote items:

| Command | Description | Requires Prompt |
|---------|-------------|-----------------|
| `/ai-write` | Write content about a topic | Yes — topic prompt |
| `/ai-continue` | Continue writing from cursor | No — uses preceding content |
| `/ai-summarize` | Summarize the document | No — uses full document |
| `/ai-list` | Generate a structured list | Yes — topic prompt |
| `/ai-explain` | Explain content simply | No — uses surrounding content |

Generated text is inserted as new blocks after the current cursor position.

### Selection Toolbar

Select text in the editor to see AI transformation buttons in the formatting toolbar:

| Action | Effect |
|--------|--------|
| **Edit with AI** | Free-form edit instruction (prompt input) |
| **Shorter** | Condense text, keep meaning |
| **Longer** | Expand with more detail |
| **Tone** | Rewrite in professional/casual/formal/friendly tone |
| **Translate** | Translate to English, Vietnamese, Chinese, Japanese, Spanish, French, German, Korean |
| **Fix Grammar** | Correct grammar, spelling, punctuation |

Selected text is replaced with the AI-generated result.

## API Endpoints

All endpoints require authentication (JWT or API key). Generate/transform endpoints use SSE streaming.

### Generate (Slash Commands)

```
POST /api/ai/generate
Content-Type: application/json

{
  "command": "write" | "continue" | "summarize" | "list" | "explain",
  "context": "surrounding editor content (max 10000 chars)",
  "prompt": "optional topic for write/list commands",
  "documentId": "doc-id"
}

Response: text/event-stream
data: {"text": "chunk of generated text"}
data: {"text": "more text..."}
data: [DONE]
```

### Transform (Selection Actions)

```
POST /api/ai/transform
Content-Type: application/json

{
  "action": "edit" | "shorter" | "longer" | "tone" | "translate" | "fix-grammar",
  "selectedText": "text to transform (max 10000 chars)",
  "tone": "professional",       // required for action=tone
  "language": "Vietnamese",     // required for action=translate
  "instruction": "make formal", // required for action=edit
  "documentId": "doc-id"
}

Response: text/event-stream (same format as generate)
```

### Suggest (RAG)

```
POST /api/ai/suggest
Content-Type: application/json

{
  "context": "current document content",
  "documentId": "doc-id",
  "maxSuggestions": 3
}

Response: application/json
{
  "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"]
}
```

### Settings (Admin Only)

```
GET    /api/ai/settings              → { settings: AIProviderSetting[] }
PUT    /api/ai/settings              → { success: true }
DELETE /api/ai/settings/:providerId  → { success: true }
GET    /api/ai/usage                 → { usage: AIUsageRecord[] }
```

## Configuration

### Setting Up Providers

1. Navigate to **Settings → AI** tab (admin only)
2. For each provider you want to enable:
   - Enter the API key (encrypted at rest with AES-256-GCM)
   - Select the default model
   - Toggle "Enabled"
   - Click **Save**
3. The first enabled provider is used for AI operations

### Environment Variables

Add to `wrangler.toml` or Workers secrets:

```
AI_ENCRYPTION_KEY = "your-secret-key-for-encrypting-api-keys"
```

This key is used by PBKDF2 → AES-256-GCM to encrypt/decrypt provider API keys stored in D1.

## Database Schema

### ai_settings

Stores per-tenant AI provider configurations with encrypted API keys.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | Unique ID |
| tenant_id | TEXT FK | Tenant reference |
| provider_id | TEXT | openai, anthropic, google, openrouter, minimax, alibaba |
| encrypted_api_key | TEXT | AES-256-GCM encrypted API key |
| default_model | TEXT | Selected model for this provider |
| is_enabled | BOOLEAN | Whether provider is active |
| created_at | TIMESTAMP | Creation time |
| updated_at | TIMESTAMP | Last update time |

### ai_usage

Tracks token consumption per user, provider, and action.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | Unique ID |
| tenant_id | TEXT FK | Tenant reference |
| user_id | TEXT FK | User who made the request |
| provider_id | TEXT | Provider used |
| model | TEXT | Model used |
| action | TEXT | generate, transform, suggest, summarize |
| input_tokens | INTEGER | Input token count |
| output_tokens | INTEGER | Output token count |
| created_at | TIMESTAMP | Request time |

## Auto-Summarize

When a document is saved, a queue job generates an AI summary:

1. Queue handler receives `generate-summary` message
2. Checks if tenant has a configured AI provider
3. **If provider configured** → uses tenant's provider + model
4. **If no provider** → falls back to Workers AI (Llama 3.1 8B)
5. Summary stored in `documents.summary` field
6. Embedding job triggered afterward

## Smart Suggestions (RAG)

The suggest endpoint uses Retrieval-Augmented Generation:

1. Embed current document context via Workers AI (bge-base-en)
2. Query Vectorize for top 5 similar document chunks (filtered by tenant)
3. Fetch related document content from D1 (exclude current doc)
4. Build prompt with current context + related wiki content
5. AI generates 1-3 contextual writing suggestions

## Security

- **API key encryption**: AES-256-GCM with PBKDF2-derived key, random IV per encryption
- **Rate limiting**: 15 requests/min per user (KV-backed)
- **Admin-only settings**: Only tenant admins can configure providers or view usage
- **Keys never exposed**: API keys returned as `••••••••` in GET responses
- **Tenant isolation**: All queries scoped by tenant ID
- **Audit logging**: Usage tracked in `ai_usage` table

## File Structure

```
packages/api/src/ai/
├── ai-provider-interface.ts    # AIProvider interface + SSE parser
├── ai-provider-registry.ts     # Registry resolves provider by ID
├── ai-service.ts               # Business logic (generate, transform, suggest, settings)
├── ai-prompt-builder.ts        # System + user prompt templates
└── providers/
    ├── openai-adapter.ts       # ~70 LOC
    ├── anthropic-adapter.ts    # ~80 LOC
    ├── google-adapter.ts       # ~80 LOC
    ├── openrouter-adapter.ts   # ~70 LOC
    ├── minimax-adapter.ts      # ~65 LOC
    └── alibaba-adapter.ts      # ~65 LOC

packages/api/src/routes/ai.ts              # Hono routes (7 endpoints)
packages/api/src/utils/encryption.ts       # AES-256-GCM encrypt/decrypt

packages/shared/src/types/ai.ts            # TypeScript types
packages/shared/src/schemas/ai.ts          # Zod validation schemas
packages/shared/src/constants.ts           # AI_PROVIDERS, AI_RATE_LIMIT

packages/web/src/lib/ai-stream-reader.ts   # SSE consumer
packages/web/src/hooks/use-ai.ts           # Generate/transform hook
packages/web/src/hooks/use-ai-settings.ts  # Settings CRUD hooks
packages/web/src/components/editor/
├── ai-slash-commands.ts                   # 5 slash menu items
└── ai-selection-toolbar.tsx               # 6 transform actions
packages/web/src/components/settings/
└── ai-settings-tab.tsx                    # Provider cards + usage table
```

## Adding a New Provider

To add a new AI provider:

1. Create `packages/api/src/ai/providers/new-provider-adapter.ts` implementing `AIProvider`:
   ```typescript
   export class NewProviderAdapter implements AIProvider {
     readonly id = 'new-provider'
     readonly name = 'New Provider'
     async generateText(apiKey, req) { /* ... */ }
     async streamText(apiKey, req) { /* ... */ }
   }
   ```
2. Register in `ai-provider-registry.ts`
3. Add provider ID to `AIProviderId` type in `packages/shared/src/types/ai.ts`
4. Add to `AI_PROVIDERS` constant in `packages/shared/src/constants.ts`
5. Add to Zod enum in `packages/shared/src/schemas/ai.ts`
