# Code Review: Settings Page Fixes (Issue #57)

**Date:** 2026-03-26
**Scope:** 11 modified files, ~6 new component files, ~630 LOC changed
**Branch:** `claude/exciting-kilby`

## Overall Assessment

Solid implementation across all 6 phases. Good modularization from monolithic `settings.tsx` into focused components. The `__unchanged__` sentinel bug from the prior review has been **fixed** in `ai-service.ts`. Schema changes have a corresponding migration. Most patterns are clean and idiomatic React + Hono.

**3 CRITICAL issues, 4 HIGH issues found below.**

---

## CRITICAL Issues

### C1. S3 Auth in `testStorageConnection` uses invalid auth scheme

**File:** `packages/api/src/services/storage-config-service.ts:103-108`

```ts
headers: {
  Authorization: `AWS ${accessKey}:${secretKey}`,
},
```

R2's S3-compatible API requires **AWS Signature V4** (`AWS4-HMAC-SHA256`), not the deprecated `AWS` scheme. This will **always fail** with a 403, making the "Test Connection" button non-functional.

**Recommendation:** Use the `@aws-sdk/client-s3` package (already available in CF Workers via `s3:HeadBucket`) or implement SigV4 signing. At minimum, use the `aws4fetch` package which is lightweight and Workers-compatible:

```ts
import { AwsClient } from 'aws4fetch'
const aws = new AwsClient({ accessKeyId: accessKey, secretAccessKey: secretKey })
const response = await aws.fetch(`${endpoint}/${config.bucketName}`, { method: 'HEAD' })
```

### C2. Storage settings route missing `accessKey`/`secretKey` validation on initial creation

**File:** `packages/api/src/routes/storage-settings.ts:32-33`

Only `accountId` and `bucketName` are validated. On first creation (no existing row), `accessKey` and `secretKey` could be empty strings or `__unchanged__`, which would then be encrypted and stored as garbage credentials.

```ts
if (!body.accountId || !body.bucketName) {
  return c.json({ error: 'accountId and bucketName are required' }, 400)
}
// Missing: no check for accessKey/secretKey
```

**Recommendation:** Add validation for access keys, at least for new configs:

```ts
// If no existing config, keys are mandatory
const existing = await storageService.getStorageConfig(c.env, tenantId)
if (!existing && (!body.accessKey || !body.secretKey || body.accessKey === '__unchanged__')) {
  return c.json({ error: 'Access key and secret key are required for initial setup' }, 400)
}
```

### C3. PATCH `/api/ai/settings/order` has no input validation on order items

**File:** `packages/api/src/routes/ai.ts:96-104`

The endpoint only checks `Array.isArray(body.order)`. Individual items are not validated -- `providerId` could be any string (including SQL injection attempts via raw column names) and `priority` could be NaN, negative, or a string.

While Drizzle ORM parameterizes queries (preventing SQL injection), invalid data will silently corrupt the priority column.

**Recommendation:** Add Zod validation:

```ts
const reorderSchema = z.object({
  order: z.array(z.object({
    providerId: z.string().min(1),
    priority: z.number().int().min(0),
  })).min(1),
})
const body = reorderSchema.parse(await c.req.json())
```

---

## HIGH Issues

### H1. PATCH `/api/members/:id` does not validate role value

**File:** `packages/api/src/routes/members.ts:79-81`

```ts
const body = await c.req.json() as { role?: string }
if (!body.role) return c.json({ error: 'role is required' }, 400)
```

Unlike the invite endpoint which uses `inviteUserSchema` (Zod validation with `z.enum(ROLES)`), the role update route accepts **any string** as a role. An attacker could set `role: "superadmin"` or any arbitrary value.

**Recommendation:** Use the existing `updateMemberRoleSchema` from `@agentwiki/shared`:

```ts
import { updateMemberRoleSchema } from '@agentwiki/shared'
// ...
const body = updateMemberRoleSchema.parse(await c.req.json())
```

### H2. `updatePriorities` is not atomic -- sequential individual UPDATEs

**File:** `packages/api/src/ai/ai-service.ts:264-276`

```ts
for (const item of order) {
  await db.update(aiSettings).set({ priority: item.priority, ... }).where(...)
}
```

Sequential awaits in a loop without a transaction. If the 3rd of 5 updates fails, priorities will be in an inconsistent state. Also, the endpoint does not verify that the provided `providerId` values actually belong to the authenticated tenant's settings (they are scoped by `tenantId` in the WHERE, but a non-existent providerId silently does nothing -- no error returned).

**Recommendation:** Wrap in a D1 batch or at least validate all IDs exist first:

```ts
const statements = order.map((item) =>
  db.update(aiSettings)
    .set({ priority: item.priority, updatedAt: new Date() })
    .where(and(eq(aiSettings.tenantId, tenantId), eq(aiSettings.providerId, item.providerId)))
)
await db.batch(statements)
```

### H3. Members tab frontend has `agent` role in dropdown but `ROLES` const includes it -- verify authorization implications

**File:** `packages/web/src/components/settings/members-tab.tsx:202`

```ts
{['admin', 'editor', 'viewer', 'agent'].map((r) => ...)}
```

The `MemberRow` hardcodes the role list including `agent`, while the invite form uses `ROLES` const (`['admin', 'editor', 'viewer']` -- only 3 values in the `InviteRole` type on line 20). This inconsistency means:
- You can change someone's role TO `agent` via the dropdown
- But you cannot invite someone AS `agent`

The shared `ROLES` const is `['admin', 'editor', 'viewer', 'agent']`, so the invite form actually supports it via Zod. However, the frontend `InviteRole` type definition on line 19-20 restricts to the 3 items in the local `ROLES` array.

**Wait** -- re-reading: the local `ROLES` on line 19 is `['admin', 'editor', 'viewer'] as const`. But `inviteUserSchema` uses the shared `ROLES` which includes `agent`. So the frontend invite form only shows 3 roles but the backend accepts 4. Minor inconsistency but should be aligned.

**Recommendation:** Import `ROLES` from `@agentwiki/shared` in `members-tab.tsx` instead of hardcoding:

```ts
import { ROLES } from '@agentwiki/shared'
// Remove local ROLES const
```

### H4. DnD reorder has no optimistic update -- UI will "snap back" then re-render

**File:** `packages/web/src/components/settings/ai-settings-tab.tsx:303-311`

```ts
function handleDragEnd(event: DragEndEvent) {
  // ...
  reorderMutation.mutate(order)
}
```

The `configured` array is derived from `settings` (server state). After drag, the mutation fires and the list reverts to server order until `onSuccess` invalidates the query and refetches. This causes a visible "jump back" animation.

**Recommendation:** Add `onMutate` optimistic update to `useReorderAISettings`:

```ts
onMutate: async (order) => {
  await qc.cancelQueries({ queryKey: ['ai-settings'] })
  const prev = qc.getQueryData(['ai-settings'])
  qc.setQueryData(['ai-settings'], (old) => {
    // apply reorder optimistically
  })
  return { prev }
},
onError: (_, __, ctx) => qc.setQueryData(['ai-settings'], ctx?.prev),
onSettled: () => qc.invalidateQueries({ queryKey: ['ai-settings'] }),
```

---

## Positive Observations

- Clean modularization: settings.tsx went from ~300 lines to ~100 lines with properly extracted components
- URL-based tab deeplinking via `useSearchParams` is well-implemented with fallback
- `inviteUserSchema` Zod validation on the invite endpoint -- good pattern
- `__unchanged__` sentinel is now properly handled in the backend (the critical bug from previous review is fixed)
- Encryption for storage credentials uses the same proven encrypt/decrypt utilities
- Migration file exists and correctly adds both the `priority` column and `storage_settings` table
- `SortableProviderRow` uses `@dnd-kit/sortable` correctly with proper drag handle isolation
- Shortcut key capture with `useKeyCapture` hook is clean, with proper cleanup

---

## Recommended Actions (Priority Order)

1. **[CRITICAL]** Fix R2 test connection auth -- use `aws4fetch` for SigV4 signing
2. **[CRITICAL]** Add `accessKey`/`secretKey` validation for new storage configs
3. **[CRITICAL]** Add Zod schema validation for `PATCH /settings/order` body
4. **[HIGH]** Validate role in `PATCH /members/:id` using `updateMemberRoleSchema`
5. **[HIGH]** Wrap `updatePriorities` in a D1 batch for atomicity
6. **[HIGH]** Align role lists between invite form and member row dropdown
7. **[HIGH]** Add optimistic update for DnD reorder to prevent snap-back

---

## Unresolved Questions

1. Is `aws4fetch` already a dependency, or should it be added to `packages/api/package.json`?
2. Should the `agent` role be invitable from the UI, or is it intentionally limited to role-change only?
3. Are there existing D1 batch utilities in the codebase, or would this be the first usage?
