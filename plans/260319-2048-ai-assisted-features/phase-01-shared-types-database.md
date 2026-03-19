# Phase 1: Shared Types & Database Schema

## Context
- Brainstorm: `plans/reports/brainstorm-260319-2048-ai-assisted-features.md`
- Existing schema: `packages/api/src/db/schema.ts` (155 LOC, 13 tables)
- Existing shared types: `packages/shared/src/types/`, `packages/shared/src/schemas/`
- Existing crypto: `packages/api/src/utils/crypto.ts` (no AES-256-GCM yet)

## Overview
- **Priority:** P1 (foundation for all other phases)
- **Status:** Pending
- **Effort:** 4h
- Foundation layer: shared types, Zod schemas, DB migration, encryption utility for API keys

## Key Insights
- `documents.summary` field already exists — no schema change needed for auto-summarize
- Existing crypto.ts has HMAC/PBKDF2 but no symmetric encryption — need AES-256-GCM for provider API keys
- Cloudflare Workers support Web Crypto API including AES-GCM
- D1 SQLite doesn't support JSON column type natively — use `text` with `mode: 'json'`

## Requirements

### Functional
- Shared TypeScript types for AI providers, requests, responses
- Zod validation schemas for AI API endpoints
- 2 new DB tables: `ai_settings`, `ai_usage`
- AES-256-GCM encrypt/decrypt for storing provider API keys

### Non-Functional
- Types importable from `@agentwiki/shared`
- Schema compatible with Drizzle ORM patterns
- Encryption key stored as Workers secret (env var)

## Architecture

```
packages/shared/src/
├── types/ai.ts          # AI provider types, request/response interfaces
├── schemas/ai.ts        # Zod schemas for AI endpoints
├── constants.ts         # Add AI provider IDs, model lists, action types
└── index.ts             # Re-export new types

packages/api/src/
├── db/schema.ts         # Add ai_settings, ai_usage tables
├── utils/encryption.ts  # AES-256-GCM encrypt/decrypt (NEW)
└── env.ts               # Add AI_ENCRYPTION_KEY binding
```

## Related Code Files

### Files to Create
- `packages/shared/src/types/ai.ts` — AI types
- `packages/shared/src/schemas/ai.ts` — Zod schemas
- `packages/api/src/utils/encryption.ts` — AES-256-GCM

### Files to Modify
- `packages/shared/src/constants.ts` — add AI constants
- `packages/shared/src/index.ts` — re-export AI types/schemas
- `packages/api/src/db/schema.ts` — add 2 tables
- `packages/api/src/env.ts` — add `AI_ENCRYPTION_KEY`

## Implementation Steps

### 1. Create shared AI types (`packages/shared/src/types/ai.ts`)

```typescript
// Provider identifiers
export type AIProviderId = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'minimax' | 'alibaba'

// AI action types
export type AIAction = 'generate' | 'transform' | 'suggest' | 'summarize'
export type AIGenerateCommand = 'write' | 'continue' | 'summarize' | 'list' | 'explain'
export type AITransformAction = 'edit' | 'shorter' | 'longer' | 'tone' | 'translate' | 'fix-grammar'
export type AITone = 'professional' | 'casual' | 'formal' | 'friendly'

// Request/Response interfaces
export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIRequest {
  providerId: AIProviderId
  model: string
  messages: AIMessage[]
  maxTokens: number
  temperature?: number
  stream?: boolean
}

export interface AIResponse {
  content: string
  model: string
  tokensUsed: { input: number; output: number }
}

// Generate endpoint request body
export interface AIGenerateBody {
  command: AIGenerateCommand
  context: string        // surrounding editor content
  prompt?: string        // user's custom prompt (for /ai-write)
  documentId: string
}

// Transform endpoint request body
export interface AITransformBody {
  action: AITransformAction
  selectedText: string
  context?: string       // surrounding content for better results
  tone?: AITone          // required when action='tone'
  language?: string      // required when action='translate'
  instruction?: string   // required when action='edit' (free-form)
  documentId: string
}

// Suggest endpoint request body
export interface AISuggestBody {
  context: string
  documentId: string
  maxSuggestions?: number
}

// Settings types
export interface AIProviderSetting {
  id: string
  providerId: AIProviderId
  apiKey: string         // masked in responses
  defaultModel: string
  isEnabled: boolean
}

// Usage record
export interface AIUsageRecord {
  providerId: AIProviderId
  model: string
  action: AIAction
  inputTokens: number
  outputTokens: number
  createdAt: string
}
```

### 2. Create Zod schemas (`packages/shared/src/schemas/ai.ts`)

```typescript
import { z } from 'zod'

export const aiGenerateSchema = z.object({
  command: z.enum(['write', 'continue', 'summarize', 'list', 'explain']),
  context: z.string().max(10000),
  prompt: z.string().max(2000).optional(),
  documentId: z.string(),
})

export const aiTransformSchema = z.object({
  action: z.enum(['edit', 'shorter', 'longer', 'tone', 'translate', 'fix-grammar']),
  selectedText: z.string().min(1).max(10000),
  context: z.string().max(5000).optional(),
  tone: z.enum(['professional', 'casual', 'formal', 'friendly']).optional(),
  language: z.string().max(50).optional(),
  instruction: z.string().max(500).optional(),
  documentId: z.string(),
})

export const aiSuggestSchema = z.object({
  context: z.string().max(10000),
  documentId: z.string(),
  maxSuggestions: z.number().min(1).max(5).default(3),
})

export const aiSettingsUpdateSchema = z.object({
  providerId: z.enum(['openai', 'anthropic', 'google', 'openrouter', 'minimax', 'alibaba']),
  apiKey: z.string().min(1).max(500),
  defaultModel: z.string().min(1).max(100),
  isEnabled: z.boolean(),
})
```

### 3. Add AI constants to `packages/shared/src/constants.ts`

```typescript
export const AI_PROVIDERS = {
  openai: { name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  anthropic: { name: 'Anthropic', models: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'] },
  google: { name: 'Google Gemini', models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro'] },
  openrouter: { name: 'OpenRouter', models: ['auto'] }, // OpenRouter auto-routes
  minimax: { name: 'MiniMax', models: ['MiniMax-M1', 'MiniMax-T1'] },
  alibaba: { name: 'Alibaba', models: ['qwen-turbo', 'qwen-plus', 'qwen-max'] },
} as const

export const AI_RATE_LIMIT = { maxRequests: 15, intervalMs: 60_000 } // 15 req/min
```

### 4. Add DB tables to `packages/api/src/db/schema.ts`

```typescript
/** AI provider settings per tenant */
export const aiSettings = sqliteTable('ai_settings', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  providerId: text('provider_id').notNull(), // openai | anthropic | google | openrouter | minimax | alibaba
  encryptedApiKey: text('encrypted_api_key').notNull(), // AES-256-GCM encrypted
  defaultModel: text('default_model').notNull(),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

/** AI usage tracking */
export const aiUsage = sqliteTable('ai_usage', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  userId: text('user_id').notNull().references(() => users.id),
  providerId: text('provider_id').notNull(),
  model: text('model').notNull(),
  action: text('action').notNull(), // generate | transform | suggest | summarize
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})
```

### 5. Create encryption utility (`packages/api/src/utils/encryption.ts`)

```typescript
/** AES-256-GCM encryption for storing provider API keys */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

async function getAesKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode('agentwiki-ai-keys'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encrypt(plaintext: string, secret: string): Promise<string> {
  const key = await getAesKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, encoder.encode(plaintext)
  )
  // Combine IV + ciphertext, encode as base64
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return btoa(String.fromCharCode(...combined))
}

export async function decrypt(encoded: string, secret: string): Promise<string> {
  const key = await getAesKey(secret)
  const combined = Uint8Array.from(atob(encoded), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, key, ciphertext
  )
  return decoder.decode(plaintext)
}
```

### 6. Update `packages/api/src/env.ts`

Add `AI_ENCRYPTION_KEY: string` to Env type.

### 7. Generate migration

```bash
pnpm -F @agentwiki/api db:generate
```

### 8. Re-export from shared index

Update `packages/shared/src/index.ts` to export AI types, schemas, constants.

## Todo List

- [x] Create `packages/shared/src/types/ai.ts`
- [x] Create `packages/shared/src/schemas/ai.ts`
- [x] Add AI constants to `packages/shared/src/constants.ts`
- [x] Update `packages/shared/src/index.ts` re-exports
- [x] Add `aiSettings` + `aiUsage` tables to schema.ts
- [x] Create `packages/api/src/utils/encryption.ts`
- [x] Update `packages/api/src/env.ts` with `AI_ENCRYPTION_KEY`
- [x] Generate Drizzle migration
- [x] Run `pnpm type-check` to verify

## Success Criteria

- All new types importable from `@agentwiki/shared`
- Zod schemas validate correctly
- DB migration generates and applies without errors
- Encryption round-trip test: `decrypt(encrypt(text)) === text`
- `pnpm type-check` passes across all packages

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| schema.ts exceeds 200 LOC | Low | Add 2 tables (~20 LOC) → ~175 total, still under limit |
| AES-GCM not available in Workers | None | Web Crypto AES-GCM fully supported on Workers |
| D1 migration conflicts | Low | Generate fresh migration, test locally first |

## Security Considerations

- API keys encrypted at rest with AES-256-GCM
- Encryption key stored as Workers secret (not in code)
- Keys never returned in plaintext from API (masked: `sk-****1234`)
- PBKDF2 key derivation prevents raw secret as encryption key

## Next Steps

→ Phase 2: Provider Adapters (uses types and encryption from this phase)
