# Phase 06: Documentation Pages (#17, #18)

## Priority: P3 | Status: Pending | Effort: 2h

Two static documentation pages. Frontend-only. No backend changes.

---

## Issue #17: API Docs Page

### Problem
No dedicated page documenting the REST API endpoints for developers and agents.

### Current State
- README has a basic API endpoint listing
- No interactive or detailed API docs page in the web app
- Backend routes are well-structured and could be auto-documented

### Architecture Decision
**Static page approach** — no OpenAPI/Swagger overhead. Create a simple, well-designed docs page using existing component patterns. Render API reference from a structured data file. Can upgrade to OpenAPI later if needed.

### Files to Create
- `packages/web/src/routes/api-docs.tsx` — API documentation page
- `packages/web/src/data/api-reference.ts` — structured API endpoint data

### Files to Modify
- `packages/web/src/app.tsx` — add `/docs/api` route (public, no auth required)

### Implementation Steps

1. **Create API reference data**
   `data/api-reference.ts`:
   ```typescript
   export interface ApiEndpoint {
     method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
     path: string
     description: string
     auth: 'required' | 'optional' | 'none'
     params?: { name: string; type: string; required: boolean; description: string }[]
     body?: { name: string; type: string; required: boolean; description: string }[]
     response: string // example JSON or description
   }

   export interface ApiGroup {
     name: string
     description: string
     endpoints: ApiEndpoint[]
   }

   export const apiReference: ApiGroup[] = [
     {
       name: 'Authentication',
       description: 'OAuth login, session management, API keys',
       endpoints: [
         {
           method: 'GET',
           path: '/api/auth/me',
           description: 'Get current authenticated user profile',
           auth: 'required',
           response: '{ "id": "usr_...", "email": "...", "name": "...", "avatarUrl": "..." }',
         },
         // ... all other auth endpoints
       ],
     },
     // Documents, Folders, Search, Uploads, Share, API Keys, Tags, Graph groups
   ]
   ```

2. **Create API docs page**
   `routes/api-docs.tsx`:

   Layout:
   - Left sidebar: table of contents (group names as links)
   - Main content: endpoint groups with cards
   - Each endpoint card:
     - Method badge (GET=green, POST=blue, PUT=yellow, DELETE=red)
     - Path with syntax highlighting
     - Description
     - Auth requirement badge
     - Collapsible params/body/response sections
     - Copy curl example button

   Design: Follow existing dark/light theme patterns. Public page (no auth).

   ```typescript
   function EndpointCard({ endpoint }: { endpoint: ApiEndpoint }) {
     const methodColors = {
       GET: 'bg-green-500/10 text-green-400',
       POST: 'bg-blue-500/10 text-blue-400',
       PUT: 'bg-yellow-500/10 text-yellow-400',
       PATCH: 'bg-orange-500/10 text-orange-400',
       DELETE: 'bg-red-500/10 text-red-400',
     }
     // render method badge, path, description, params table, response code block
   }
   ```

3. **Add route in `app.tsx`**
   ```typescript
   <Route path="/docs/api" element={<ApiDocsPage />} />
   ```
   No `RequireAuth` wrapper — docs should be public.

4. **Add link from welcome screen and/or sidebar**

### Todo
- [ ] Create `api-reference.ts` with all endpoint data (9 groups, ~20 endpoints)
- [ ] Create `api-docs.tsx` page with TOC + endpoint cards
- [ ] Add method badges with color coding
- [ ] Add collapsible params/body/response sections
- [ ] Add curl example copy button
- [ ] Add `/docs/api` route (public)
- [ ] Link from welcome screen footer
- [ ] Test: page renders all endpoints correctly
- [ ] Test: accessible without authentication

---

## Issue #18: CLI Docs Page

### Problem
No documentation page for the CLI tool (`agentwiki` command).

### Current State
- README has CLI usage examples
- CLI source at `packages/cli/` uses Commander.js
- Commands: login, whoami, doc (list/get/create/update/delete), search, folder (list/create), tag (list), upload

### Files to Create
- `packages/web/src/routes/cli-docs.tsx` — CLI documentation page
- `packages/web/src/data/cli-reference.ts` — structured CLI command data

### Files to Modify
- `packages/web/src/app.tsx` — add `/docs/cli` route

### Implementation Steps

1. **Create CLI reference data**
   `data/cli-reference.ts`:
   ```typescript
   export interface CliCommand {
     command: string
     description: string
     args?: { name: string; required: boolean; description: string }[]
     options?: { flag: string; description: string; default?: string }[]
     examples: string[]
   }

   export interface CliGroup {
     name: string
     description: string
     commands: CliCommand[]
   }

   export const cliReference: CliGroup[] = [
     {
       name: 'Authentication',
       description: 'Login and verify access',
       commands: [
         {
           command: 'agentwiki login',
           description: 'Authenticate with an API key',
           options: [
             { flag: '--api-key <key>', description: 'API key (starts with aw_)' },
             { flag: '--server <url>', description: 'API server URL', default: 'https://api.agentwiki.cc' },
           ],
           examples: ['agentwiki login --api-key aw_xxxxx'],
         },
         {
           command: 'agentwiki whoami',
           description: 'Show current authenticated user and tenant',
           examples: ['agentwiki whoami'],
         },
       ],
     },
     // Document Management, Search, Folders, Tags, Uploads groups
   ]
   ```

2. **Create CLI docs page**
   `routes/cli-docs.tsx`:

   Layout:
   - Installation section: `npm install -g @agentwiki/cli`
   - Quick start: login → whoami → create doc
   - Command reference: grouped by category
   - Each command card:
     - Full command with syntax highlighting
     - Description
     - Arguments table (if any)
     - Options table with defaults
     - Example code blocks with copy button

3. **Add route**
   ```typescript
   <Route path="/docs/cli" element={<CliDocsPage />} />
   ```

4. **Shared docs navigation**
   Both API and CLI docs pages should have a shared header/nav:
   - "API Reference" | "CLI Reference" tabs/links
   - Back to wiki link

### Todo
- [ ] Create `cli-reference.ts` with all command data
- [ ] Create `cli-docs.tsx` page with grouped command cards
- [ ] Add installation and quick start sections
- [ ] Add copy-to-clipboard for code examples
- [ ] Add `/docs/cli` route (public)
- [ ] Add shared docs navigation between API and CLI pages
- [ ] Link from welcome screen footer
- [ ] Test: all commands documented accurately
- [ ] Test: code examples are copy-able

---

## Shared Docs Components

Create reusable components for both docs pages:
- `packages/web/src/components/docs/code-block.tsx` — syntax-highlighted code with copy button
- `packages/web/src/components/docs/docs-layout.tsx` — shared layout with sidebar TOC + header nav

### Todo
- [ ] Create `code-block.tsx` reusable component
- [ ] Create `docs-layout.tsx` shared layout
- [ ] Apply to both API and CLI docs pages

---

## Success Criteria
- API docs page at `/docs/api` lists all endpoints with params, responses, and curl examples
- CLI docs page at `/docs/cli` lists all commands with args, options, and examples
- Both pages are public (no auth required)
- Both pages follow existing dark/light theme
- Navigation between docs pages works
