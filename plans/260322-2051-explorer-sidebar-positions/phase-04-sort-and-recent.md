---
phase: 4
title: "Frontend: Sort Controls & Recent Section"
status: completed
priority: P1
effort: 5h
---

# Phase 4: Frontend — Sort Controls & Recent Modifications Section

## Context
- [sidebar.tsx](../../packages/web/src/components/layout/sidebar.tsx) — Main sidebar container
- [folder-tree.tsx](../../packages/web/src/components/sidebar/folder-tree.tsx)
- [use-documents.ts](../../packages/web/src/hooks/use-documents.ts)

## Overview

Two UI features:
1. **Sort controls** — dropdown in sidebar header to switch between Manual/Name/Date sort with ASC/DESC toggle
2. **Recent modifications section** — collapsible list of 10 most recently updated docs above folder tree

## Implementation Steps

### 1. Create use-preferences.ts hook

```typescript
export function usePreferences() {
  return useQuery<Record<string, string>>({
    queryKey: ['preferences'],
    queryFn: () => apiClient.get('/api/preferences').then(r => r.preferences),
  })
}

export function useSetPreference() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      apiClient.put(`/api/preferences/${key}`, { value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['preferences'] }),
  })
}

// Convenience hook for sidebar sort
export function useSidebarSort() {
  const { data: prefs } = usePreferences()
  const setPref = useSetPreference()

  const sortPref = prefs?.sidebar_sort
    ? JSON.parse(prefs.sidebar_sort)
    : { mode: 'manual', direction: 'asc' }

  const setSortPref = (mode: string, direction: string) => {
    setPref.mutate({ key: 'sidebar_sort', value: JSON.stringify({ mode, direction }) })
  }

  return { sortMode: sortPref.mode, sortDirection: sortPref.direction, setSortPref }
}
```

### 2. Create sort-controls.tsx component

Location: `packages/web/src/components/sidebar/sort-controls.tsx`

UI: Small toolbar below action buttons, above folder tree.

```
[Manual ▾] [↑↓]
```

- Dropdown with 3 options: Manual, Name, Date
- Toggle button for ASC/DESC (only visible when Name or Date selected)
- Active sort mode highlighted
- Compact design — fits in sidebar width

Icons: `ArrowUpDown`, `ArrowUpAZ`, `ArrowDownAZ`, `Clock`, `GripVertical` from lucide-react.

```typescript
interface SortControlsProps {
  mode: 'manual' | 'name' | 'date'
  direction: 'asc' | 'desc'
  onChange: (mode: string, direction: string) => void
}
```

When mode = 'manual': folder tree uses `position` ordering, DnD reorder enabled.
When mode = 'name' or 'date': folder tree sorts client-side, DnD reorder disabled (drag shows "switch to manual to reorder" tooltip).

### 3. Create recent-documents.tsx component

Location: `packages/web/src/components/sidebar/recent-documents.tsx`

```typescript
export function RecentDocuments({ onDocumentOpen }: { onDocumentOpen?: () => void }) {
  const { data } = useDocuments({ limit: 10 }) // Already sorted by updatedAt DESC (default)
  // ...
}
```

UI:
- Collapsible section with header "Recent" + chevron toggle
- List of 10 docs: icon + title + relative time ("2m ago", "1h ago")
- Click navigates to doc
- Collapsed state saved in localStorage (simple, doesn't need server)

Use `date-fns` or inline formatter for relative timestamps. Check if already in deps:
```bash
# If not installed, use simple Intl.RelativeTimeFormat
```

### 4. Integrate into sidebar.tsx

Insert between action buttons and folder tree:

```tsx
{/* Sort controls */}
<SortControls mode={sortMode} direction={sortDirection} onChange={setSortPref} />

{/* Recent modifications */}
<RecentDocuments onDocumentOpen={isMobile ? () => setMobileSidebarOpen(false) : undefined} />

{/* Folder tree (now receives sort props) */}
<FolderTree
  searchQuery={search}
  sortMode={sortMode}
  sortDirection={sortDirection}
  onDocumentOpen={...}
/>
```

### 5. Update FolderTree to respect sort mode

Pass `sortMode` and `sortDirection` as props to `FolderTree`:

```typescript
// In FolderTree:
const sortedFolders = useMemo(() => {
  if (sortMode === 'name') {
    return [...folders].sort((a, b) =>
      sortDirection === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
    )
  }
  if (sortMode === 'date') {
    return [...folders].sort((a, b) =>
      sortDirection === 'asc'
        ? new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
        : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  }
  // manual: already sorted by position from API
  return folders
}, [folders, sortMode, sortDirection])
```

Same logic for documents within each folder level.

**DnD behavior by sort mode:**
- `manual`: Full DnD reorder enabled
- `name` / `date`: DnD for move-to-folder still works, but reorder disabled. Drag handle hidden or grayed out.

### 6. Pass sort to FolderNode

FolderNode receives `sortMode` + `sortDirection` and applies same sorting to its children:

```typescript
interface FolderNodeProps {
  folder: FolderTreeNode
  depth?: number
  searchQuery?: string
  sortMode?: 'manual' | 'name' | 'date'
  sortDirection?: 'asc' | 'desc'
}
```

## Todo

- [ ] Create `use-preferences.ts` hook with `useSidebarSort`
- [ ] Create `sort-controls.tsx` component
- [ ] Create `recent-documents.tsx` component
- [ ] Integrate sort controls + recent section into `sidebar.tsx`
- [ ] Update `FolderTree` to accept and apply sort mode/direction
- [ ] Update `FolderNode` to sort children by mode
- [ ] Disable DnD reorder when sort mode != 'manual'
- [ ] Add relative time formatting for recent docs
- [ ] Run `pnpm type-check && pnpm lint`

## Success Criteria

- [ ] Sort dropdown shows Manual/Name/Date options
- [ ] ASC/DESC toggle works for Name and Date modes
- [ ] Switching sort mode immediately reorders sidebar items
- [ ] Sort preference persists across page reloads (server-saved)
- [ ] Switching back to Manual restores saved position order
- [ ] DnD reorder only available in Manual mode
- [ ] Recent section shows 10 latest docs with relative timestamps
- [ ] Recent section is collapsible
- [ ] Click on recent doc navigates correctly
