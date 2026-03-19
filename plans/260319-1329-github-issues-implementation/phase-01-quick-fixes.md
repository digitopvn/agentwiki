# Phase 01: Quick Fixes (#7, #12, #13)

## Priority: P1 | Status: Pending | Effort: 2h

Three small, independent fixes. No backend changes. No new dependencies.

---

## Issue #7: Turn off CSS outline on text editor and all inputs

### Problem
Focus outlines (blue `outline: 2px solid`) appear on BlockNote editor and form inputs, disrupting the dark UI aesthetic.

### Root Cause
`index.css` line 60-63 sets a global `:focus-visible` outline on ALL elements including the editor.

### Files to Modify
- `packages/web/src/index.css`

### Implementation Steps

1. **Remove global focus-visible outline from editor and inputs**
   - Keep `:focus-visible` for buttons and interactive elements (accessibility)
   - Add override for BlockNote editor container and input elements:
   ```css
   /* Disable outline on editor and form inputs (styled via ring/border instead) */
   .bn-container :focus-visible,
   input:focus-visible,
   textarea:focus-visible,
   [contenteditable]:focus-visible {
     outline: none;
   }
   ```
   - The existing inputs already use `focus:ring-1 focus:ring-brand-500/30` via Tailwind, so removing outline is safe

### Todo
- [ ] Add CSS override for editor and input focus outlines in `index.css`
- [ ] Verify BlockNote editor has no outline when focused
- [ ] Verify sidebar search input has no outline
- [ ] Verify document title input has no outline
- [ ] Confirm buttons still show focus-visible outline (accessibility)

---

## Issue #12: Right sidebar author name shows encoded characters

### Problem
`document-properties.tsx` line 125 displays `doc.createdBy` which is a **user ID** (e.g., `usr_abc123`), not a human-readable name.

### Root Cause
The `documents` table stores `createdBy` as a foreign key to `users.id`. The API `getDocument()` returns raw `createdBy` without joining to `users` table. The frontend displays this ID directly.

### Files to Modify
- `packages/api/src/services/document-service.ts` — join `users` table in `getDocument()`
- `packages/web/src/components/metadata/document-properties.tsx` — display `doc.authorName` instead

### Implementation Steps

1. **Backend: Enrich `getDocument()` with author name**
   In `document-service.ts` `getDocument()` function:
   - Import `users` from schema
   - Join `users` table on `documents.createdBy = users.id`
   - Return `authorName: users.name` and `authorAvatar: users.avatarUrl` alongside existing fields

   ```typescript
   // In getDocument() - replace the select query
   const doc = await db
     .select({
       // ...existing document fields
       authorName: users.name,
       authorAvatar: users.avatarUrl,
     })
     .from(documents)
     .leftJoin(users, eq(documents.createdBy, users.id))
     .where(and(eq(documents.id, docId), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))
     .limit(1)
   ```

2. **Frontend: Display author name**
   In `document-properties.tsx` line 125:
   - Change `{doc.createdBy}` to `{doc.authorName ?? doc.createdBy}`
   - Optionally add small avatar if `doc.authorAvatar` exists

3. **Shared types: Update Document type**
   - Add `authorName?: string` and `authorAvatar?: string` to `Document` type if it exists in shared package, or handle at component level

### Todo
- [ ] Update `getDocument()` in `document-service.ts` to join `users` table
- [ ] Update `document-properties.tsx` to display `authorName`
- [ ] Verify author name displays correctly in right sidebar
- [ ] Verify no regression on document list (listDocuments doesn't need this join)

---

## Issue #13: Press ENTER on title -> focus text editor

### Problem
When typing a document title and pressing Enter, nothing happens. Expected: cursor moves to the BlockNote editor body.

### Root Cause
The title `<input>` in `editor.tsx` (line 111-129) has no `onKeyDown` handler. Enter keypress is swallowed.

### Files to Modify
- `packages/web/src/components/editor/editor.tsx`

### Implementation Steps

1. **Add `onKeyDown` handler to title input**
   In `editor.tsx`, on the title `<input>` element:
   ```typescript
   onKeyDown={(e) => {
     if (e.key === 'Enter') {
       e.preventDefault()
       // Focus the BlockNote editor
       editor.focus()
     }
   }}
   ```
   - BlockNote's `editor.focus()` method sets cursor at the start of the editor content
   - This is the standard approach per BlockNote docs

2. **Also trigger title save on Enter** (same as onBlur behavior)
   ```typescript
   onKeyDown={async (e) => {
     if (e.key === 'Enter') {
       e.preventDefault()
       const newTitle = e.currentTarget.value.trim() || 'Untitled'
       if (newTitle !== doc.title) {
         updateTabTitle(tabId, newTitle)
         try {
           await updateDocument.mutateAsync({ id: documentId, title: newTitle })
         } catch (err) {
           console.error('Failed to update title:', err)
         }
       }
       editor.focus()
     }
   }}
   ```

### Todo
- [ ] Add `onKeyDown` handler to title input in `editor.tsx`
- [ ] Verify Enter saves title and focuses editor
- [ ] Verify Tab key still works normally
- [ ] Test with empty title (should default to "Untitled")

---

## Success Criteria
- No CSS outlines on editor or inputs
- Author name shows human-readable username in right sidebar
- Enter on document title focuses the editor body
- All existing functionality unaffected
