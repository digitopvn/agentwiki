# Phase 5: Settings & Usage Dashboard

## Context
- AI settings API from Phase 3: `GET/PUT/DELETE /api/ai/settings`, `GET /api/ai/usage`
- Existing settings route: `packages/web/src/routes/` (if exists)
- Existing stores: `packages/web/src/stores/app-store.ts`
- ClaudeKit reference: admin settings pattern

## Overview
- **Priority:** P2
- **Status:** Pending
- **Effort:** 6h
- Admin-only settings page for configuring AI providers (API keys, models, enable/disable) + usage statistics dashboard.

## Key Insights
- Only admin/owner role can access AI settings
- API keys must be masked in UI — show only last 4 chars
- Each provider is a card with toggle, key input, model selector
- Usage dashboard: simple table with filters (provider, date range)
- Can run in parallel with Phase 4 (no file conflicts)

## Requirements

### Functional
- Provider configuration cards (6 providers)
- API key input with masked display
- Model selector dropdown per provider
- Enable/disable toggle per provider
- Usage statistics table with basic filtering
- Delete provider configuration

### Non-Functional
- Responsive layout (cards stack on mobile)
- Admin-only access (redirect non-admins)
- Optimistic UI updates for toggle/delete
- TanStack Query for data fetching

## Architecture

```
packages/web/src/
├── components/settings/
│   ├── ai-settings.tsx              # NEW: main settings page
│   ├── ai-provider-card.tsx         # NEW: individual provider card
│   └── ai-usage-table.tsx           # NEW: usage statistics
├── hooks/
│   └── use-ai-settings.ts          # NEW: settings CRUD hooks
└── routes/
    └── settings.tsx                 # MODIFY: add AI settings tab
```

## Related Code Files

### Files to Create
- `packages/web/src/components/settings/ai-settings.tsx`
- `packages/web/src/components/settings/ai-provider-card.tsx`
- `packages/web/src/components/settings/ai-usage-table.tsx`
- `packages/web/src/hooks/use-ai-settings.ts`

### Files to Modify
- `packages/web/src/routes/settings.tsx` (or equivalent) — add AI tab

## Implementation Steps

### 1. Create settings hooks (`hooks/use-ai-settings.ts`)

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/api-client'

export function useAISettings() {
  return useQuery({
    queryKey: ['ai-settings'],
    queryFn: () => apiClient.get('/api/ai/settings').then(r => r.data),
  })
}

export function useUpdateAISetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => apiClient.put('/api/ai/settings', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-settings'] }),
  })
}

export function useDeleteAISetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (providerId) => apiClient.delete(`/api/ai/settings/${providerId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-settings'] }),
  })
}

export function useAIUsage(filters?) {
  return useQuery({
    queryKey: ['ai-usage', filters],
    queryFn: () => apiClient.get('/api/ai/usage', { params: filters }).then(r => r.data),
  })
}
```

### 2. Create provider card (`ai-provider-card.tsx`)

Each provider card displays:
- Provider name + logo/icon
- Enable/disable toggle
- API key input (password type, show last 4 chars when saved)
- Model selector dropdown (populated from `AI_PROVIDERS` constants)
- Save / Delete buttons
- Status indicator (configured/not configured)

```tsx
export function AIProviderCard({ provider, setting, onSave, onDelete }: Props) {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(setting?.defaultModel || provider.models[0])
  const [enabled, setEnabled] = useState(setting?.isEnabled ?? false)

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">{provider.name}</h3>
        <Toggle checked={enabled} onChange={setEnabled} />
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-sm text-neutral-500">API Key</label>
          <input
            type="password"
            placeholder={setting ? `****${setting.apiKey}` : 'Enter API key'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm text-neutral-500">Model</label>
          <select value={model} onChange={e => setModel(e.target.value)} className="w-full rounded border px-3 py-2 text-sm">
            {provider.models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onSave({ apiKey, model, enabled })} className="btn-primary">Save</button>
          {setting && <button onClick={onDelete} className="btn-danger">Remove</button>}
        </div>
      </div>
    </div>
  )
}
```

### 3. Create usage table (`ai-usage-table.tsx`)

Simple table showing:
- Date/time
- User (name/email)
- Provider
- Model
- Action (generate/transform/suggest/summarize)
- Input tokens / Output tokens

With filters: provider dropdown, date range picker (last 7d/30d/all).

### 4. Create settings page (`ai-settings.tsx`)

```tsx
export function AISettings() {
  const { data: settings, isLoading } = useAISettings()
  const updateSetting = useUpdateAISetting()
  const deleteSetting = useDeleteAISetting()

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">AI Providers</h2>
      <p className="text-sm text-neutral-500">Configure AI providers for your workspace. API keys are encrypted at rest.</p>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Object.entries(AI_PROVIDERS).map(([id, provider]) => (
          <AIProviderCard
            key={id}
            provider={provider}
            setting={settings?.find(s => s.providerId === id)}
            onSave={(data) => updateSetting.mutate({ providerId: id, ...data })}
            onDelete={() => deleteSetting.mutate(id)}
          />
        ))}
      </div>

      <h2 className="text-xl font-bold mt-8">Usage Statistics</h2>
      <AIUsageTable />
    </div>
  )
}
```

### 5. Integrate into settings route

Add "AI" tab to existing settings page navigation.

## Todo List

- [x] Create `use-ai-settings.ts` hooks
- [x] Create `ai-provider-card.tsx` component
- [x] Create `ai-usage-table.tsx` component
- [x] Create `ai-settings.tsx` page
- [x] Add AI tab to settings navigation
- [x] Test admin-only access
- [x] Test on mobile viewport
- [x] Run `pnpm type-check` and `pnpm build`

## Success Criteria

- Admin can add/edit/remove AI provider configurations
- API keys displayed as masked (`****1234`)
- Toggle enables/disables provider
- Usage table shows recent AI activity
- Non-admin users cannot access settings
- Responsive on mobile

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Settings page doesn't exist yet | Low | Create new route or add tab to existing |
| API key paste UX issues | Low | Use standard password input with show/hide toggle |

## Security Considerations

- Admin role check before rendering settings
- API keys sent only on save (POST/PUT), never fetched in plaintext
- CSRF protection via existing auth middleware
- No API keys in browser storage/cookies

## Next Steps

→ Phase 6: Auto-summarize upgrade & RAG suggestions
