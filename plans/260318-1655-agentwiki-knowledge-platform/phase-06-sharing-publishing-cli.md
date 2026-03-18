---
title: "Phase 6: Sharing, Publishing & CLI"
status: pending
priority: P2
effort: 20h
---

# Phase 6: Sharing, Publishing & CLI

## Context Links
- [Architecture — Sharing Model & CLI](../reports/researcher-02-260318-1655-knowledge-platform-architecture.md)
- [Phase 3 — Document API](./phase-03-core-api-database.md)

## Overview
Document sharing (private/specific/public), HTML publish pipeline to R2, public share viewer, CLI tool wrapping all API endpoints with device code auth flow.

## Key Insights
- Share tokens: 32-char random, stored with expiry in D1, served without auth
- Email sharing: invite tokens + optional magic link login
- Publish pipeline: BlockNote JSON → HTML (server-side render in Worker) → R2 upload
- CLI: Commander.js, device code auth (headless-friendly), wraps entire API
- CLI config stored at `~/.agentwiki/` (credentials + preferences)

## Requirements

### Functional
- Set document access: private, specific (email list), public (share URL)
- Generate/revoke share links with optional expiry
- Email invite flow for specific sharing
- Publish document: render HTML + upload to R2 + version tracking
- Public page viewer (no auth required, accessed via share token)
- CLI: login, doc CRUD, search, share, publish commands
- CLI device code auth flow

### Non-Functional
- Share link generation < 50ms
- Published page load < 500ms (R2 CDN)
- CLI response time < 1s for most operations

## Architecture

### Share Link Resolution
```
GET /share/{token}
  │
  ├─ Lookup share_links WHERE token = ? AND expires_at > now()
  ├─ If not found → 404
  ├─ If found → fetch document (bypass auth)
  └─ Return: rendered HTML page (published) or JSON (API)
```

### Publish Pipeline
```
User clicks "Publish"
  │
  ├─► API: POST /api/documents/:id/publish
  │     ├─ Fetch document content (BlockNote JSON)
  │     ├─ Render → self-contained HTML (inline CSS, no external deps)
  │     ├─ Upload to R2: {tenant_id}/published/{doc_id}/v{version}.html
  │     ├─ Update published_versions table
  │     └─ Return: { publishedUrl, version }
  │
  ▼
Public access: GET /published/{tenant_id}/{doc_id}
  ├─ Serve latest HTML from R2
  └─ Cache via Cloudflare CDN (Cache-Control: 1 hour)
```

### CLI Architecture
```
~/.agentwiki/
├── config.json     # { apiUrl, tenantId, defaultCollection }
├── credentials.json # { accessToken, refreshToken, expiresAt }
└── cache/          # optional search cache

CLI → apiFetch(endpoint) → agentwiki API → response → format output
```

## Related Code Files

### Files to Create
- `packages/api/src/routes/shares.ts` — share link CRUD + public access
- `packages/api/src/routes/publish.ts` — publish endpoint
- `packages/api/src/services/share-service.ts` — share link logic
- `packages/api/src/services/publish-service.ts` — HTML render + R2 upload
- `packages/api/src/utils/html-renderer.ts` — BlockNote → HTML conversion
- `packages/web/src/routes/share.tsx` — public share viewer page
- `packages/web/src/components/metadata/share-dialog.tsx` — share UI
- `packages/web/src/components/metadata/publish-dialog.tsx` — publish UI
- `packages/cli/src/index.ts` — CLI entry with all commands
- `packages/cli/src/commands/login.ts` — device code auth
- `packages/cli/src/commands/doc.ts` — doc list/get/create/update/delete/search
- `packages/cli/src/commands/share.ts` — share link commands
- `packages/cli/src/commands/publish.ts` — publish commands
- `packages/cli/src/lib/api-client.ts` — CLI HTTP client with token refresh
- `packages/cli/src/lib/config.ts` — config file management
- `packages/cli/src/lib/auth.ts` — device code flow + token storage
- `packages/cli/src/lib/output.ts` — format output (table, json, plain)
- `packages/shared/src/types/shares.ts` — share types
- `packages/shared/src/types/publish.ts` — publish types

### Files to Modify
- `packages/api/src/db/schema.ts` — add share_links, published_versions tables
- `packages/api/src/index.ts` — register share + publish routes
- `packages/web/src/components/metadata/sharing-settings.tsx` — wire to share API

## Implementation Steps

### 1. Share Schema + Service (3h)
1. Add tables:
   ```sql
   share_links (
     id TEXT PRIMARY KEY,
     token TEXT UNIQUE NOT NULL,       -- 32-char random
     document_id TEXT NOT NULL,
     tenant_id TEXT NOT NULL,
     created_by TEXT NOT NULL,
     access_level TEXT NOT NULL,        -- 'specific' or 'public'
     expires_at INTEGER,               -- null = no expiry
     created_at INTEGER NOT NULL
   )

   share_invites (
     id TEXT PRIMARY KEY,
     share_link_id TEXT NOT NULL,
     email TEXT NOT NULL,
     accepted_at INTEGER,
     created_at INTEGER NOT NULL
   )

   published_versions (
     id TEXT PRIMARY KEY,
     document_id TEXT NOT NULL,
     tenant_id TEXT NOT NULL,
     version INTEGER NOT NULL,
     r2_key TEXT NOT NULL,              -- R2 object key for HTML
     published_by TEXT NOT NULL,
     published_at INTEGER NOT NULL
   )
   ```
2. `services/share-service.ts`:
   - `createShareLink(docId, tenantId, userId, accessLevel, expiresAt?)` → token
   - `revokeShareLink(tokenId)` → delete
   - `resolveShareToken(token)` → document (or null if expired/missing)
   - `inviteByEmail(shareLinkId, emails[])` → create invite records
   - `listShareLinks(docId)` → active links for document

### 2. Share Routes + Public Viewer (3h)
1. `routes/shares.ts`:
   - `POST /api/documents/:id/share` — create share link
   - `DELETE /api/shares/:id` — revoke share link
   - `GET /api/shares` — list shares for document
   - `POST /api/shares/:id/invite` — send email invites
   - `GET /share/:token` — public access (no auth middleware)
     - Return HTML if Accept: text/html
     - Return JSON if Accept: application/json
2. `routes/share.tsx` (web):
   - Minimal page: render document content read-only
   - No sidebar, no editor chrome — clean reading view
   - Show title, content, "Powered by AgentWiki" footer

### 3. Publish Pipeline (4h)
1. `utils/html-renderer.ts`:
   - Convert BlockNote JSON → HTML string
   - Use `@blocknote/core` server-side export (no React needed):
     ```typescript
     import { BlockNoteEditor } from '@blocknote/core'
     const editor = BlockNoteEditor.create()
     editor.replaceBlocks(editor.document, blocks)
     const html = await editor.blocksToHTMLLossy()
     ```
   - Wrap in HTML template: `<!DOCTYPE html>`, inline CSS, responsive meta tags
   - Include table of contents generated from headings
   - Self-contained: no external CSS/JS references
2. `services/publish-service.ts`:
   - `publishDocument(docId, tenantId, userId)`:
     - Fetch document + blocks
     - Render to HTML via html-renderer
     - Upload to R2: `{tenantId}/published/{docId}/v{version}.html`
     - Also upload as `latest.html` for quick access
     - Insert into published_versions
     - Return published URL
   - `getPublishedVersions(docId)` — list all published versions
   - `unpublish(docId)` — delete from R2, remove records
3. `routes/publish.ts`:
   - `POST /api/documents/:id/publish` — trigger publish
   - `GET /api/documents/:id/published` — list published versions
   - `GET /published/:tenantId/:docId` — serve latest published HTML from R2

### 4. Share + Publish UI (2h)
1. `components/metadata/share-dialog.tsx`:
   - Toggle access level (private/specific/public)
   - Copy share link button
   - Expiry date picker
   - Email invite input with send button
   - List active share links with revoke
2. `components/metadata/publish-dialog.tsx`:
   - "Publish" button with version preview
   - List published versions with dates
   - "View Published" link
   - "Unpublish" button

### 5. CLI Foundation (3h)
1. `packages/cli/src/index.ts`:
   ```typescript
   import { program } from 'commander'
   program
     .name('agentwiki')
     .version('0.1.0')
     .description('AgentWiki CLI')
   // Register command groups
   program.addCommand(loginCommand)
   program.addCommand(docCommand)
   program.addCommand(shareCommand)
   program.addCommand(publishCommand)
   program.parse()
   ```
2. `lib/config.ts`:
   - Read/write `~/.agentwiki/config.json`
   - Read/write `~/.agentwiki/credentials.json`
   - Auto-create directory on first run
3. `lib/api-client.ts`:
   - Fetch wrapper with Bearer token from credentials
   - Auto-refresh expired access tokens
   - Error handling with user-friendly messages
4. `lib/output.ts`:
   - `--format json|table|plain` flag support
   - Table formatting for list outputs
   - JSON pretty-print for raw data

### 6. CLI Device Code Auth (2h)
1. `commands/login.ts`:
   ```
   $ agentwiki login
   > Opening browser for authentication...
   > If browser doesn't open, visit: https://app.agentwiki.com/device?code=ABCD-1234
   > Waiting for authentication... (polling)
   > Authenticated as user@example.com (Tenant: My Workspace)
   ```
2. Flow:
   - POST `/api/auth/device` → `{ deviceCode, userCode, verificationUrl, interval }`
   - Open browser with verification URL
   - Poll `POST /api/auth/device/token` every `interval` seconds
   - On success: store tokens in credentials.json
3. Add device code routes to API:
   - `POST /api/auth/device` — generate codes, store pending auth
   - `POST /api/auth/device/token` — check if user completed auth

### 7. CLI Document Commands (2h)
1. `commands/doc.ts`:
   ```bash
   agentwiki doc list [--folder <id>] [--category <name>] [--limit 20]
   agentwiki doc get <id> [--format json|markdown]
   agentwiki doc create --title "Title" [--file path.md] [--category x] [--tags a,b]
   agentwiki doc update <id> [--title "New"] [--file path.md] [--tags a,b]
   agentwiki doc delete <id> [--confirm]
   agentwiki doc search <query> [--type hybrid|keyword|semantic]
   agentwiki doc versions <id>
   ```
2. Each command: parse args → call API → format output

### 8. CLI Share + Publish Commands (1h)
1. `commands/share.ts`:
   ```bash
   agentwiki share create <docId> [--public] [--expires 7d]
   agentwiki share list <docId>
   agentwiki share revoke <shareId>
   agentwiki share invite <docId> --email user@example.com
   ```
2. `commands/publish.ts`:
   ```bash
   agentwiki publish <docId>
   agentwiki publish list <docId>
   agentwiki publish unpublish <docId>
   ```

## Todo List
- [ ] Add share_links, share_invites, published_versions tables + migration
- [ ] Implement share service (create, revoke, resolve, invite)
- [ ] Create share routes (CRUD + public access)
- [ ] Build public share viewer page (web)
- [ ] Implement HTML renderer (BlockNote → self-contained HTML)
- [ ] Implement publish service (render + R2 upload + versioning)
- [ ] Create publish routes
- [ ] Build share dialog UI component
- [ ] Build publish dialog UI component
- [ ] Add device code auth routes to API
- [ ] Setup CLI project (Commander.js, config, api-client)
- [ ] Implement CLI device code login
- [ ] Implement CLI doc commands (list, get, create, update, delete, search)
- [ ] Implement CLI share + publish commands
- [ ] Build + test CLI as npm package (`npx agentwiki`)

## Success Criteria
- Share link created → accessible without auth via token URL
- Email invite → recipient can view document
- Publish → HTML uploaded to R2, accessible via public URL
- Published page loads in < 500ms, self-contained, no broken assets
- CLI login via device code works end-to-end
- CLI doc commands mirror API functionality
- CLI output formats (json, table) work correctly
- `npx @agentwiki/cli doc list` works after npm publish

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| BlockNote server-side rendering issues | Medium | High | Fallback: markdown → HTML via remark-html |
| Device code flow complexity | Low | Medium | Well-documented OAuth standard; many reference implementations |
| Share token brute force | Low | Critical | 32-char token = 192 bits entropy; rate limit public access |
| Published HTML XSS | Medium | High | Sanitize HTML output; CSP headers on published pages |

## Security Considerations
- Share tokens: 32 chars (a-zA-Z0-9), 192-bit entropy
- Expired share links return 404 (no information leak)
- Published HTML: sanitize all user content, set restrictive CSP
- CLI credentials: stored in user home dir with 600 permissions
- Device code: 10-minute expiry, single-use, rate-limited polling
- Email invites: validate email format, prevent enumeration

## Next Steps
- Phase 7: Knowledge Graph & Security Hardening (final phase)
