---
phase: 3
title: "Frontend: Sortable Drag & Drop"
status: completed
priority: P0
effort: 8h
---

# Phase 3: Frontend — Sortable Drag & Drop

## Context
- [folder-tree.tsx](../../packages/web/src/components/sidebar/folder-tree.tsx) — Root DnD context, draggable docs
- [folder-node.tsx](../../packages/web/src/components/sidebar/folder-node.tsx) — Droppable folders, nested docs
- [use-folders.ts](../../packages/web/src/hooks/use-folders.ts) — Folder query hooks
- [use-documents.ts](../../packages/web/src/hooks/use-documents.ts) — Document query hooks

## Overview

Upgrade from `@dnd-kit/core` (drag-to-folder only) to `@dnd-kit/sortable` (drag to reorder + drag between containers). Support both folder reorder and document reorder while preserving existing move-to-folder.

## Key Insights

- Current DnD: `useDraggable` on docs, `useDroppable` on folders. Only moves docs into folders.
- Need: `SortableContext` wrapping folder lists and doc lists for reorder within same container.
- Challenge: Distinguish "reorder within container" vs "move to different folder". `@dnd-kit/sortable` handles this via `onDragOver` + `onDragEnd` events.
- Folders-first rule: Two separate `SortableContext`s per level — one for folders, one for docs.

## Architecture

```
DndContext (root)
├── SortableContext (root folders) ← folders reorder here
│   ├── SortableFolderNode (folder A)
│   │   ├── SortableContext (subfolder list)
│   │   ├── SortableContext (doc list in folder A)
│   │   │   ├── SortableDocItem
│   │   │   └── SortableDocItem
│   ├── SortableFolderNode (folder B)
│   │   └── ...
├── SortableContext (root docs) ← root docs reorder here
│   ├── SortableDocItem
│   └── SortableDocItem
└── DragOverlay
```

## Related Code Files

### Modify
- `packages/web/src/components/sidebar/folder-tree.tsx` — Replace DndContext with sortable setup, new drag handlers
- `packages/web/src/components/sidebar/folder-node.tsx` — Make folders sortable, nested sortable contexts for children
- `packages/web/src/hooks/use-folders.ts` — Add `useReorderItem` mutation hook
- `packages/web/src/hooks/use-documents.ts` — Ensure position field in queries

### Create
- `packages/web/src/hooks/use-reorder.ts` — Reorder mutation + optimistic update logic

## Implementation Steps

### 1. Install @dnd-kit/sortable

```bash
pnpm -F @agentwiki/web add @dnd-kit/sortable
```

Note: `@dnd-kit/sortable` depends on `@dnd-kit/core` (already installed).

### 2. Create use-reorder.ts hook

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/api-client'

interface ReorderInput {
  type: 'folder' | 'document'
  id: string
  parentId: string | null
  afterId?: string
  beforeId?: string
}

export function useReorderItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ReorderInput) =>
      apiClient.patch<{ id: string; position: string }>('/api/reorder', input),
    onSuccess: (_, variables) => {
      // Invalidate affected queries
      qc.invalidateQueries({ queryKey: ['folders'] })
      if (variables.type === 'document') {
        qc.invalidateQueries({ queryKey: ['documents'] })
      }
    },
  })
}
```

### 3. Refactor folder-tree.tsx

**Replace** current simple DndContext with sortable-aware setup:

Key changes:
- Import `SortableContext`, `verticalListSortingStrategy` from `@dnd-kit/sortable`
- Import `arrayMove` for optimistic reorder
- Two `SortableContext`s at root level: one for folders, one for root docs
- `onDragEnd` handler determines action:
  - Same container + different index → **reorder** (call `/api/reorder`)
  - Different container type → **move to folder** (existing behavior)

**Drag type detection:**
- Folders have ids prefixed with `folder-` in DnD context
- Documents have ids prefixed with `doc-`
- Parse prefix to determine drag item type

```typescript
const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event
  if (!over || active.id === over.id) return

  const activeType = parseItemType(active.id) // 'folder' | 'document'
  const overType = parseItemType(over.id)

  if (activeType === 'document' && overType === 'folder') {
    // Move document into folder (existing behavior)
    moveDocToFolder(activeId, overId)
  } else if (activeType === overType) {
    // Reorder within same container
    reorderItem(activeType, activeId, parentId, afterId, beforeId)
  }
}
```

### 4. Make folders sortable in folder-node.tsx

Replace `useDroppable` with `useSortable` from `@dnd-kit/sortable`:

```typescript
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// In FolderNode:
const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
  id: `folder-${folder.id}`,
  data: { type: 'folder', folder },
})

const style = {
  transform: CSS.Transform.toString(transform),
  transition,
  opacity: isDragging ? 0.4 : 1,
}
```

Each FolderNode also wraps its children in nested `SortableContext`s:
- One for child folders
- One for child documents

### 5. Make documents sortable

Replace `useDraggable` with `useSortable` in both `DraggableDocItem` and `NestedDraggableDoc`:

```typescript
const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
  id: `doc-${doc.id}`,
  data: { type: 'document', doc },
})
```

### 6. Compute afterId/beforeId from sort event

When `onDragEnd` fires with reorder:
```typescript
// items = current sorted list of sibling ids
const oldIndex = items.indexOf(active.id)
const newIndex = items.indexOf(over.id)

// The item at newIndex-1 is "after", newIndex+1 is "before"
const afterId = newIndex > 0 ? items[newIndex - 1] : undefined
const beforeId = newIndex < items.length - 1 ? items[newIndex + 1] : undefined
```

### 7. Optimistic updates

For smooth UX, reorder items in local state immediately, then call API:
```typescript
// Optimistic: move item in cached query data
qc.setQueryData(['folders'], (old) => {
  // reorder folder in tree
})

// Then call API
reorderMutation.mutate({ type, id, parentId, afterId, beforeId })
```

On error: `qc.invalidateQueries` to refetch server state.

### 8. Preserve move-to-folder behavior

Keep the existing drag-doc-to-folder functionality:
- When a document is dragged **over** a folder (different container), highlight folder as drop target
- On drop, call existing `updateDocument({ id, folderId })` API
- Root drop zone still works for moving docs out of folders

Detection: use `onDragOver` to track current drop target type. If hovering over a folder while dragging a doc, show folder highlight.

### 9. DragOverlay updates

Update DragOverlay to show both folder and document previews:
```typescript
<DragOverlay>
  {activeItem?.type === 'folder' ? (
    <FolderOverlay name={activeItem.name} />
  ) : activeItem?.type === 'document' ? (
    <DocOverlay title={activeItem.title} />
  ) : null}
</DragOverlay>
```

## Todo

- [ ] Install `@dnd-kit/sortable`
- [ ] Create `use-reorder.ts` hook
- [ ] Refactor `folder-tree.tsx` — SortableContext for root folders + root docs
- [ ] Refactor `folder-node.tsx` — useSortable for folders, nested SortableContexts
- [ ] Convert DraggableDocItem → SortableDocItem
- [ ] Convert NestedDraggableDoc → SortableNestedDoc
- [ ] Implement drag type detection (folder vs doc prefix)
- [ ] Implement afterId/beforeId computation
- [ ] Add optimistic reorder updates
- [ ] Preserve move-doc-to-folder behavior
- [ ] Update DragOverlay for both types
- [ ] Test nested folder reorder
- [ ] Run `pnpm type-check && pnpm lint`

## Success Criteria

- [ ] Drag folders to reorder within same parent
- [ ] Drag documents to reorder within same folder
- [ ] Drag documents to reorder at root level
- [ ] Drag documents between folders (existing feature still works)
- [ ] Drag documents to root (existing feature still works)
- [ ] Visual feedback: drag overlay, drop indicator, folder highlight
- [ ] Positions persist after page reload
- [ ] Nested folder reorder works (subfolders within a folder)

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Nested SortableContext complexity | @dnd-kit officially supports nested — use `data` prop to distinguish containers |
| Conflict between reorder and move-to-folder | Use drag item type + drop target type to disambiguate intent |
| Performance with many items | SortableContext uses `verticalListSortingStrategy` — O(n) but folders are typically <100 items |
| Mobile touch DnD | PointerSensor with 8px threshold already in place — works on touch devices |
