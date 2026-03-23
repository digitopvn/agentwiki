# Code Review: AI-Assisted Features Implementation

**Date:** 2026-03-19
**Branch:** improve-mobile-ux-Bg9nT
**Reviewer:** code-reviewer agent

---

## Scope

- **Files reviewed:** 26 (new + modified across api, shared, web packages)
- **LOC (new):** ~1,200
- **Focus:** Security, SSE streaming, type safety, error handling, YAGNI/KISS/DRY

## Overall Assessment

Solid implementation. Clean architecture with well-applied Registry + Strategy pattern for multi-provider AI. Good separation of concerns across packages. Proper Zod validation, auth guards, and admin-only settings routes. Several issues found, two critical.

---

## Critical Issues

### C1. `__unchanged__` sentinel value encrypted and stored as API key

**File:** `packages/web/src/components/settings/ai-settings-tab.tsx:177` + `packages/api/src/ai/ai-service.ts:214`

When user clicks Save without entering a new API key, the frontend sends `'__unchanged__'` as the apiKey value. The backend `upsertSetting()` encrypts and stores this literal string, **overwriting the real encrypted key**.

Next AI request will decrypt `'__unchanged__'` and send it to the provider, causing auth failures.

**Fix:** Backend must detect the sentinel and skip updating `encryptedApiKey`:

```typescript
// ai-service.ts upsertSetting()
if (existing.length) {
  const updateData: Record<string, unknown> = {
    defaultModel: data.defaultModel,
    isEnabled: data.isEnabled,
    updatedAt: new Date(now),
  }
  if (data.apiKey !== '__unchanged__') {
    updateData.encryptedApiKey = await encrypt(data.apiKey, env.AI_ENCRYPTION_KEY)
  }
  await db.update(aiSettings).set(updateData).where(eq(aiSettings.id, existing[0].id))
}
```

Or better: use a separate Zod schema for updates where apiKey is optional, and only encrypt when provided.

### C2. Google Gemini adapter leaks API key in URL query parameter

**File:** `packages/api/src/ai/providers/google-adapter.ts:14,51`

```typescript
const url = `${BASE_URL}/${req.model}:generateContent?key=${apiKey}`
```

API key in URL is logged by proxies, CDNs, and browser history. While this is Google's own API format, server-side fetch mitigates browser exposure. However, Cloudflare Workers subrequest logs may capture full URLs.

**Recommendation:** This is Google's documented auth method, so it works. But add a code comment noting the risk and consider whether Google's OAuth2 bearer token auth is feasible as an alternative. Low effort to mitigate: ensure no request logging captures full URLs.

---

## High Priority

### H1. SSE `parseSSEStream` does not handle backpressure or cancellation

**File:** `packages/api/src/ai/ai-provider-interface.ts:23`

`response.body!.getReader()` uses non-null assertion. If the provider returns a response with no body (edge case: 200 OK but empty body on some providers), this crashes with an unhandled TypeError.

**Fix:** Guard against null body:

```typescript
if (!response.body) throw new Error('AI provider returned empty response body')
const reader = response.body.getReader()
```

### H2. Stream cancellation not propagated upstream

**File:** `packages/api/src/ai/ai-provider-interface.ts`

If the client disconnects mid-stream, the `ReadableStream` returned by `parseSSEStream` is cancelled, but the upstream `reader` from the provider response is never cleaned up. This keeps the connection to the AI provider open until it completes or times out.

**Fix:** Add a `cancel()` method to the ReadableStream:

```typescript
return new ReadableStream({
  async pull(controller) { /* ... existing code ... */ },
  cancel() {
    reader.cancel()
  },
})
```

### H3. Usage logging records 0/0 tokens for streaming endpoints

**File:** `packages/api/src/ai/ai-service.ts:59,86`

`generate()` and `transform()` call `logUsage(..., 0, 0)` because token counts aren't available from streaming responses. This makes usage tracking misleading -- admins see activity but zero token consumption.

**Recommendation:** Either:
1. Parse the final SSE chunk (some providers include usage in the stream's last message)
2. Estimate tokens based on input/output text length
3. Display a note in the usage UI that streaming requests don't report exact tokens

### H4. PBKDF2 salt is static across all tenants

**File:** `packages/api/src/utils/encryption.ts:18`

```typescript
salt: encoder.encode('agentwiki-ai-keys'),
```

Static salt means identical passwords derive identical keys. With a strong `AI_ENCRYPTION_KEY` env var this is acceptable, but a per-tenant or per-record salt would be more robust.

**Recommendation:** For now, document that `AI_ENCRYPTION_KEY` must be a strong random secret (32+ chars). Consider per-tenant salt in a future hardening pass.

---

## Medium Priority

### M1. Four OpenAI-compatible adapters have near-identical code

**Files:** `openai-adapter.ts`, `openrouter-adapter.ts`, `minimax-adapter.ts`, `alibaba-adapter.ts`

These four adapters differ only in `BASE_URL` and optional headers. ~300 lines of duplicated code.

**Fix:** Extract a `BaseOpenAICompatibleAdapter` class:

```typescript
class OpenAICompatibleAdapter implements AIProvider {
  constructor(
    readonly id: string,
    readonly name: string,
    private baseUrl: string,
    private extraHeaders?: Record<string, string>,
  ) {}
  // shared generateText/streamText logic
}
```

Then each adapter becomes a 5-line instantiation.

### M2. No abort/timeout on outbound AI provider fetch calls

**Files:** All adapter files

If an AI provider is slow or unresponsive, the request hangs indefinitely. Cloudflare Workers has a 30-second CPU limit but subrequests can extend beyond that.

**Fix:** Add `AbortSignal.timeout(30_000)` to fetch calls:

```typescript
const res = await fetch(url, { signal: AbortSignal.timeout(30000), ... })
```

### M3. `suggest()` trusts AI response as valid JSON array

**File:** `packages/api/src/ai/ai-service.ts:179-180`

The `JSON.parse(response.content)` could parse any valid JSON (object, number, etc.), not just arrays. The `.map(String)` call on non-string array items could produce `"[object Object]"`.

**Fix:** Add validation:

```typescript
const parsed = JSON.parse(response.content)
if (Array.isArray(parsed)) return parsed.filter(s => typeof s === 'string').slice(0, maxSuggestions)
```

### M4. ProviderCard state not synced when settings data refreshes

**File:** `packages/web/src/components/settings/ai-settings-tab.tsx:112-113`

`useState(setting?.defaultModel || models[0])` and `useState(setting?.isEnabled ?? true)` use initial values only. When `setting` changes (after save mutation invalidates query), the local state is stale.

**Fix:** Either use `useEffect` to sync or derive state from props:

```typescript
const [model, setModel] = useState(setting?.defaultModel || models[0])
useEffect(() => { if (setting) setModel(setting.defaultModel) }, [setting?.defaultModel])
```

### M5. `window.prompt()` used for AI Write/List/Edit inputs

**Files:** `ai-slash-commands.ts:41`, `ai-selection-toolbar.tsx:45`

`window.prompt()` is a blocking native dialog that breaks UX flow and has no styling. Consider a custom modal or inline input component for a more polished experience.

**Recommendation:** Low priority if this is MVP, but flag for UX polish pass.

### M6. `deleteSetting` route has no validation on `providerId` param

**File:** `packages/api/src/routes/ai.ts:98`

```typescript
const providerId = c.req.param('providerId')
```

No Zod validation that `providerId` is a valid `AIProviderId`. While the SQL `WHERE` clause prevents damage, it's inconsistent with other routes that validate input.

---

## Low Priority

### L1. Rate limiter race condition on increment

**File:** `packages/api/src/middleware/rate-limiter.ts:20-31`

KV `get` then `put(current + 1)` is not atomic. Under concurrent requests, multiple requests could read the same count and all increment to the same value, allowing burst above the limit.

Acceptable for AI rate limiting (not billing-critical), but worth noting.

### L2. Usage table index

**File:** `packages/api/src/db/schema.ts`

No index on `(tenant_id, created_at)` for the `ai_usage` table. As usage grows, the `getUsage()` query will slow down.

### L3. `Sparkles` icon import in settings

**File:** `packages/web/src/routes/settings.tsx:19`

Ensure `Sparkles` is imported from the icon library (lucide-react). Not shown in grep output but should be verified.

---

## Positive Observations

1. **Clean architecture** -- Provider interface + Registry pattern is textbook Strategy pattern, easy to extend
2. **Proper auth layering** -- `authGuard` on all routes, `requireAdmin` on settings/usage
3. **Zod validation** -- All request bodies validated with clear schemas and max-length constraints
4. **Encryption at rest** -- AES-256-GCM with PBKDF2 key derivation for API keys
5. **Graceful fallback** -- Queue handler tries tenant provider then falls back to Workers AI
6. **SSE streaming** -- Proper chunked SSE format with `[DONE]` sentinel
7. **Shared types** -- Types defined once in shared package, used by both frontend and backend
8. **Masked keys** -- Settings GET never returns actual API keys, only mask indicator
9. **Input truncation** -- Context truncated to 3000 chars, preventing prompt injection via massive payloads

---

## Recommended Actions (Priority Order)

1. **[CRITICAL]** Fix `__unchanged__` sentinel -- backend must skip re-encrypting when key unchanged
2. **[CRITICAL]** Guard `response.body!` null assertion in `parseSSEStream`
3. **[HIGH]** Add `cancel()` handler to `parseSSEStream` to clean up provider connections
4. **[HIGH]** Address 0/0 token logging for streaming -- at minimum add UI note
5. **[MEDIUM]** Extract `BaseOpenAICompatibleAdapter` to DRY up 4 adapters
6. **[MEDIUM]** Add fetch timeout to all provider adapter calls
7. **[MEDIUM]** Fix ProviderCard stale state after settings refresh
8. **[MEDIUM]** Validate `providerId` param on DELETE route

---

## Unresolved Questions

1. Is there a DB migration file for the new `ai_settings` and `ai_usage` tables? Not found in the reviewed files.
2. Does `AI_ENCRYPTION_KEY` have a minimum length requirement enforced anywhere (e.g., wrangler config validation)?
3. The `__unchanged__` sentinel -- was this intended as a temporary solution? It needs backend support regardless.
