# Phase 03: Core Feature Fixes (#4, #3, #16)

## Priority: P1 | Status: Pending | Effort: 8h

Backend+frontend work. Requires a new dependency (`@dnd-kit`) and schema-level logic changes for versioning.

---

## Issue #4: Drag & Drop Documents into Folders

### Problem
Cannot drag documents into folders in the left sidebar. No DND library is installed.

### Current State
- `folder-tree.tsx` renders root docs as plain `<div>` with click handlers
- `folder-node.tsx` renders folder children and nested docs as plain `<div>`
- No DND library in `package.json`

### Architecture Decision
Use `@dnd-kit/core` — lightweight, React 19 compatible, tree-friendly, well-maintained. No need for `@dnd-kit/sortable` since we only need drag-to-folder (not reordering).

### Files to Modify
- `packages/web/package.json` — add `@dnd-kit/core` dependency
- `packages/web/src/components/sidebar/folder-tree.tsx` — wrap in `DndContext`
- `packages/web/src/components/sidebar/folder-node.tsx` — make folders droppable, docs draggable
- `packages/web/src/hooks/use-documents.ts` — verify `useUpdateDocument` supports `folderId` (already does)

### Implementation Steps

1. **Install dependency**
   ```bash
   pnpm -F @agentwiki/web add @dnd-kit/core
   ```

2. **Wrap `FolderTree` in `DndContext`**
   In `folder-tree.tsx`:
   ```typescript
   import { DndContext, DragEndEvent, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'

   // Inside FolderTree component:
   const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
   const [activeDoc, setActiveDoc] = useState<{ id: string; title: string } | null>(null)

   const handleDragEnd = async (event: DragEndEvent) => {
     const { active, over } = event
     setActiveDoc(null)
     if (!over || active.id === over.id) return

     const docId = String(active.id)
     const folderId = String(over.id)

     await updateDocument.mutateAsync({ id: docId, folderId })
   }
   ```

3. **Make document items draggable**
   Create wrapper using `useDraggable` hook:
   ```typescript
   // In a new component or inline in folder-tree/folder-node
   import { useDraggable } from '@dnd-kit/core'

   function DraggableDoc({ doc, children }) {
     const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: doc.id })
     // Apply transform style, pass listeners to the element
   }
   ```

4. **Make folders droppable**
   In `folder-node.tsx`, use `useDroppable`:
   ```typescript
   import { useDroppable } from '@dnd-kit/core'

   // Inside FolderNode:
   const { setNodeRef, isOver } = useDroppable({ id: folder.id })
   // Highlight folder when dragged over: add bg-brand-500/10 when isOver
   ```

5. **Add root drop zone** for moving docs OUT of folders:
   - Add a droppable zone with id `"root"` at the top of the tree
   - When dropped on root, set `folderId: null`

6. **Drag overlay** for visual feedback:
   ```typescript
   <DragOverlay>
     {activeDoc ? <DragPreview title={activeDoc.title} /> : null}
   </DragOverlay>
   ```

7. **Handle folder-to-folder** (optional, lower priority):
   - Also make folders draggable if backend supports `PATCH /api/folders/:id` with `parentId`
   - Already supported: `useUpdateFolder` exists with `parentId` param

### Todo
- [ ] Install `@dnd-kit/core`
- [ ] Wrap `FolderTree` in `DndContext` with pointer sensor
- [ ] Make document items draggable (root + nested)
- [ ] Make folder items droppable with visual highlight
- [ ] Add root drop zone for removing from folders
- [ ] Add DragOverlay for drag preview
- [ ] Handle `handleDragEnd` → call `updateDocument({ folderId })`
- [ ] Invalidate queries on successful move
- [ ] Test: drag doc into folder → doc moves
- [ ] Test: drag doc out of folder to root → doc moves to root
- [ ] Test: drag doc between folders → doc moves

---

## Issue #3: Smart Version Control

### Problem
Every debounced save (1s after typing) creates a new version. A user typing for 5 minutes generates ~300 versions. Wasteful and makes version history unusable.

### Current State
- `editor.tsx` line 51: debounced save fires after 1s of inactivity
- `document-service.ts` `updateDocument()` line 218: creates a version on EVERY call unconditionally
- `documentVersions` table: append-only, no dedup logic

### Architecture Decision
**Content-hash deduplication + time-gating**:
1. Hash the content (SHA-256 of markdown text) before saving version
2. Only create version if content hash differs from last version AND at least 5 minutes have passed since last version
3. Frontend: separate "content save" (frequent, no version) from "version checkpoint" (manual or time-gated)

### Files to Modify
- `packages/api/src/services/document-service.ts` — add version gating logic
- `packages/api/src/routes/documents.ts` — optionally accept `skipVersion` param
- `packages/web/src/components/editor/editor.tsx` — no changes needed (backend handles it)

### Implementation Steps

1. **Backend: Add content-hash + time-gate to `updateDocument()`**

   In `document-service.ts`:
   ```typescript
   // Helper: hash content for comparison
   async function contentHash(content: string): Promise<string> {
     const encoder = new TextEncoder()
     const data = encoder.encode(content)
     const hashBuffer = await crypto.subtle.digest('SHA-256', data)
     return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
   }
   ```

   Modify `updateDocument()`:
   ```typescript
   // Get last version
   const lastVersion = await db
     .select({ version: documentVersions.version, content: documentVersions.content, createdAt: documentVersions.createdAt })
     .from(documentVersions)
     .where(eq(documentVersions.documentId, docId))
     .orderBy(desc(documentVersions.version))
     .limit(1)

   const shouldCreateVersion = await shouldVersion(current[0], lastVersion[0], input)

   if (shouldCreateVersion) {
     // ... existing version creation logic
   }
   ```

2. **Version decision logic**
   ```typescript
   async function shouldVersion(
     currentDoc: typeof documents.$inferSelect,
     lastVersion: { content: string; createdAt: Date } | undefined,
     input: UpdateDocInput,
   ): Promise<boolean> {
     // Always version if no previous version exists
     if (!lastVersion) return true

     // Only version if content actually changed
     if (input.content === undefined) return false

     const currentHash = await contentHash(currentDoc.content)
     const newHash = await contentHash(input.content)
     if (currentHash === newHash) return false

     // Time gate: at least 5 minutes since last version
     const MIN_VERSION_INTERVAL_MS = 5 * 60 * 1000
     const timeSinceLast = Date.now() - new Date(lastVersion.createdAt).getTime()
     if (timeSinceLast < MIN_VERSION_INTERVAL_MS) return false

     return true
   }
   ```

3. **Always save content** (just skip version creation):
   The `db.update(documents).set(updates)` call still runs. Only the `db.insert(documentVersions)` is conditional.

4. **Manual version creation** (nice-to-have):
   Add `POST /api/documents/:id/versions` endpoint for explicit "save checkpoint":
   ```typescript
   docs.post('/:id/versions', requirePermission('doc:update'), async (c) => {
     // Force create a version regardless of time gate
   })
   ```

5. **Frontend enhancement** (optional):
   Add a "Save version" button or Ctrl+Shift+S shortcut that calls the manual version endpoint.

### Todo
- [ ] Add `contentHash()` utility function
- [ ] Add `shouldVersion()` decision function with hash + time-gate
- [ ] Update `updateDocument()` to conditionally create versions
- [ ] Ensure content is always saved (only version creation is gated)
- [ ] Add `POST /api/documents/:id/versions` for manual checkpoints
- [ ] Test: rapid typing → only 1 version per 5 min
- [ ] Test: no content change → no version created
- [ ] Test: manual version creation works
- [ ] Verify existing version history still displays correctly

---

## Issue #16: Sharing Access Levels Not Working

### Problem
Right sidebar has Private/Specific users/Public access level buttons, but they don't actually enforce access or create share links.

### Current State
- `document-properties.tsx`: Has access level buttons that call `updateDocument({ accessLevel })` — this updates the `access_level` column in `documents` table
- `share.ts` routes: Has `POST /share/links` to create share tokens — but NOT connected to access level UI
- `share-service.ts`: Creates share links with tokens — works independently of `accessLevel` field
- `app.tsx`: Has `/share/:token` route → renders placeholder "coming soon"

### What's Actually Needed (per issue description)
1. **Private**: No one else can access (default, already works)
2. **Specific users**: Select users to grant access (email-based invites)
3. **Public**: Generate a shareable public link (read-only)

### Files to Modify
- `packages/web/src/components/metadata/document-properties.tsx` — wire access level buttons to actual behavior
- `packages/web/src/app.tsx` — implement ShareView component
- `packages/api/src/routes/share.ts` — minor adjustments
- `packages/api/src/services/share-service.ts` — verify existing logic

### Implementation Steps

1. **"Public" access level → auto-create share link**
   When user selects "Public":
   - Call `updateDocument({ accessLevel: 'public' })`
   - Then call `POST /api/share/links` with `{ documentId }` to generate a share token
   - Display the share link URL in the sidebar with a copy button
   - Show the link: `https://agentwiki.cc/share/{token}`

2. **Display share link when doc is public**
   In `document-properties.tsx`, after access level buttons:
   ```typescript
   {accessLevel === 'public' && (
     <ShareLinkDisplay documentId={documentId} />
   )}
   ```
   Create `packages/web/src/components/metadata/share-link-display.tsx`:
   - Fetch existing share links: `GET /api/share/links/:documentId`
   - If link exists, show URL + copy button
   - If no link, create one automatically

3. **"Private" access level → revoke share links**
   When switching from Public to Private:
   - Call `updateDocument({ accessLevel: 'private' })`
   - Delete existing share links: `DELETE /api/share/links/:id`

4. **"Specific users" → email invite UI**
   In `document-properties.tsx`, when "Specific users" selected:
   - Show an email input field with "Add user" button
   - This requires a new backend endpoint: `POST /api/share/invite` with `{ documentId, email }`
   - Or simpler: generate a share link and let user manually share it
   - **MVP approach**: Show share link (same as Public) but labeled "Share with specific people"
   - **Future**: Full user picker with email lookup

5. **Implement ShareView in `app.tsx`**
   Replace the placeholder:
   ```typescript
   function ShareView() {
     const { token } = useParams()
     // Fetch doc via GET /api/share/public/:token
     // Render read-only BlockNote editor
   }
   ```

### Todo
- [ ] Wire "Public" button → create share link + display URL
- [ ] Create `share-link-display.tsx` component (fetch, show, copy)
- [ ] Wire "Private" button → revoke share links
- [ ] Implement "Specific users" MVP (share link with label)
- [ ] Create `use-share-links.ts` hook (list, create, delete)
- [ ] Implement `ShareView` component for `/share/:token` route
- [ ] Test: set Public → share link appears → copy → open in incognito → doc visible
- [ ] Test: set Private → share link removed → old link returns 404
- [ ] Test: Specific users shows share link

---

## Success Criteria
- Documents can be dragged into/out of folders in sidebar
- Version history shows meaningful checkpoints (not every keystroke)
- Access level buttons actually create/revoke share links
- Public share links work for anonymous viewers
