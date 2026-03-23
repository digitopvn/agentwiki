---
phase: 03
title: "Drag & Drop Markdown File Import"
issue: 21
status: completed
priority: P2
effort: 4h
---

# Phase 03: Drag Markdown Files to Create Notes

**Issue:** [#21](https://github.com/digitopvn/agentwiki/issues/21) — "feat: Thêm tính năng drag file markdown từ máy tính"
**Request:** Drag markdown files from computer into workspace or into a specific folder → create a note with that content.

## Context Links
- GlobalDropZone: `packages/web/src/components/storage/global-drop-zone.tsx`
- FolderTree: `packages/web/src/components/sidebar/folder-tree.tsx`
- FolderNode: `packages/web/src/components/sidebar/folder-node.tsx`
- Document hooks: `packages/web/src/hooks/use-documents.ts`
- App store: `packages/web/src/stores/app-store.ts`

## Key Insights

1. `GlobalDropZone` currently treats ALL dropped files as uploads to R2 storage. Need to intercept `.md/.markdown` files and create documents instead.
2. `POST /api/documents` already accepts `{ title, content, folderId }` — no backend changes needed.
3. File title can be derived from filename (strip `.md` extension).
4. For folder-specific drops: `FolderNode` is already a droppable target via `@dnd-kit/core`. Need to handle external file drops too (currently only handles internal document DnD).
5. Max reasonable markdown file: 10MB. Larger files likely not intentional.

## Architecture

```
Drag flow:
  User drags .md file(s) onto browser window
    │
    ├─ Drop on main area (GlobalDropZone)
    │   → FileReader reads content
    │   → POST /api/documents { title: filename, content: markdown }
    │   → Open new document in tab
    │
    ├─ Drop on folder (FolderNode)
    │   → FileReader reads content
    │   → POST /api/documents { title: filename, content: markdown, folderId }
    │   → Open new document in tab
    │
    └─ Non-markdown files → existing upload behavior (R2 storage)
```

## Related Code Files

**Modify:**
- `packages/web/src/components/storage/global-drop-zone.tsx` — Detect .md files, create docs instead of uploading
- `packages/web/src/components/sidebar/folder-node.tsx` — Accept external file drops for .md files

**New:**
- `packages/web/src/hooks/use-markdown-import.ts` — Shared hook for reading .md files and creating documents

## Implementation Steps

1. **Create `use-markdown-import.ts` hook:**
   ```typescript
   function useMarkdownImport() {
     const createDocument = useCreateDocument()
     const { openTab, setActiveTab } = useAppStore()
     const navigate = useNavigate()

     async function importMarkdownFiles(files: File[], folderId?: string): Promise<void> {
       for (const file of files) {
         const content = await file.text()
         const title = file.name.replace(/\.(md|markdown)$/i, '')
         const doc = await createDocument.mutateAsync({ title, content, folderId })
         // Open first imported doc in tab
         openTab({ id: `tab-${doc.id}`, documentId: doc.id, title: doc.title })
         setActiveTab(`tab-${doc.id}`)
         navigate(`/doc/${doc.slug}`)
       }
     }

     return { importMarkdownFiles, isImporting: createDocument.isPending }
   }
   ```

2. **Update `GlobalDropZone` handleDrop:**
   - Partition dropped files into markdown vs non-markdown
   - Markdown files → `importMarkdownFiles(mdFiles)`
   - Non-markdown files → existing upload behavior
   - Update overlay text to mention markdown support

3. **Update `FolderNode` to accept external file drops:**
   - Add `onDragOver`/`onDrop` native event handlers (alongside @dnd-kit)
   - Detect external `.md` files → `importMarkdownFiles(mdFiles, folderId)`
   - Show visual feedback for valid markdown drop

4. **Add visual feedback:**
   - GlobalDropZone: show different text for markdown files ("Drop to create notes") vs other files ("Drop to upload")
   - Toast notification on successful import: "Created {n} note(s)"

## Todo List

- [x] Create `use-markdown-import.ts` hook
- [x] Update `GlobalDropZone` to detect and handle .md files
- [x] Add folder-specific .md file drop support in `FolderNode`
- [x] Add visual feedback (different drop zone text for .md files)
- [x] Add toast notification on successful import
- [x] Handle edge cases: empty files, duplicate titles, large files (>10MB)
- [x] Test: single .md file drop
- [x] Test: multiple .md file drop
- [x] Test: mixed .md + other files drop
- [x] Test: .md file drop onto folder

## Success Criteria

- Dropping `.md`/`.markdown` files creates new documents with file content
- Document title derived from filename (without extension)
- Dropping onto folder creates document in that folder
- Mixed drops: .md files create docs, others upload to storage
- New doc opens in editor tab automatically
- Works on both mobile and desktop

## Risk Assessment

- **Large files**: Limit to 10MB per .md file. Alert user for larger files.
- **Encoding**: `File.text()` uses UTF-8 by default, which covers 99% of markdown files
- **Duplicate titles**: API auto-generates unique slugs, so duplicates are fine

## Security Considerations

- File content is read client-side via FileReader (no server-side file parsing risk)
- Content is sent to API as plain text (no script injection — markdown is sanitized on render by BlockNote)
- Max file size check prevents memory exhaustion on client
