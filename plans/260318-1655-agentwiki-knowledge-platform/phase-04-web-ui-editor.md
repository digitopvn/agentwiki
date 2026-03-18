---
title: "Phase 4: Web UI & Editor"
status: pending
priority: P1
effort: 32h
---

# Phase 4: Web UI & Editor

## Context Links
- [Cloudflare Research — BlockNote & Pages](../reports/researcher-01-260318-1655-cloudflare-ecosystem.md)
- [Phase 3 — API Endpoints](./phase-03-core-api-database.md)

## Overview
Three-panel layout (folder browser, editor with tabs, metadata panel). BlockNote editor integration. React Router, TanStack Query, Cmd+K palette, dark mode, responsive design.

## Key Insights
<!-- Updated: Validation Session 1 - Dual storage, no real-time collab, conflict detection -->
- BlockNote built on Tiptap/ProseMirror — battle-tested, Notion-like UX out of box
- **Dual storage**: save both BlockNote JSON + Markdown on every save (sync bidirectionally)
- **No real-time collab for MVP** — single-user editing with simple conflict detection (last-write-wins + warning if stale)
- TanStack Query for server state — handles caching, refetching, optimistic updates
- React Router v7 for client-side routing with lazy-loaded routes
- Zustand for client state (active tabs, sidebar collapse, theme)
- Tailwind CSS v4 + shadcn/ui for consistent, accessible components
- Debounced auto-save (1s after last edit) — no explicit save button

## Requirements

### Functional
- Three-panel layout: left sidebar (folders), center (editor + tabs), right (metadata)
- Folder tree: collapsible, drag-drop reorder, context menu (rename, delete, new doc)
- Tab system: open multiple docs, switch tabs, close tabs, unsaved indicator
- BlockNote editor: rich text, markdown shortcuts, slash commands, drag-drop blocks
- Metadata panel: title, category dropdown, tag input, sharing settings, version history
- Cmd/Ctrl+K: search docs, quick actions (new doc, navigate)
- Dark mode toggle (persisted in localStorage)
- Responsive: sidebar collapsible on mobile, single-panel mode

### Non-Functional
- First contentful paint < 1.5s
- Editor interaction latency < 16ms (60fps)
- Bundle size < 300KB gzipped (main chunk)

## Architecture

### Component Tree
```
<App>
  <AuthProvider>
    <QueryClientProvider>
      <ThemeProvider>
        <Router>
          <Layout>                        ← 3-panel shell
            <Sidebar>                     ← Left panel
              <WorkspaceSelector />
              <FolderTree />
              <SidebarFooter />
            </Sidebar>
            <MainPanel>                   ← Center panel
              <TabBar />
              <EditorArea>
                <BlockNoteEditor />       ← or WelcomeScreen
              </EditorArea>
            </MainPanel>
            <MetadataPanel>               ← Right panel
              <DocumentProperties />
              <TagEditor />
              <SharingSettings />
              <VersionHistory />
            </MetadataPanel>
          </Layout>
          <CommandPalette />              ← Cmd+K overlay
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  </AuthProvider>
</App>
```

### State Management
```
Server State (TanStack Query):
  - documents, folders, categories, tags
  - Cached with staleTime: 30s
  - Optimistic updates for create/edit/delete

Client State (Zustand):
  - openTabs: Tab[]
  - activeTabId: string
  - sidebarCollapsed: boolean
  - metadataPanelCollapsed: boolean
  - theme: 'light' | 'dark' | 'system'
```

### File Structure
```
packages/web/src/
├── main.tsx
├── app.tsx                       # Router + providers
├── routes/
│   ├── login.tsx                 # Auth page
│   ├── dashboard.tsx             # Main 3-panel layout
│   └── share.tsx                 # Public share view (no auth)
├── components/
│   ├── layout/
│   │   ├── layout.tsx            # 3-panel shell
│   │   ├── sidebar.tsx           # Left panel container
│   │   ├── main-panel.tsx        # Center panel container
│   │   └── metadata-panel.tsx    # Right panel container
│   ├── sidebar/
│   │   ├── folder-tree.tsx       # Recursive folder tree
│   │   ├── folder-node.tsx       # Single folder item
│   │   ├── workspace-selector.tsx
│   │   └── sidebar-footer.tsx
│   ├── editor/
│   │   ├── editor.tsx            # BlockNote wrapper
│   │   ├── tab-bar.tsx           # Tab management
│   │   ├── tab-item.tsx          # Single tab
│   │   └── welcome-screen.tsx    # Empty state
│   ├── metadata/
│   │   ├── document-properties.tsx
│   │   ├── tag-editor.tsx        # Tag input with autocomplete
│   │   ├── sharing-settings.tsx
│   │   └── version-history.tsx
│   ├── command-palette/
│   │   └── command-palette.tsx   # Cmd+K modal
│   └── ui/                       # shadcn/ui components
│       ├── button.tsx
│       ├── dialog.tsx
│       ├── dropdown-menu.tsx
│       ├── input.tsx
│       ├── toast.tsx
│       └── ...
├── hooks/
│   ├── use-documents.ts          # TanStack Query hooks for docs
│   ├── use-folders.ts            # Folder tree queries/mutations
│   ├── use-auth.ts               # Auth state + actions
│   ├── use-tabs.ts               # Tab management (Zustand)
│   └── use-theme.ts              # Theme toggle
├── stores/
│   └── app-store.ts              # Zustand store (tabs, sidebar, theme)
├── lib/
│   ├── api-client.ts             # Fetch wrapper with auth headers
│   ├── query-client.ts           # TanStack Query config
│   └── utils.ts                  # cn(), formatDate, etc.
└── styles/
    └── globals.css               # Tailwind imports + custom vars
```

## Related Code Files

### Files to Create
All files listed in the file structure above (~40 files).

### Dependencies to Install
```json
{
  "dependencies": {
    "react": "^19",
    "react-dom": "^19",
    "react-router-dom": "^7",
    "@tanstack/react-query": "^5",
    "@blocknote/core": "^0.20",
    "@blocknote/react": "^0.20",
    "@blocknote/mantine": "^0.20",
    "zustand": "^5",
    "cmdk": "^1",
    "tailwindcss": "^4",
    "@dnd-kit/core": "^6",
    "@dnd-kit/sortable": "^8",
    "lucide-react": "^0.400",
    "class-variance-authority": "^0.7",
    "clsx": "^2",
    "tailwind-merge": "^2",
    "date-fns": "^4"
  }
}
```

## Implementation Steps

### 1. Project Foundation (3h)
1. Install all dependencies
2. Configure Tailwind CSS v4 with custom theme (colors, spacing, dark mode)
3. Setup shadcn/ui: `npx shadcn-ui@latest init` — button, input, dialog, dropdown-menu, toast, popover, command
4. Create `lib/api-client.ts`:
   ```typescript
   const API_BASE = import.meta.env.VITE_API_URL || '/api'
   export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
     const res = await fetch(`${API_BASE}${path}`, {
       ...options,
       credentials: 'include', // send cookies
       headers: { 'Content-Type': 'application/json', ...options?.headers }
     })
     if (!res.ok) throw new ApiError(res.status, await res.json())
     return res.json()
   }
   ```
5. Create `lib/query-client.ts` with default staleTime: 30s, retry: 1

### 2. Auth Flow (2h)
1. `routes/login.tsx`: Login page with Google + GitHub buttons
   - Click → redirect to `/api/auth/google` (or github)
   - After callback, API sets cookie, redirects to `/`
2. `hooks/use-auth.ts`:
   - `useAuth()` — fetch `/api/auth/me` to get current user
   - `useLogout()` — POST `/api/auth/logout`, clear query cache, redirect to login
3. `app.tsx`: ProtectedRoute wrapper — redirect to login if not authenticated

### 3. Three-Panel Layout Shell (3h)
1. `components/layout/layout.tsx`:
   - CSS Grid: `grid-template-columns: var(--sidebar-w) 1fr var(--metadata-w)`
   - Sidebar: 260px default, collapsible to 0
   - Metadata panel: 300px default, collapsible
   - Resizable handles (optional: CSS resize or drag handle)
2. Responsive: < 768px → single panel, hamburger for sidebar
3. Keyboard shortcuts: `Ctrl+\` toggle sidebar, `Ctrl+Shift+\` toggle metadata

### 4. Folder Tree (4h)
1. `hooks/use-folders.ts`:
   - `useFolders()` — GET /api/folders, returns tree
   - `useCreateFolder()` — POST /api/folders
   - `useMoveFolder()` — PUT /api/folders/:id
   - `useDeleteFolder()` — DELETE /api/folders/:id
2. `components/sidebar/folder-tree.tsx`:
   - Recursive render of folder nodes
   - Expand/collapse state (local, stored in Zustand)
   - Click folder → filter documents in that folder
   - Click document → open in editor tab
3. `components/sidebar/folder-node.tsx`:
   - Icon (folder open/closed), name, count badge
   - Context menu (right-click): New Document, New Subfolder, Rename, Delete
   - Drag-drop via @dnd-kit for reordering
4. Document items within folders: show doc title, icon, unsaved dot

### 5. Tab Management (3h)
1. `stores/app-store.ts` (Zustand):
   ```typescript
   interface AppState {
     tabs: Tab[]
     activeTabId: string | null
     openTab: (doc: Document) => void
     closeTab: (tabId: string) => void
     setActiveTab: (tabId: string) => void
     markTabDirty: (tabId: string, dirty: boolean) => void
   }
   ```
2. `components/editor/tab-bar.tsx`:
   - Horizontal scrollable tabs
   - Active tab highlighted
   - Close button per tab (with unsaved confirmation)
   - Middle-click to close
   - Drag to reorder tabs
3. `components/editor/tab-item.tsx`: title, dirty indicator (dot), close button

### 6. BlockNote Editor Integration (6h)
1. `components/editor/editor.tsx`:
   ```typescript
   import { useCreateBlockNote } from '@blocknote/react'
   import { BlockNoteView } from '@blocknote/mantine'
   import '@blocknote/mantine/style.css'

   export function Editor({ document, onSave }) {
     const editor = useCreateBlockNote({
       initialContent: document.blocks, // parsed from markdown/JSON
     })

     // Auto-save: debounce 1s after last change
     useEffect(() => {
       const handler = debounce(() => {
         const blocks = editor.document
         onSave(blocks)
       }, 1000)
       // subscribe to changes
       return () => handler.cancel()
     }, [editor])

     return <BlockNoteView editor={editor} theme={theme} />
   }
   ```
2. Content format decision: store as BlockNote JSON in `content` field
   - Convert markdown → BlockNote blocks on import
   - Convert BlockNote blocks → markdown on export/API response
   - BlockNote has built-in markdown ↔ blocks conversion
3. Custom slash commands: `/heading`, `/todo`, `/callout`, `/code`, `/image`
4. Custom blocks (if needed): callout, embed, table of contents

### 7. Metadata Panel (4h)
1. `components/metadata/document-properties.tsx`:
   - Title (editable inline)
   - Category dropdown (fetch from /api/categories)
   - Created/updated timestamps
   - Word count, reading time
   - Slug display
2. `components/metadata/tag-editor.tsx`:
   - Tag input with autocomplete (fetch existing tags)
   - Add/remove tags
   - Display as pills
3. `components/metadata/sharing-settings.tsx`:
   - Access level toggle: Private / Specific / Public
   - Share link generation (if public)
   - Email invite list (if specific)
4. `components/metadata/version-history.tsx`:
   - List recent versions with timestamp + author
   - Click to preview version content
   - Restore button (creates new version from old content)

### 8. Command Palette (3h)
1. `components/command-palette/command-palette.tsx` using `cmdk`:
   ```typescript
   import { Command } from 'cmdk'
   // Cmd+K to open
   // Sections: Recent, Search Results, Actions
   // Actions: New Document, New Folder, Toggle Theme, Settings
   ```
2. Search integration: type to search docs via `/api/documents?q=...`
3. Quick navigation: show recent docs, folders
4. Keyboard: arrow keys to navigate, Enter to select, Esc to close

### 9. Dark Mode + Theme (2h)
1. `hooks/use-theme.ts`:
   - Read from localStorage, default to system
   - Apply `dark` class to `<html>` element
   - Tailwind dark: variant handles all styling
2. Toggle button in sidebar footer
3. BlockNote theme sync: pass `theme` prop to `<BlockNoteView>`

### 10. Welcome Screen + Empty States (2h)
1. `components/editor/welcome-screen.tsx`:
   - Show when no tabs open
   - Quick actions: New Document, Open Recent, Search
   - Keyboard shortcuts cheatsheet
2. Empty folder state, empty search results, loading skeletons

## Todo List
- [ ] Install dependencies + configure Tailwind + shadcn/ui
- [ ] Create API client + TanStack Query setup
- [ ] Implement auth flow (login page, useAuth hook, protected routes)
- [ ] Build 3-panel layout shell (responsive, collapsible)
- [ ] Implement folder tree with recursive rendering
- [ ] Add drag-drop folder reordering (@dnd-kit)
- [ ] Implement tab management (Zustand store + TabBar)
- [ ] Integrate BlockNote editor with auto-save
- [ ] Implement markdown ↔ BlockNote blocks conversion
- [ ] Build metadata panel (properties, tags, sharing, versions)
- [ ] Implement Cmd+K command palette (cmdk)
- [ ] Add dark mode toggle + theme persistence
- [ ] Create welcome screen + empty states
- [ ] Add loading skeletons for async content
- [ ] Responsive design testing (mobile, tablet)

## Success Criteria
- Login via Google/GitHub redirects and returns authenticated
- Folder tree renders, expands/collapses, supports drag-drop
- Opening document creates tab, displays in BlockNote editor
- Edits auto-save after 1s debounce
- Multiple tabs open simultaneously, switch between them
- Metadata panel shows/edits document properties
- Cmd+K opens, searches docs, navigates
- Dark mode works across all components including editor
- Responsive: usable on mobile (single panel mode)

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| BlockNote bundle size too large | Medium | Medium | Lazy-load editor; code-split route |
| BlockNote ↔ markdown lossy conversion | Medium | High | Store as BlockNote JSON; markdown is export format |
| @dnd-kit complexity for nested tree | Medium | Medium | Start without drag-drop; add incrementally |
| React 19 compatibility with libs | Low | High | Test all deps against RC; fallback to React 18 |

## Security Considerations
- API client sends credentials via httpOnly cookies — no token in JS
- No `dangerouslySetInnerHTML` — BlockNote handles rendering safely
- CSP headers to prevent XSS in Cloudflare Pages headers config
- Sanitize any user-generated HTML before rendering

## Next Steps
- Phase 5: Storage, Search & AI (adds image upload to editor, search in Cmd+K)
- Phase 6: Sharing & Publishing (extends metadata panel sharing section)
