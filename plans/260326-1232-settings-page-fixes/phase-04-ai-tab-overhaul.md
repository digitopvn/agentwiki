---
phase: 4
title: AI Tab Overhaul — Models + Drag Reorder
priority: high
status: completed
effort: L
---

# Phase 4: AI Tab Overhaul

## Context Links
- [plan.md](./plan.md)
- [Issue #57](https://github.com/digitopvn/agentwiki/issues/57)
- Frontend: `packages/web/src/components/settings/ai-settings-tab.tsx`
- Hooks: `packages/web/src/hooks/use-ai-settings.ts`
- Constants: `packages/shared/src/constants.ts` (AI_PROVIDERS)
- Types: `packages/shared/src/types/ai.ts`
- Backend: `packages/api/src/routes/ai.ts`
- DB: `packages/api/src/db/schema.ts` (aiSettings table)

## Overview

Two problems:
1. **Model lists outdated** — need updating to latest available models per provider
2. **No fallback order** — issue requests "draggable rows for fallback orders" so admins can set provider priority

## Key Insights

- Current layout: 2-col grid of provider cards — needs to become a sortable vertical list
- `ai_settings` table has no `priority`/`order` column — need DB migration
- `@dnd-kit/sortable` is lightweight (~12KB gzipped), accessible, React 19 compatible
- The AI service (`packages/api/src/ai/ai-service.ts`) likely already has fallback logic — need to read the `priority` field
- `AIProviderSetting` type needs a `priority: number` field

## Requirements

**Functional:**
- Update model lists to current versions for all 6 providers
- Display configured providers as a sortable vertical list (drag to reorder)
- Provider order determines AI fallback priority (1 = primary, 2 = first fallback, etc.)
- Drag handle on each row for reordering
- Save order persists to DB via `priority` column
- Unconfigured providers shown below configured ones (not draggable)

**Non-functional:**
- Smooth drag animations
- Accessible (keyboard reorder support via @dnd-kit)
- Mobile: touch-friendly drag handles

## Architecture

```
[Sortable Provider List]
  ├── [Configured providers — draggable, ordered by priority]
  │     ├── Provider row 1 (priority: 1) — drag handle + card content
  │     ├── Provider row 2 (priority: 2)
  │     └── ...
  └── [Unconfigured providers — static grid below]

Drag end → PATCH /api/ai/settings/order → update priority for each provider
```

### DB Schema Change

```sql
ALTER TABLE ai_settings ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;
```

### API Changes

- New endpoint: `PATCH /api/ai/settings/order` — accepts `{ order: { providerId: string, priority: number }[] }`
- Existing `PUT /api/ai/settings` — set `priority` on create/update (auto-assign next available)

## Related Code Files

**Modify:**
- `packages/shared/src/constants.ts` — update AI_PROVIDERS model lists
- `packages/shared/src/types/ai.ts` — add `priority` to `AIProviderSetting`
- `packages/web/src/components/settings/ai-settings-tab.tsx` — rewrite as sortable list
- `packages/web/src/hooks/use-ai-settings.ts` — add reorder mutation
- `packages/api/src/routes/ai.ts` — add order endpoint, update upsert to include priority
- `packages/api/src/db/schema.ts` — add `priority` column to `aiSettings`
- `packages/api/src/ai/ai-service.ts` — use priority for fallback selection

**Create:**
- `packages/api/src/db/migrations/XXXX_add_ai_priority.sql` — migration file

**Install:**
- `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` in `packages/web`

## Implementation Steps

### Step 1: Update Model Lists (constants.ts)

Research latest model IDs and update `AI_PROVIDERS`:
```ts
export const AI_PROVIDERS = {
  openai: { name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'gpt-4-turbo'] },
  anthropic: { name: 'Anthropic', models: ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-6'] },
  google: { name: 'Google Gemini', models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'] },
  openrouter: { name: 'OpenRouter', models: ['auto'] },
  minimax: { name: 'MiniMax', models: ['MiniMax-M1', 'MiniMax-T1'] },
  alibaba: { name: 'Alibaba', models: ['qwen-turbo', 'qwen-plus', 'qwen-max'] },
} as const
```
**Note:** Verify latest model IDs during implementation — some may have updated.

### Step 2: DB Migration

Generate Drizzle migration:
1. Add `priority` column to `aiSettings` in `schema.ts`
2. Run `pnpm -F @agentwiki/api db:generate`
3. Verify generated SQL

### Step 3: Update Types

Add `priority: number` to `AIProviderSetting` in `packages/shared/src/types/ai.ts`.

### Step 4: Backend — Order Endpoint

Add to `packages/api/src/routes/ai.ts`:
```ts
// Reorder AI provider priorities
aiRouter.patch('/settings/order', requireAdmin, async (c) => {
  const { order } = await c.req.json() // [{ providerId, priority }]
  // Validate + update each setting's priority
  return c.json({ ok: true })
})
```

Update `PUT /api/ai/settings` to auto-assign `priority` = max(existing) + 1 for new providers.

### Step 5: Frontend — Sortable List

1. Install `@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
2. Rewrite `ai-settings-tab.tsx`:
   - Split configured (have settings) vs unconfigured providers
   - Configured: `<SortableContext>` wrapping provider rows
   - Each row: drag handle (GripVertical icon) + provider name + model + enabled badge + expand/edit
   - `onDragEnd`: reorder array, call PATCH /settings/order
   - Unconfigured: show as cards below with "Configure" button
3. Keep ProviderCard content (API key, model, enabled) — show in expandable row or modal

### Step 6: AI Service Fallback

Update `packages/api/src/ai/ai-service.ts` to query providers ordered by `priority ASC` and try each enabled provider in order until one succeeds.

## Todo

- [x] Update AI_PROVIDERS model lists in constants.ts
- [x] Add `priority` column to aiSettings schema + generate migration
- [x] Add `priority` to AIProviderSetting type
- [x] Add PATCH /ai/settings/order backend endpoint
- [x] Update PUT /ai/settings to auto-assign priority
- [x] Install @dnd-kit packages
- [x] Rewrite AI settings tab as sortable list
- [x] Add reorder mutation to hooks
- [x] Update AI service fallback to use priority order

## Success Criteria

- Model dropdowns show current model IDs
- Configured providers displayed as draggable sorted list
- Drag-reorder persists and affects AI fallback order
- Provider config (API key, model, enable/disable) still works
- `pnpm type-check` passes

## Risk Assessment

- **Medium-High**: DB migration + new dependency + significant UI rewrite
- @dnd-kit is battle-tested — low risk for the drag library itself
- Migration risk: `priority` column default 0 means existing records all have same priority — need initialization logic
- Fallback: if drag breaks, providers still function (just no ordering)

## Security Considerations

- Order endpoint must be admin-only (same as existing AI settings)
- No new sensitive data exposure
