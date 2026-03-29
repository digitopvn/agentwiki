---
phase: 3
title: API Keys Tab Full CRUD
priority: high
status: completed
effort: M
---

# Phase 3: API Keys Tab Full CRUD

## Context Links
- [plan.md](./plan.md)
- [Issue #57](https://github.com/digitopvn/agentwiki/issues/57)
- Frontend: `packages/web/src/routes/settings.tsx` (ApiKeysTab, lines 172-220)
- Backend: `packages/api/src/routes/api-keys.ts` (POST already exists!)
- Schema: `packages/shared/src/schemas/auth.ts` (`createApiKeySchema`)
- DB: `packages/api/src/db/schema.ts` (apiKeys table)

## Overview

API Keys tab only shows list + revoke. The **backend `POST /api/keys`** already exists and works. The frontend simply has no create UI. Need to add a create form and show the generated key once (it can never be retrieved again since only hash is stored).

## Key Insights

- `POST /api/keys` expects: `{ name: string, scopes: string[], expiresInDays?: number }`
- Response returns full key ONCE: `{ id, key, name, keyPrefix }` — must display prominently
- Key is hashed server-side (PBKDF2) — cannot be recovered after creation
- Available scopes from constants: `doc:create`, `doc:read`, `doc:update`, `doc:delete`, `doc:search`, `doc:share`
- `createApiKeySchema` validates name (1-100), scopes (min 1), expiresInDays (1-365 optional)

## Requirements

**Functional:**
- "Create API Key" button opens inline form
- Form fields: name (text), scopes (checkboxes), expiry (optional number input)
- On create: show generated key in prominent copyable display
- Key display has copy button + warning "This key won't be shown again"
- After dismissal: key appears in list with prefix only
- Existing list + revoke preserved

**Non-functional:**
- Form validation: name required, at least 1 scope
- Copy to clipboard via `navigator.clipboard.writeText()`

## Architecture

```
[Create Form]  →  POST /api/keys  →  returns { id, key, name }
                                   →  Show key ONCE in modal/banner
                                   →  User copies key
                                   →  Dismiss → key in list
```

## Related Code Files

**Modify:**
- `packages/web/src/routes/settings.tsx` — extract ApiKeysTab, add create form

**Create:**
- `packages/web/src/components/settings/api-keys-tab.tsx` — extracted component

**Read for context:**
- `packages/api/src/routes/api-keys.ts`
- `packages/api/src/services/api-key-service.ts`
- `packages/shared/src/schemas/auth.ts`

## Implementation Steps

1. Extract `ApiKeysTab` from `settings.tsx` to `packages/web/src/components/settings/api-keys-tab.tsx`
2. Add state: `showForm: boolean`, `newKey: string | null` (for the one-time display)
3. Add "Create API Key" button that toggles form
4. Build form:
   - Name text input (required)
   - Scope checkboxes: `['doc:read', 'doc:create', 'doc:update', 'doc:delete', 'doc:search', 'doc:share']`
   - Expiry input (optional, days 1-365)
5. Add `useMutation` for `POST /api/keys`
6. On success: set `newKey` state with response `.key`, hide form
7. Show key banner: monospace display + copy button + dismiss button + warning text
8. On dismiss: clear `newKey`, invalidate `['api-keys']` query
9. Add copy-to-clipboard handler with feedback (e.g., button text changes to "Copied!")

**Key display component:**
```tsx
{newKey && (
  <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4">
    <p className="text-xs text-green-400 mb-2">
      Copy this key now — it won't be shown again.
    </p>
    <div className="flex items-center gap-2">
      <code className="flex-1 rounded bg-surface-2 px-3 py-2 font-mono text-sm">
        {newKey}
      </code>
      <button onClick={copyToClipboard}>Copy</button>
    </div>
  </div>
)}
```

## Todo

- [x] Extract ApiKeysTab to own component
- [x] Add "Create API Key" button + form
- [x] Implement scope checkboxes
- [x] Add create mutation
- [x] Build one-time key display with copy
- [x] Add key metadata display (last used, created date, expiry)

## Success Criteria

- Admin can create API key with name + scopes
- Generated key shown once and copyable
- Key appears in list after creation
- Revoke still works
- `pnpm type-check` passes

## Risk Assessment

- **Low**: Backend fully exists, just need frontend UI
- UX concern: key must be prominently displayed — users lose it if they dismiss too fast
