---
phase: 5
title: Storage Tab — Custom R2 Credentials
priority: medium
status: completed
effort: L
---

# Phase 5: Storage Tab — Configurable Credentials

## Context Links
- [plan.md](./plan.md)
- [Issue #57](https://github.com/digitopvn/agentwiki/issues/57)
- Frontend: `packages/web/src/components/settings/storage-tab.tsx`
- Hooks: `packages/web/src/hooks/use-uploads.ts`
- Backend uploads: `packages/api/src/routes/uploads.ts`
- DB: `packages/api/src/db/schema.ts`
- Encryption util: `packages/api/src/ai/ai-service.ts` (for AES-256-GCM pattern)

## Overview

Storage tab currently shows hardcoded "agentwiki-files" bucket info. Issue requests: "must allows configurable, users can add their cloudflare's credentials". This means tenants should be able to configure their own R2 storage bucket with their own Cloudflare credentials.

## Key Insights

- Current R2 access: via Cloudflare Worker binding (`env.R2_BUCKET`) — zero credentials needed
- Custom R2 access: must use S3-compatible API with credentials (Account ID + Access Key + Secret)
- AES-256-GCM encryption already used for AI API keys — reuse same pattern for storage secrets
- Cloudflare R2 is S3-compatible — use `@aws-sdk/client-s3` or lightweight alternative
- Need a `storage_settings` table or extend `tenants` table

## Requirements

**Functional:**
- Admin can configure custom R2 credentials: Account ID, Access Key ID, Secret Access Key, Bucket Name
- "Test Connection" button to verify credentials work
- Credentials encrypted at rest (AES-256-GCM)
- When custom credentials configured: uploads use custom bucket instead of default
- When no custom credentials: fall back to default Worker binding (current behavior)
- Show connection status: connected/disconnected/error

**Non-functional:**
- Credentials never returned in plaintext to frontend (masked like AI keys)
- Secure storage with same encryption as AI provider keys

## Architecture

```
[Storage Config Form]
  ├── Account ID input
  ├── Access Key ID input
  ├── Secret Access Key input (password)
  ├── Bucket Name input
  ├── [Test Connection] button
  └── [Save] button

Backend:
  POST/PUT /api/storage/settings → encrypt + store
  GET /api/storage/settings → return masked
  POST /api/storage/test → verify S3 connection

Upload flow:
  Has custom config? → Use S3 client with decrypted creds
  No custom config? → Use env.R2_BUCKET binding (default)
```

### DB Schema — New Table

```sql
CREATE TABLE storage_settings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  account_id TEXT NOT NULL,
  encrypted_access_key TEXT NOT NULL,
  encrypted_secret_key TEXT NOT NULL,
  bucket_name TEXT NOT NULL,
  endpoint_url TEXT,
  is_verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(tenant_id)
);
```

## Related Code Files

**Modify:**
- `packages/web/src/components/settings/storage-tab.tsx` — add config form section
- `packages/api/src/routes/uploads.ts` — add storage config routes, modify upload to check custom config
- `packages/api/src/db/schema.ts` — add `storageSettings` table

**Create:**
- `packages/api/src/services/storage-config-service.ts` — encrypt/decrypt/CRUD for storage settings
- `packages/web/src/hooks/use-storage-settings.ts` — hooks for storage config CRUD

**Read for context:**
- `packages/api/src/ai/ai-service.ts` — encryption pattern to reuse
- `packages/api/src/utils/` — encryption utilities

## Implementation Steps

### Step 1: DB Migration

1. Add `storageSettings` table to `schema.ts`
2. Generate migration: `pnpm -F @agentwiki/api db:generate`

### Step 2: Backend — Storage Config Service

1. Create `storage-config-service.ts`:
   - `getStorageConfig(env, tenantId)` — fetch + decrypt
   - `upsertStorageConfig(env, tenantId, config)` — encrypt + save
   - `deleteStorageConfig(env, tenantId)` — remove
   - `testStorageConnection(config)` — try S3 HeadBucket operation
2. Reuse encryption from AI key handling (extract to shared util if not already)

### Step 3: Backend — Storage Config Routes

Add to `uploads.ts` or create separate `storage-settings.ts`:
```ts
GET  /api/storage/settings  → return masked config (admin)
PUT  /api/storage/settings  → upsert config (admin)
DELETE /api/storage/settings → remove config (admin)
POST /api/storage/test      → test connection (admin)
```

### Step 4: Backend — Conditional Upload Path

Modify upload handler in `uploads.ts`:
1. Check if tenant has custom storage config
2. If yes: create S3 client with decrypted creds, upload via S3 API
3. If no: use existing `env.R2_BUCKET` binding
4. Same for file serving and deletion

### Step 5: Frontend — Config Form

1. Add config section at top of `storage-tab.tsx` (above file grid)
2. Form fields: Account ID, Access Key, Secret Key (password), Bucket Name
3. "Test Connection" button — calls POST /api/storage/test, shows result
4. "Save" button — calls PUT /api/storage/settings
5. Show current status: configured/not configured, last verified
6. "Remove" button to revert to default

### Step 6: Frontend — Hooks

Create `use-storage-settings.ts`:
- `useStorageSettings()` — fetch config
- `useUpdateStorageSettings()` — save config
- `useDeleteStorageSettings()` — remove config
- `useTestStorageConnection()` — test connection

## Todo

- [x] Add storageSettings table to schema + generate migration
- [x] Create storage-config-service.ts (encrypt/decrypt/CRUD/test)
- [x] Add storage config API routes
- [x] Modify upload handler for conditional storage path
- [x] Create use-storage-settings.ts hooks
- [x] Add config form UI to storage-tab.tsx
- [x] Add "Test Connection" functionality
- [x] Test: custom config upload/download/delete cycle

## Success Criteria

- Admin can input R2 credentials and test connection
- Credentials encrypted at rest
- Uploads use custom bucket when configured
- Falls back to default when no custom config
- "Test Connection" verifies before saving
- `pnpm type-check` passes

## Risk Assessment

- **High**: Significant backend change to upload flow — must not break default path
- S3 client adds dependency weight — consider using Cloudflare's lightweight approach
- Encryption key management: must use same `AI_ENCRYPTION_KEY` env var or separate one
- Migration adds new table — safe (no existing data affected)
- Need to handle file serving from custom bucket (different endpoint URL)

## Security Considerations

- Credentials encrypted with AES-256-GCM (same as AI API keys)
- Admin-only access to config endpoints
- Secret key never returned to frontend in plaintext
- Test connection endpoint should have rate limiting (prevents credential brute force)
