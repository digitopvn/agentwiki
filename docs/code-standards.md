# AgentWiki: Code Standards & Conventions

Enforced standards for consistent, maintainable code across all packages.

## TypeScript Configuration

All packages use `tsconfig.base.json` with strict settings:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "module": "esnext",
    "target": "es2020"
  }
}
```

**Rules**:
- No `any` types; use `unknown` or explicit types
- All function parameters must be typed
- All return types must be explicit (except inference from literal)
- Use `const` by default; `let` only for reassignment; never `var`

## File Naming Conventions

### TypeScript/JavaScript Files
- **Format**: `kebab-case` with descriptive names
- **Length**: Acceptable to use long names for clarity (e.g., `rate-limiter.ts`, `wikilink-extractor.ts`)
- **Services**: `{service-name}-service.ts` (e.g., `auth-service.ts`)
- **Utilities**: `{function-name}.ts` (e.g., `crypto.ts`, `slug.ts`)
- **Routes**: `{resource-name}.ts` (e.g., `documents.ts`, `api-keys.ts`)
- **Middleware**: `{middleware-name}.ts` (e.g., `auth-guard.ts`)
- **Components**: `{component-name}.tsx` (e.g., `folder-tree.tsx`)
- **Hooks**: `use-{hook-name}.ts` (e.g., `use-auth.ts`)
- **Stores**: `{store-name}-store.ts` (e.g., `app-store.ts`)

**Examples**:
```
✓ auth-service.ts
✓ rate-limiter.ts
✓ use-documents.ts
✓ document-properties.tsx
✗ AuthService.ts (not kebab-case)
✗ useDocuments.ts (hooks still use kebab-case prefix)
```

### Configuration Files
- `wrangler.toml` — Cloudflare Worker config
- `drizzle.config.ts` — Drizzle ORM migrations
- `vite.config.ts` — Vite bundler config
- `.env.example` — Environment variables template
- `tsconfig.json` — TypeScript config
- `package.json` — NPM package metadata

## Code Organization

### Backend (`packages/api/src`)

#### Directory Structure
```
src/
├── db/
│   ├── schema.ts         (Drizzle table defs + constraints)
│   └── migrations/       (SQL migrations auto-generated)
├── middleware/           (Auth, rate limiting, permissions)
├── routes/              (HTTP endpoint handlers)
├── services/            (Business logic)
├── queue/               (Async job handlers)
├── utils/               (Utilities, helpers)
├── env.ts               (Cloudflare bindings type defs)
└── index.ts             (Hono app setup)
```

#### Middleware Pattern
```typescript
// middleware/auth-guard.ts
import { Context, Next } from 'hono'

export async function authGuard(c: Context, next: Next): Promise<void> {
  const token = extractBearerToken(c)
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const payload = verifyJwt(token)
    c.set('user', payload)
    await next()
  } catch (err) {
    return c.json({ error: 'Invalid token' }, 401)
  }
}
```

#### Route Pattern
```typescript
// routes/documents.ts
import { Hono } from 'hono'
import { authGuard } from '../middleware/auth-guard'
import { documentService } from '../services/document-service'

const router = new Hono()

router.get('/', authGuard, async (c) => {
  const tenantId = c.get('user').tenantId
  const limit = Number(c.query('limit') ?? '20')
  const offset = Number(c.query('offset') ?? '0')

  const docs = await documentService.list(c.env.DB, tenantId, { limit, offset })
  return c.json(docs)
})

export const documentRoutes = router
```

#### Service Pattern
```typescript
// services/document-service.ts
import { drizzle } from 'drizzle-orm/d1'
import { documents } from '../db/schema'

export const documentService = {
  async list(db: D1Database, tenantId: string, opts: PaginationOpts) {
    return drizzle(db)
      .select()
      .from(documents)
      .where(eq(documents.tenantId, tenantId))
      .limit(opts.limit)
      .offset(opts.offset)
  },

  async getById(db: D1Database, tenantId: string, id: string) {
    const result = await drizzle(db)
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.tenantId, tenantId)))
      .limit(1)
    return result[0] ?? null
  },
}
```

#### Drizzle ORM Patterns

**Schema Definition**:
```typescript
// db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  // ... more fields
})
```

**Query Pattern**:
```typescript
// Always use drizzle(env.DB) within route/service handlers
import { eq, and, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'

const db = drizzle(env.DB)

// SELECT with conditions
await db
  .select()
  .from(documents)
  .where(and(
    eq(documents.tenantId, tenantId),
    isNull(documents.deletedAt)
  ))
  .limit(10)

// INSERT
await db.insert(documents).values({
  id: generateId(),
  tenantId,
  title: 'New Doc',
  // ...
})

// UPDATE
await db
  .update(documents)
  .set({ title: 'Updated' })
  .where(eq(documents.id, id))

// DELETE (soft, via updatedAt or deletedAt)
await db
  .update(documents)
  .set({ deletedAt: new Date() })
  .where(eq(documents.id, id))
```

### Frontend (`packages/web/src`)

#### Directory Structure
```
src/
├── components/
│   ├── layout/           (Page layout shells)
│   ├── sidebar/          (Folder tree, nav)
│   ├── editor/           (BlockNote wrapper, tabs)
│   ├── metadata/         (Document properties)
│   └── command-palette/  (Search)
├── hooks/                (Custom React hooks)
├── stores/               (Zustand stores)
├── lib/                  (API client, utilities)
├── routes/               (Page components)
├── app.tsx               (Router setup)
├── main.tsx              (React entry)
└── index.css             (Global styles)
```

#### React Component Pattern
```typescript
// components/editor/editor.tsx
import { useEffect, useRef } from 'react'
import { BlockNoteEditor } from '@blocknote/react'
import { useAppStore } from '../../stores/app-store'

interface EditorProps {
  documentId: string
  initialContent: unknown
  onSave: (content: unknown) => Promise<void>
}

export function Editor({ documentId, initialContent, onSave }: EditorProps) {
  const editorRef = useRef<BlockNoteEditor | null>(null)
  const [activeTabId] = useAppStore((s) => [s.activeTabId])

  useEffect(() => {
    // Initialize editor...
  }, [documentId])

  return (
    <div className="editor-container">
      {/* BlockNote editor JSX */}
    </div>
  )
}
```

**Rules**:
- Function components only (no class components)
- Props must be typed with `interface`
- Use `const` for component declaration
- Name files to match component name
- One component per file (exceptions: variants, wrappers)

#### Custom Hook Pattern
```typescript
// hooks/use-documents.ts
import { useQuery } from '@tanstack/react-query'
import { useAuth } from './use-auth'
import { apiClient } from '../lib/api-client'

export function useDocuments(options?: { limit?: number; offset?: number }) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['documents', options?.limit, options?.offset],
    queryFn: async () => {
      const res = await apiClient.get('/documents', { params: options })
      return res.data
    },
    enabled: !!user,
    staleTime: 30_000,
  })
}
```

#### Zustand Store Pattern
```typescript
// stores/app-store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppState {
  // State
  sidebarCollapsed: boolean
  theme: 'dark' | 'light'

  // Actions
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleTheme: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      theme: 'dark',
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
    }),
    {
      name: 'app-store',
      partialize: (state) => ({ theme: state.theme, sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
)
```

#### TailwindCSS Usage
```typescript
// Use classnames (cn utility) for conditional classes
import { cn } from '../lib/utils'

export function Button({ disabled }: { disabled?: boolean }) {
  return (
    <button
      className={cn(
        'px-4 py-2 rounded-lg font-semibold transition-colors',
        disabled ? 'bg-gray-300 text-gray-500' : 'bg-blue-600 text-white hover:bg-blue-700'
      )}
    >
      Click me
    </button>
  )
}
```

### Shared Package (`packages/shared/src`)

#### Type Definitions
```typescript
// types/auth.ts
export interface JwtPayload {
  userId: string
  tenantId: string
  email: string
  role: Role
  iat: number
  exp: number
}

export type Role = 'admin' | 'editor' | 'viewer' | 'agent'

export interface User {
  id: string
  email: string
  name: string
  avatarUrl?: string
  provider: 'google' | 'github'
}
```

#### Validation Schemas
```typescript
// schemas/document.ts
import { z } from 'zod'

export const createDocumentSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().default(''),
  folderId: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
})

export type CreateDocumentRequest = z.infer<typeof createDocumentSchema>
```

## Function Signatures

### Service Functions
```typescript
// Always include explicit return types
export async function searchDocuments(
  env: Env,
  tenantId: string,
  query: string,
  options?: { limit?: number; type?: SearchType },
): Promise<SearchResult[]> {
  // Implementation
}

// Short functions can fit on one line
export function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-')
}
```

### Event Handlers
```typescript
// React event handlers: type explicitly
function handleClick(e: React.MouseEvent<HTMLButtonElement>): void {
  e.preventDefault()
  // ...
}

// Form submission
function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
  e.preventDefault()
  // ...
}
```

## Error Handling

### Backend Error Pattern
```typescript
// services/document-service.ts
export async function getDocument(db: D1Database, id: string, tenantId: string) {
  try {
    const doc = await db.select().from(documents).where(...).get()
    if (!doc) {
      throw new Error('Document not found')
    }
    return doc
  } catch (err) {
    console.error('Failed to fetch document:', err)
    throw err // Re-throw for caller to handle
  }
}

// routes/documents.ts
router.get('/:id', authGuard, async (c) => {
  try {
    const doc = await documentService.getDocument(c.env.DB, c.param('id'), c.get('user').tenantId)
    return c.json(doc)
  } catch (err) {
    return c.json({ error: 'Not found' }, 404)
  }
})
```

### Frontend Error Pattern
```typescript
// Query error handling
const { data, isLoading, error } = useDocuments()

if (error) {
  return <div className="text-red-600">Failed to load: {error.message}</div>
}

// Try-catch for mutations
async function handleSave() {
  try {
    await apiClient.post('/documents', { title, content })
    // Success
  } catch (err) {
    console.error('Save failed:', err)
    toast.error('Failed to save document')
  }
}
```

## Comments & Documentation

### When to Comment
- **Complex algorithms**: Explain the approach
- **Non-obvious logic**: Why, not what
- **Workarounds**: Link to issue/PR explaining rationale
- **Avoid**: Comments stating the obvious (e.g., `// increment i`)

```typescript
// ✓ Good: Explains why
// Use RRF to balance keyword and semantic results (k=60 per Cormack et al.)
const fused = reciprocalRankFusion(keywordResults, semanticResults, { k: 60 })

// ✗ Bad: Obvious
// Set title to doc title
doc.title = title
```

### JSDoc for Public APIs
```typescript
/**
 * Generate a URL-safe slug from text.
 * @param text - Input string to slugify
 * @returns Slug with lowercase letters, numbers, and hyphens
 */
export function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-')
}
```

## Testing Strategy

### Unit Tests (Vitest)
- Located next to source files: `*.test.ts`
- One test file per service/utility
- Test happy path + error cases

```typescript
// utils/slug.test.ts
import { describe, it, expect } from 'vitest'
import { slugify } from './slug'

describe('slugify', () => {
  it('converts text to lowercase slug', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('handles multiple spaces', () => {
    expect(slugify('Multiple   Spaces')).toBe('multiple-spaces')
  })

  it('strips special characters', () => {
    expect(slugify('Hello! @World')).toBe('hello-world')
  })
})
```

### Integration Tests
- Test service + database interactions
- Mock Cloudflare bindings
- Use test fixtures

### E2E Tests
- Test full user workflows (login → create → search)
- Run against staging environment
- Planned for Phase 2

## Security Guidelines

### Authentication
- Always use `authGuard` middleware on protected routes
- Verify `tenantId` matches user's tenant on mutations
- Never trust client-provided IDs; use `c.get('user').tenantId`

```typescript
// ✓ Safe: Verify tenant on delete
router.delete('/:id', authGuard, async (c) => {
  const doc = await documentService.getDocument(c.env.DB, c.param('id'), c.get('user').tenantId)
  // Document already filtered by tenant
  await documentService.delete(c.env.DB, doc.id)
  return c.json({ success: true })
})
```

### API Key Hashing
- Always hash API keys with PBKDF2 (100k iterations)
- Store salt separately
- Never log full keys; use prefix only

```typescript
// services/api-key-service.ts
export function hashApiKey(key: string, salt: string): string {
  return crypto.pbkdf2Sync(key, salt, 100_000, 32, 'sha256').toString('hex')
}

export function verifyApiKey(provided: string, hash: string, salt: string): boolean {
  return crypto.timingSafeEqual(Buffer.from(hashApiKey(provided, salt)), Buffer.from(hash))
}
```

### SQL Injection Prevention
- Use Drizzle ORM query builders (never raw SQL strings)
- Parameterize all user inputs
- Drizzle automatically parameterizes

### XSS Prevention
- React auto-escapes JSX; use `dangerouslySetInnerHTML` only for trusted content
- Sanitize Markdown when rendering user content
- ContentSecurityPolicy headers set in API

## Logging & Monitoring

### Backend Logging
```typescript
// Use console.log/error in services; Hono logger handles formatting
console.log('Document created:', { id, tenantId, title })
console.error('Embedding failed:', { docId, error: err.message })
```

### Audit Logging
```typescript
// Always audit mutations
export async function deleteDocument(env: Env, docId: string, userId: string, tenantId: string) {
  // ... delete logic
  await auditLog(env.DB, {
    tenantId,
    userId,
    action: 'document:delete',
    resourceType: 'document',
    resourceId: docId,
    metadata: { title },
  })
}
```

## Performance Considerations

### Backend
- **Pagination**: Always paginate list endpoints (default 20 items)
- **Indexes**: Add to frequently queried columns (tenantId, userId, createdAt)
- **Caching**: Use KV for session tokens, rate limits
- **Async**: Offload embeddings/summaries to Queues

### Frontend
- **Code splitting**: Routes lazy-loaded via React Router
- **Image optimization**: Use Cloudflare image transformation
- **React Query**: Cache all API responses, set appropriate staleTime
- **Debouncing**: Search input debounced 300ms

```typescript
// Debounce search input
const [query, setQuery] = useState('')
const debouncedQuery = useDebounce(query, 300)

// Query only when debounced value changes
const { data: results } = useQuery({
  queryKey: ['search', debouncedQuery],
  queryFn: () => apiClient.get('/search', { params: { q: debouncedQuery } }),
  enabled: debouncedQuery.length > 0,
})
```

## Code Review Checklist

Before submitting a PR:
- [ ] TypeScript strict mode (no any, all types explicit)
- [ ] No console.log in production code (except errors)
- [ ] Error handling for async operations
- [ ] Tests written and passing
- [ ] No hardcoded URLs/keys (use env vars)
- [ ] Comments explain why, not what
- [ ] Prettier formatted
- [ ] No breaking schema changes without migration
- [ ] Database queries use Drizzle ORM
- [ ] Protected routes have authGuard
- [ ] Tenant isolation verified (tenantId filtering)
- [ ] No unused imports or variables

## Linting & Formatting

### Prettier (`.prettierrc`)
```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "tabWidth": 2,
  "printWidth": 100,
  "semi": false
}
```

Run before commit:
```bash
pnpm format
```

### ESLint (`eslint.config.js`)
- TypeScript ESLint recommended rules
- Warnings for unused variables
- Warnings for explicit any

Run locally:
```bash
pnpm lint
```

Run in CI:
```bash
pnpm turbo run lint
```

Fix auto-fixable issues:
```bash
eslint src/ --fix
```

## Conventions Summary

| Item | Standard |
|------|----------|
| Files | kebab-case |
| Variables | camelCase |
| Constants | UPPER_SNAKE_CASE (for true constants) |
| Types | PascalCase |
| Functions | camelCase |
| Components | PascalCase |
| Enums | PascalCase |
| Interfaces | PascalCase (no I prefix) |
| Classes | PascalCase |
| Database tables | snake_case (lowercase_with_underscores) |
| API routes | /api/resource/sub-resource (kebab-case paths) |

## Migration & Schema Changes

### Adding a Column
```bash
# 1. Update schema.ts
# 2. Generate migration
pnpm -F @agentwiki/api db:generate

# 3. Review generated SQL
# 4. Apply locally
pnpm -F @agentwiki/api db:migrate

# 5. Update service layer to use new field
# 6. Test
# 7. Deploy: db:migrate:remote will run on production
```

### Renaming a Column
```typescript
// schema.ts: use new name
export const documents = sqliteTable('documents', {
  summary: text('summary'), // renamed from aiSummary
})

// Generate migration (Drizzle detects the rename)
pnpm -F @agentwiki/api db:generate

// Update code to use new field name everywhere
```

## Deployment Checklist

Before deploying to production:
- [ ] All tests pass
- [ ] Type checking passes
- [ ] Linting passes
- [ ] No breaking schema changes (or migration planned)
- [ ] Secrets rotated (OAuth keys, API secrets)
- [ ] Environment variables set in Cloudflare
- [ ] Database backups verified
- [ ] Monitoring/logging configured
- [ ] CHANGELOG updated
