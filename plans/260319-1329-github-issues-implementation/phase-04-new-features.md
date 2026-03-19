# Phase 04: New Features (#11, #9, #14, #8)

## Priority: P2 | Status: Pending | Effort: 10h

Four new feature pages/systems. Requires new routes, components, and some backend work.

---

## Issue #11: Profile Page

### Problem
No page for users to view/edit their personal info (name, email, avatar).

### Current State
- `useAuth()` hook fetches `GET /api/auth/me` returning `User` object
- `users` table has: `id, email, name, avatarUrl, provider, providerId, createdAt`
- No profile route or component exists

### Files to Create
- `packages/web/src/routes/profile.tsx`

### Files to Modify
- `packages/web/src/app.tsx` — add `/profile` route
- `packages/api/src/routes/auth.ts` — add `PATCH /api/auth/me` for profile updates
- `packages/api/src/services/auth-service.ts` — add `updateUserProfile()` function
- `packages/web/src/components/layout/sidebar.tsx` — add user avatar + link to profile

### Implementation Steps

1. **Backend: Add profile update endpoint**
   In `auth.ts`:
   ```typescript
   authRouter.patch('/me', authGuard, async (c) => {
     const { userId } = c.get('auth')
     const body = await c.req.json() as { name?: string; avatarUrl?: string }
     const updated = await updateUserProfile(c.env, userId, body)
     return c.json(updated)
   })
   ```

   In `auth-service.ts`:
   ```typescript
   export async function updateUserProfile(env: Env, userId: string, input: { name?: string; avatarUrl?: string }) {
     const db = drizzle(env.DB)
     const updates: Record<string, unknown> = {}
     if (input.name !== undefined) updates.name = input.name
     if (input.avatarUrl !== undefined) updates.avatarUrl = input.avatarUrl

     await db.update(users).set(updates).where(eq(users.id, userId))

     const user = await db.select().from(users).where(eq(users.id, userId)).limit(1)
     return user[0]
   }
   ```

2. **Frontend: Create profile page**
   `packages/web/src/routes/profile.tsx`:

   Layout:
   - Header with user avatar (large), name, email
   - Form fields: Name (editable), Email (read-only, from OAuth)
   - Provider badge (Google/GitHub icon)
   - Account created date
   - "Save" button
   - "Back to wiki" link

   Design: Follow existing dark/light theme patterns using `useAppStore().theme`

3. **Add route in `app.tsx`**
   ```typescript
   <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
   ```

4. **Add user menu in sidebar footer**
   In `sidebar.tsx`, next to theme toggle:
   - Show small user avatar or initial
   - Click → navigate to `/profile`
   - Or dropdown with: Profile, Settings, Logout

### Todo
- [ ] Add `PATCH /api/auth/me` endpoint
- [ ] Add `updateUserProfile()` in `auth-service.ts`
- [ ] Create `profile.tsx` route component
- [ ] Add `/profile` route in `app.tsx`
- [ ] Add user avatar/link in sidebar footer
- [ ] Add logout functionality (call `POST /api/auth/logout`)
- [ ] Test: edit name → save → refresh → name persists
- [ ] Test: navigate back to wiki from profile

---

## Issue #9: Admin Settings Page

### Problem
No settings page for workspace admins to manage members and workspace configuration.

### Current State
- `tenantMemberships` table tracks user roles per tenant
- `tenants` table has `name, slug, plan`
- No settings routes or components exist
- Auth system has role checking (`requirePermission`)

### Files to Create
- `packages/web/src/routes/settings.tsx` — main settings layout with tabs
- `packages/web/src/components/settings/members-tab.tsx`
- `packages/web/src/components/settings/workspace-tab.tsx`
- `packages/web/src/components/settings/api-keys-tab.tsx`

### Files to Modify
- `packages/web/src/app.tsx` — add `/settings` route (admin only)
- `packages/api/src/routes/auth.ts` — add member management endpoints
- `packages/web/src/components/layout/sidebar.tsx` — add Settings link

### Backend Endpoints Needed
- `GET /api/members` — list tenant members
- `POST /api/members/invite` — invite user by email
- `PATCH /api/members/:id` — change role
- `DELETE /api/members/:id` — remove member
- `PATCH /api/tenant` — update workspace name/settings

### Implementation Steps

1. **Backend: Member management routes**
   Create `packages/api/src/routes/members.ts`:
   ```typescript
   // GET / — list members with user info (join users + tenant_memberships)
   // POST /invite — invite by email (create membership or send invite)
   // PATCH /:id — update role
   // DELETE /:id — remove membership
   ```

   Create `packages/api/src/services/member-service.ts`:
   ```typescript
   export async function listMembers(env: Env, tenantId: string) {
     const db = drizzle(env.DB)
     return db
       .select({
         id: tenantMemberships.id,
         userId: tenantMemberships.userId,
         role: tenantMemberships.role,
         joinedAt: tenantMemberships.joinedAt,
         userName: users.name,
         userEmail: users.email,
         userAvatar: users.avatarUrl,
       })
       .from(tenantMemberships)
       .innerJoin(users, eq(tenantMemberships.userId, users.id))
       .where(eq(tenantMemberships.tenantId, tenantId))
   }
   ```

2. **Frontend: Settings page with tabs**
   `routes/settings.tsx`:
   - Tab navigation: Members | Workspace | API Keys
   - Restrict access: if `user.role !== 'admin'`, show "Access denied"
   - Use URL hash or state for tab switching: `/settings#members`

3. **Members tab**
   `components/settings/members-tab.tsx`:
   - Table/list of members: avatar, name, email, role, joined date
   - Role dropdown to change roles (admin, editor, viewer)
   - "Remove" button per member (with confirmation)
   - "Invite" button → modal with email input

4. **Workspace tab**
   `components/settings/workspace-tab.tsx`:
   - Workspace name (editable)
   - Workspace slug (read-only)
   - Plan info (read-only)
   - Danger zone: delete workspace (future)

5. **API Keys tab**
   `components/settings/api-keys-tab.tsx`:
   - Reuse existing API key routes (`/api/keys`)
   - List keys: name, prefix, created date, last used
   - Create new key: name input + scope selection
   - Revoke key button

6. **Add Settings link in sidebar**
   In `sidebar.tsx` footer, add a Settings gear icon (only visible to admins):
   ```typescript
   {user?.role === 'admin' && (
     <button onClick={() => navigate('/settings')}>
       <Settings className="h-4 w-4" />
     </button>
   )}
   ```
   Note: Need to pass `role` from auth context — may need to update `useAuth` to include role.

### Todo
- [ ] Create `members.ts` routes (list, invite, update role, remove)
- [ ] Create `member-service.ts` with member CRUD logic
- [ ] Create `settings.tsx` route with tab layout
- [ ] Create `members-tab.tsx` component
- [ ] Create `workspace-tab.tsx` component
- [ ] Create `api-keys-tab.tsx` component
- [ ] Add `/settings` route in `app.tsx`
- [ ] Add Settings link in sidebar (admin only)
- [ ] Update `useAuth` to include user role
- [ ] Test: admin can see/manage members
- [ ] Test: non-admin cannot access settings
- [ ] Test: invite, change role, remove member all work

---

## Issue #14: Keyboard Shortcuts System

### Problem
No configurable keyboard shortcut system. Only Cmd+K (command palette) exists, hardcoded.

### Current State
- `command-palette.tsx` has hardcoded `Cmd+K` listener
- No shortcut registry or configuration system

### Architecture Decision
Custom hook-based system. No external library needed — the app has few shortcuts. Store user-customized shortcuts in `localStorage` (Zustand persist). Default shortcuts work out of the box.

### Files to Create
- `packages/web/src/hooks/use-keyboard-shortcuts.ts` — shortcut registry + listener
- `packages/web/src/stores/shortcut-store.ts` — Zustand store for custom mappings
- `packages/web/src/components/settings/shortcuts-tab.tsx` — config UI (add to Settings page)

### Files to Modify
- `packages/web/src/components/layout/layout.tsx` — mount shortcut listener
- `packages/web/src/components/command-palette/command-palette.tsx` — use shortcut system instead of hardcoded listener
- `packages/web/src/routes/settings.tsx` — add Shortcuts tab

### Default Shortcuts
| Shortcut | Action | ID |
|----------|--------|----|
| Cmd/Ctrl+K | Open command palette | `command-palette` |
| Cmd/Ctrl+S | Save document | `save-document` |
| Cmd/Ctrl+N | New document | `new-document` |
| Cmd/Ctrl+W | Close current tab | `close-tab` |
| Cmd/Ctrl+Shift+[ | Previous tab | `prev-tab` |
| Cmd/Ctrl+Shift+] | Next tab | `next-tab` |
| Cmd/Ctrl+\ | Toggle sidebar | `toggle-sidebar` |
| Cmd/Ctrl+. | Toggle metadata panel | `toggle-metadata` |
| Escape | Close modals/palette | `escape` |

### Implementation Steps

1. **Create shortcut store**
   `stores/shortcut-store.ts`:
   ```typescript
   interface ShortcutMapping {
     id: string
     label: string
     keys: string // e.g., "ctrl+k", "meta+shift+["
     category: string // 'navigation', 'editing', 'panels'
   }

   interface ShortcutState {
     customMappings: Record<string, string> // id → keys override
     setMapping: (id: string, keys: string) => void
     resetMapping: (id: string) => void
     resetAll: () => void
   }
   ```

2. **Create `useKeyboardShortcuts` hook**
   `hooks/use-keyboard-shortcuts.ts`:
   ```typescript
   // Registers a global keydown listener
   // Matches against registered shortcuts (default + custom overrides)
   // Calls the associated action handler
   // Prevents default browser behavior for matched shortcuts

   export function useKeyboardShortcuts(shortcuts: ShortcutDefinition[]) {
     useEffect(() => {
       const handler = (e: KeyboardEvent) => {
         for (const shortcut of shortcuts) {
           if (matchesShortcut(e, shortcut.keys)) {
             e.preventDefault()
             shortcut.action()
             return
           }
         }
       }
       document.addEventListener('keydown', handler)
       return () => document.removeEventListener('keydown', handler)
     }, [shortcuts])
   }
   ```

3. **Mount in Layout**
   In `layout.tsx`:
   ```typescript
   const shortcuts = useShortcutDefinitions() // builds list from store + defaults
   useKeyboardShortcuts(shortcuts)
   ```

4. **Migrate command palette shortcut**
   Remove hardcoded `Cmd+K` listener from `command-palette.tsx`. Instead, register via the shortcut system and pass a `setOpen` callback.

5. **Settings UI for customization**
   `components/settings/shortcuts-tab.tsx`:
   - List all shortcuts grouped by category
   - Each row: label | current keybinding | "Edit" button
   - "Edit" mode: listen for key combo, save to store
   - "Reset to default" per shortcut + "Reset all" button

### Todo
- [ ] Create `shortcut-store.ts` with default mappings
- [ ] Create `use-keyboard-shortcuts.ts` hook
- [ ] Define default shortcuts (9 shortcuts above)
- [ ] Mount shortcut listener in `layout.tsx`
- [ ] Migrate Cmd+K from command palette to shortcut system
- [ ] Implement Cmd+S (save), Cmd+N (new doc), Cmd+W (close tab)
- [ ] Implement tab navigation shortcuts
- [ ] Implement panel toggle shortcuts
- [ ] Create `shortcuts-tab.tsx` settings UI
- [ ] Add Shortcuts tab to Settings page
- [ ] Test: all default shortcuts work
- [ ] Test: customized shortcut persists across sessions
- [ ] Test: conflicting shortcuts are prevented

---

## Issue #8: Browse Documents by Categories or Tags

### Problem
No way to browse/filter documents by category or tag outside of search.

### Current State
- Documents have `category` field and `documentTags` many-to-many table
- `listDocuments` accepts `category` and `tag` filter params
- Tags are displayed/editable in `tag-editor.tsx` (metadata panel)
- No dedicated browse view

### Files to Create
- `packages/web/src/components/sidebar/browse-panel.tsx` — browsing UI in sidebar
- `packages/web/src/hooks/use-tags.ts` — hook to fetch all tags (if not exists)

### Files to Modify
- `packages/web/src/components/layout/sidebar.tsx` — add Browse section/toggle
- `packages/web/src/components/sidebar/folder-tree.tsx` — integrate browse filters
- `packages/api/src/routes/tags.ts` — verify `GET /api/tags` returns all tags

### Implementation Steps

1. **Verify tag listing endpoint**
   Check `tags.ts` route returns: `GET /api/tags` → `{ tags: string[] }`
   Should aggregate all unique tags across tenant's documents.

2. **Create `use-tags.ts` hook** (if not exists)
   ```typescript
   export function useTags() {
     return useQuery<{ tags: string[] }>({
       queryKey: ['tags'],
       queryFn: () => apiClient.get('/api/tags'),
     })
   }
   ```

3. **Add browse section to sidebar**
   In `sidebar.tsx`, between search and folder tree:
   - Add a collapsible "Browse" section with two sub-views:
     - **Categories**: List unique categories, click to filter
     - **Tags**: Tag cloud/list, click to filter

   ```typescript
   // "Browse by" toggle section
   <div className="px-2 py-1">
     <button onClick={toggleBrowse}>
       <Tags className="h-3.5 w-3.5" /> Browse
     </button>
   </div>
   {showBrowse && (
     <BrowsePanel
       onSelectCategory={(cat) => setFilter({ type: 'category', value: cat })}
       onSelectTag={(tag) => setFilter({ type: 'tag', value: tag })}
       onClear={() => setFilter(null)}
     />
   )}
   ```

4. **Create `browse-panel.tsx`**
   ```typescript
   // Fetch tags and categories
   // Render as clickable chips/badges
   // Active filter highlighted
   // Clear filter button
   ```

5. **Pass filter to FolderTree**
   When a category/tag filter is active:
   - Replace folder tree with filtered document list
   - Use `useDocuments({ category: filter.value })` or `useDocuments({ tag: filter.value })`
   - Show breadcrumb: "Category: Engineering" with X to clear

6. **Get unique categories from backend**
   Add `GET /api/categories` endpoint or derive from documents:
   ```typescript
   // In a new route or in documents.ts
   router.get('/categories', authGuard, async (c) => {
     const { tenantId } = c.get('auth')
     const db = drizzle(c.env.DB)
     const result = await db
       .selectDistinct({ category: documents.category })
       .from(documents)
       .where(and(eq(documents.tenantId, tenantId), isNull(documents.deletedAt), sql`${documents.category} IS NOT NULL`))
     return c.json({ categories: result.map(r => r.category) })
   })
   ```

### Todo
- [ ] Verify/create `GET /api/tags` endpoint
- [ ] Add `GET /api/categories` endpoint
- [ ] Create `use-tags.ts` hook
- [ ] Create `use-categories.ts` hook (or combined browse hook)
- [ ] Create `browse-panel.tsx` component
- [ ] Add browse section to sidebar
- [ ] Pass active filter to folder tree / document list
- [ ] Show active filter breadcrumb with clear button
- [ ] Test: click tag → shows filtered docs
- [ ] Test: click category → shows filtered docs
- [ ] Test: clear filter → returns to normal tree view

---

## Success Criteria
- Profile page allows viewing/editing user info
- Settings page (admin only) manages members, workspace, API keys
- Keyboard shortcuts work and are customizable
- Users can browse documents by category or tag from sidebar
