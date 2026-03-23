# Phase 02: UI Enhancements (#15, #5, #6)

## Priority: P1 | Status: Pending | Effort: 5h

Three frontend-only enhancements. No new backend endpoints needed.

---

## Issue #15: Deep Linking — URL matches current document

### Problem
URL stays at `/` regardless of which document is open. Users can't share/bookmark a doc URL. Browser back/forward don't work.

### Root Cause
`app.tsx` only defines a single `/` route for the Layout. The `openTab`/`setActiveTab` store actions don't interact with the URL.

### Files to Modify
- `packages/web/src/app.tsx` — add `/doc/:slug` route
- `packages/web/src/stores/app-store.ts` — no changes needed (URL drives state, not store)
- `packages/web/src/components/layout/main-panel.tsx` — read doc slug from URL params
- `packages/web/src/components/layout/layout.tsx` — minor adjustments
- `packages/web/src/components/sidebar/folder-tree.tsx` — use `navigate()` instead of direct store calls
- `packages/web/src/components/sidebar/folder-node.tsx` — use `navigate()` for doc clicks
- `packages/web/src/components/command-palette/command-palette.tsx` — use `navigate()` on doc select
- `packages/web/src/components/editor/welcome-screen.tsx` — use `navigate()` on new doc

### Architecture Decision
**URL-driven tab opening**: When a doc is opened, navigate to `/doc/:slug`. The Layout component reads the slug from URL params and opens the tab. This keeps URL as single source of truth.

### Implementation Steps

1. **Add parameterized route in `app.tsx`**
   ```typescript
   <Route
     path="/doc/:slug"
     element={
       <RequireAuth>
         <Layout />
       </RequireAuth>
     }
   />
   ```
   Keep the `/` route as-is for the welcome screen.

2. **Create `useDocumentNavigation` hook**
   New file: `packages/web/src/hooks/use-document-navigation.ts`
   ```typescript
   import { useNavigate } from 'react-router-dom'
   import { useAppStore } from '../stores/app-store'

   export function useDocumentNavigation() {
     const navigate = useNavigate()
     const { openTab, setActiveTab } = useAppStore()

     const openDocument = (doc: { id: string; title: string; slug: string }) => {
       const tabId = `tab-${doc.id}`
       openTab({ id: tabId, documentId: doc.id, title: doc.title })
       setActiveTab(tabId)
       navigate(`/doc/${doc.slug}`)
     }

     return { openDocument }
   }
   ```

3. **Update Layout to read URL params**
   In `layout.tsx` or a new wrapper, use `useParams()` to get the slug. If a slug is present and no tab is open for that doc, fetch doc by slug and open it.

4. **Add backend: get doc by slug**
   Need a new API endpoint or query param: `GET /api/documents?slug=my-doc`
   Alternatively, add `GET /api/documents/by-slug/:slug` route.
   - Add to `document-service.ts`: `getDocumentBySlug(env, tenantId, slug)`
   - Add route in `documents.ts`

5. **Update all doc-opening call sites** to use `useDocumentNavigation().openDocument()`:
   - `folder-tree.tsx` `handleOpenDoc`
   - `folder-node.tsx` `handleOpenDoc`
   - `command-palette.tsx` `openDocument`
   - `welcome-screen.tsx` `handleNewDoc`

6. **Update tab close** to navigate away if closing the active doc:
   - In `app-store.ts` `closeTab`, emit an event or let the component react
   - When active tab is closed, navigate to `/` if no other tabs remain, or to the next tab's doc URL

7. **Ensure `listDocuments` returns `slug`** — already does (checked in `document-service.ts`)

### Todo
- [ ] Add `/doc/:slug` route in `app.tsx`
- [ ] Create `use-document-navigation.ts` hook
- [ ] Add `getDocumentBySlug` to `document-service.ts`
- [ ] Add `GET /api/documents/by-slug/:slug` route
- [ ] Update Layout to hydrate tab from URL slug on mount
- [ ] Update all doc-opening call sites to use navigation hook
- [ ] Handle tab close → URL navigation
- [ ] Handle browser back/forward (popstate)
- [ ] Test: open doc, copy URL, paste in new tab → same doc opens

---

## Issue #5: Command Palette — Improve Document Search

### Problem
Command palette search is basic — it uses `useDocuments({ search: query })` which triggers the list endpoint with a LIKE filter. Need better search UX.

### Current State
`command-palette.tsx` already:
- Has search input with query state
- Passes `search` param to `useDocuments`
- Renders matching docs
- Has quick actions (new doc, new folder)

### What's Missing
- Search is not using the hybrid search API (`/api/search`)
- No snippet/preview in results
- No debounce on search query
- Should show recent documents when query is empty

### Files to Modify
- `packages/web/src/components/command-palette/command-palette.tsx`
- `packages/web/src/hooks/use-documents.ts` (or create `use-search.ts`)

### Implementation Steps

1. **Create `use-search.ts` hook**
   New file: `packages/web/src/hooks/use-search.ts`
   ```typescript
   import { useQuery } from '@tanstack/react-query'
   import { apiClient } from '../lib/api-client'

   interface SearchResult {
     id: string
     title: string
     slug: string
     snippet?: string
     score?: number
     category?: string
   }

   export function useSearch(query: string) {
     return useQuery<{ results: SearchResult[] }>({
       queryKey: ['search', query],
       queryFn: () => apiClient.get(`/api/search?q=${encodeURIComponent(query)}&type=hybrid&limit=10`),
       enabled: query.length >= 2,
       staleTime: 30_000,
     })
   }
   ```

2. **Add debounce to command palette**
   ```typescript
   const [rawQuery, setRawQuery] = useState('')
   const debouncedQuery = useDebounce(rawQuery, 250)
   ```
   Create `use-debounce.ts` utility hook if not exists.

3. **Show recent docs when no query**
   Use existing `useDocuments({ limit: 5 })` for "Recent documents" section when query is empty.

4. **Display search snippets**
   Render `result.snippet` or `result.summary` below the title in search results.

5. **Update command palette to use search hook**
   Replace `useDocuments({ search: query })` with `useSearch(debouncedQuery)`.

6. **Update doc opening to use navigation hook** (ties into #15)

### Todo
- [ ] Create `use-search.ts` hook using `/api/search` endpoint
- [ ] Create `use-debounce.ts` utility hook
- [ ] Update command palette to use debounced search
- [ ] Show recent docs when query is empty
- [ ] Display snippets in search results
- [ ] Connect doc opening to navigation hook (#15)

---

## Issue #6: Left Sidebar — Context Menu on Document Right-Click

### Problem
Context menu exists on **folders** (in `folder-node.tsx`) but NOT on individual **documents** in the sidebar. Users can't right-click a document to rename, delete, move, etc.

### Current State
- `folder-node.tsx`: Has full context menu (New doc, New subfolder, Rename, Delete)
- Document items in `folder-tree.tsx` and `folder-node.tsx`: No context menu, only click-to-open

### Files to Modify
- `packages/web/src/components/sidebar/folder-tree.tsx` — add context menu to root-level docs
- `packages/web/src/components/sidebar/folder-node.tsx` — add context menu to folder-level docs
- `packages/web/src/hooks/use-folders.ts` — verify move-to-folder mutation exists

### Implementation Steps

1. **Create `DocumentContextMenu` component**
   New file: `packages/web/src/components/sidebar/document-context-menu.tsx`

   Menu items:
   - **Open** — open doc in tab
   - **Open in new tab** — open without switching
   - **Rename** — prompt for new title, call `updateDocument`
   - **Move to folder** — show folder picker submenu or prompt
   - **Delete** — confirm and call `deleteDocument`

   ```typescript
   interface DocumentContextMenuProps {
     doc: { id: string; title: string; folderId?: string | null }
     position: { x: number; y: number }
     onClose: () => void
   }
   ```

2. **Extract shared `ContextMenuItem` component**
   The `ContextMenuItem` currently lives inside `folder-node.tsx`. Extract to shared file:
   `packages/web/src/components/sidebar/context-menu-item.tsx`

3. **Add `onContextMenu` to document items**
   In both `folder-tree.tsx` (root docs) and `folder-node.tsx` (folder docs):
   ```typescript
   onContextMenu={(e) => {
     e.preventDefault()
     setDocContextMenu({ doc, x: e.clientX, y: e.clientY })
   }}
   ```

4. **Implement rename via `useUpdateDocument`**
   ```typescript
   const handleRename = async () => {
     const newTitle = window.prompt('Rename document:', doc.title)
     if (!newTitle?.trim() || newTitle === doc.title) return
     await updateDocument.mutateAsync({ id: doc.id, title: newTitle.trim() })
   }
   ```

5. **Implement move-to-folder**
   - Use `useUpdateDocument` with `folderId` field
   - Simple approach: prompt with folder ID or show a small folder picker dropdown
   - Advanced (later): integrate with drag & drop from Phase 3

6. **Implement delete via `useDeleteDocument`**
   ```typescript
   const handleDelete = async () => {
     if (!window.confirm(`Delete "${doc.title}"?`)) return
     await deleteDocument.mutateAsync(doc.id)
     // Close tab if open
   }
   ```

### Todo
- [ ] Extract `ContextMenuItem` to shared component file
- [ ] Create `DocumentContextMenu` component
- [ ] Add right-click handler to doc items in `folder-tree.tsx`
- [ ] Add right-click handler to doc items in `folder-node.tsx`
- [ ] Implement Rename action
- [ ] Implement Move to folder action
- [ ] Implement Delete action (with tab close)
- [ ] Test: right-click doc → menu appears with correct options
- [ ] Test: rename works and sidebar updates
- [ ] Test: delete removes doc and closes tab if open

---

## Success Criteria
- URL updates when switching documents; deep links work
- Command palette uses hybrid search with snippets and debounce
- Right-clicking documents in sidebar shows context menu with CRUD actions
