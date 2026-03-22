# Phase 2: Global Drop Zone + Upload Progress

## Context
- [SP2 Plan](./plan.md)
- [Phase 1](./phase-01-storage-drawer-sidebar.md) — Storage drawer exists
- Layout: `packages/web/src/components/layout/layout.tsx`

## Overview
- **Priority:** P1
- **Status:** Completed
- **Description:** Global drag & drop overlay, multi-file upload with progress bars, 100MB limit enforcement.

## Requirements

### Functional
- Drag file(s) anywhere in app → full-screen overlay appears
- Drop → files upload to R2, Storage drawer auto-opens
- Multi-file upload support (sequential or parallel)
- Per-file progress bar in drawer
- 100MB per file limit, show error for oversized
- After upload → show extraction status spinner

### Non-functional
- Overlay smooth animation (fade in/out)
- No false triggers from internal drag (folder tree DnD)
- Progress accurate (use XMLHttpRequest or fetch with ReadableStream)
- Works on Chrome, Firefox, Safari, Edge

## Architecture

### Component Structure

```
components/
├── storage/
│   ├── global-drop-zone.tsx    # Full-screen drop overlay
│   └── upload-progress-list.tsx # Progress bars per file
```

### Upload Flow

```
User drags file into window
  → dragenter event on document
  → Show overlay (if external file, not internal DnD)
  → User drops file
  → Validate size (< 100MB)
  → Add to upload queue
  → Open Storage drawer
  → Show progress bar per file
  → Upload via fetch with progress tracking
  → On complete: invalidate uploads query
  → Show extraction status transition
```

## Implementation Steps

1. **Create GlobalDropZone component**
   - Listen to `dragenter`, `dragleave`, `dragover`, `drop` on document/window
   - Distinguish external file drag from internal DnD (check `dataTransfer.types` for 'Files')
   - Show full-screen overlay with dashed border, cloud upload icon, "Drop files to upload"
   - Fade in/out animation via CSS transitions
   - Render in layout.tsx (always mounted, visibility toggled)

2. **Create upload queue Zustand state**
   ```typescript
   // Add to app-store or new upload-store:
   uploadQueue: UploadQueueItem[]
   addToUploadQueue: (files: File[]) => void
   updateUploadProgress: (id: string, progress: number) => void
   removeFromUploadQueue: (id: string) => void

   interface UploadQueueItem {
     id: string  // temp client ID
     file: File
     progress: number  // 0-100
     status: 'queued' | 'uploading' | 'complete' | 'error'
     error?: string
   }
   ```

3. **Create UploadProgressList component**
   - Renders in StorageDrawer above file grid
   - Shows active uploads with progress bars
   - Each item: filename, progress bar, cancel button
   - Error items: red bar with error message
   - Complete items: fade out after 3s

4. **Upload with progress tracking**
   - Use XMLHttpRequest for progress events (fetch doesn't support upload progress natively)
   - Or: use chunked upload approach
   - Track progress per file, update Zustand state

5. **File validation on drop**
   - Check file.size < 100MB (100 * 1024 * 1024)
   - Oversized files → add to queue with status=error, message="File too large (max 100MB)"
   - Multiple files → process each independently

6. **Auto-open drawer on drop**
   - When files dropped, call `setStorageDrawerOpen(true)`
   - Drawer shows upload progress at top

7. **Modify existing upload button in drawer**
   - Support multi-file selection (`multiple` attribute on file input)
   - Same upload queue + progress flow

8. **Distinguish from internal DnD**
   - Folder tree uses dnd-kit for drag & drop
   - Check `e.dataTransfer.types.includes('Files')` — only show overlay for file drops
   - dnd-kit internal drags don't set 'Files' type

9. **Test cross-browser**
   - Chrome, Firefox, Safari, Edge
   - Multi-file drag
   - Large file rejection
   - Cancel upload

## Todo List

- [x] Create GlobalDropZone component
- [x] Add upload queue to Zustand store
- [x] Create UploadProgressList component
- [x] Implement upload with progress tracking
- [x] File size validation (100MB limit)
- [x] Auto-open drawer on drop
- [x] Multi-file upload support
- [x] Distinguish external file drag from internal DnD
- [x] Update existing upload button for multi-file
- [x] Test cross-browser
- [x] Run type-check + build

## Success Criteria

- Dragging external file shows full-screen overlay
- Internal DnD (folder tree) does NOT trigger overlay
- Dropping files uploads with visible progress
- Oversized files show clear error
- Multi-file upload works
- Storage drawer auto-opens on drop
- Progress accurate and smooth
