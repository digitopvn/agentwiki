# Phase 1: Storage Drawer + Sidebar Icon

## Context
- [SP2 Plan](./plan.md)
- Sidebar: `packages/web/src/components/layout/sidebar.tsx`
- App store: `packages/web/src/stores/app-store.ts`
- Storage tab: `packages/web/src/components/settings/storage-tab.tsx`
- Upload hooks: `packages/web/src/hooks/use-uploads.ts`

## Overview
- **Priority:** P1
- **Status:** Completed
- **Description:** Add HardDrive icon to sidebar footer, create slide-out Storage drawer (400px), migrate file grid from Settings tab.

## Key Insights
- Sidebar footer has: Profile | Settings | Theme toggle
- Storage icon should go above footer or in footer row
- Drawer slides from right, similar to mobile sidebar pattern
- Existing StorageTab component has file grid + upload logic — can reuse/adapt
- Zustand store manages panel visibility already

## Requirements

### Functional
- HardDrive icon in sidebar (above footer, below folder tree)
- Click icon → toggle Storage drawer (right, 400px)
- Drawer: header + search + file grid + upload button
- Each file shows: thumbnail/icon, name, size, extraction_status badge, date
- Actions: download, delete, copy file URL
- Preview: click image → modal, click other → nothing (future)
- Extraction status badges: pending (yellow), processing (blue spin), completed (green), failed (red), unsupported (gray)

### Non-functional
- Drawer loads < 500ms
- Responsive: on mobile, drawer is full-width overlay
- Keyboard: Escape closes drawer
- Drawer doesn't block main content interaction (overlay with click-outside-to-close)

## Architecture

### Zustand Store Extension

```typescript
// Add to app-store.ts:
storageDrawerOpen: boolean
setStorageDrawerOpen: (open: boolean) => void
toggleStorageDrawer: () => void
```

### Component Structure

```
components/
├── layout/
│   └── sidebar.tsx          # Add HardDrive icon
├── storage/
│   ├── storage-drawer.tsx   # Drawer container + header + search
│   ├── storage-file-grid.tsx # File grid with cards
│   ├── storage-file-card.tsx # Individual file card
│   └── extraction-badge.tsx  # Status badge component
```

### Upload Hook Extension

```typescript
// Extend use-uploads.ts Upload interface:
export interface Upload {
  // ... existing fields ...
  extractionStatus: string | null  // pending|processing|completed|failed|unsupported
  summary: string | null
}

// Add useUploads options for search/filter:
export function useUploads(options?: { search?: string; status?: string })
```

## Related Code Files

### Modify
- `packages/web/src/stores/app-store.ts` — add storageDrawerOpen state
- `packages/web/src/components/layout/sidebar.tsx` — add HardDrive icon
- `packages/web/src/components/layout/layout.tsx` — render StorageDrawer
- `packages/web/src/hooks/use-uploads.ts` — extend Upload interface, add search/filter

### Create
- `packages/web/src/components/storage/storage-drawer.tsx`
- `packages/web/src/components/storage/storage-file-grid.tsx`
- `packages/web/src/components/storage/storage-file-card.tsx`
- `packages/web/src/components/storage/extraction-badge.tsx`

### Keep (reference)
- `packages/web/src/components/settings/storage-tab.tsx` — reference for file grid, can simplify after drawer is done

## Implementation Steps

1. **Extend Zustand store**
   - Add `storageDrawerOpen`, `setStorageDrawerOpen`, `toggleStorageDrawer`
   - Persist preference in localStorage

2. **Create ExtractionBadge component**
   - Small badge showing extraction status with appropriate colors
   - pending: yellow dot + "Pending"
   - processing: blue spinner + "Extracting..."
   - completed: green check + "Indexed"
   - failed: red x + "Failed"
   - unsupported: gray dash + "N/A"

3. **Create StorageFileCard component**
   - Thumbnail (image preview) or file type icon
   - Filename (truncated), size, date
   - ExtractionBadge
   - Hover actions: download, delete, copy URL

4. **Create StorageFileGrid component**
   - Responsive grid (2-3 columns based on drawer width)
   - Empty state with upload prompt
   - Loading skeleton

5. **Create StorageDrawer component**
   - Slide-in from right (400px, full-width on mobile)
   - Header: "Storage" title + upload button + close (X)
   - Search input (filters by filename)
   - StorageFileGrid
   - Backdrop overlay (click to close)
   - Escape key to close
   - Transition animation (transform translateX)

6. **Add HardDrive icon to sidebar**
   - In sidebar.tsx, add icon between folder tree and footer
   - Badge with file count or active extraction count
   - Click → toggleStorageDrawer()

7. **Render StorageDrawer in layout.tsx**
   - Conditionally render based on storageDrawerOpen
   - Portal or absolute positioned

8. **Extend Upload hooks**
   - Add extraction_status and summary to Upload interface
   - Add search param to useUploads (client-side filter for now)
   - Add polling: refetch every 5s when any file has processing status

9. **Test**
   - Toggle drawer open/close
   - Upload file, see it appear
   - Extraction status transitions
   - Responsive on mobile

## Todo List

- [x] Extend Zustand store with storageDrawerOpen
- [x] Create ExtractionBadge component
- [x] Create StorageFileCard component
- [x] Create StorageFileGrid component
- [x] Create StorageDrawer component
- [x] Add HardDrive icon to sidebar
- [x] Render StorageDrawer in layout
- [x] Extend Upload interface + hooks
- [x] Add polling for extraction status
- [x] Test responsive behavior
- [x] Run type-check + build

## Success Criteria

- HardDrive icon visible in sidebar
- Clicking icon toggles drawer
- Files displayed with extraction status
- Upload works from drawer
- Drawer closes on Escape / click outside
- Mobile: full-width overlay
