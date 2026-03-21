---
title: "SP2: Storage UI/UX Enhancements"
description: "Sidebar storage icon with slide-out drawer, global drag & drop, upload progress, extraction status indicators"
status: in_progress
priority: P1
effort: 20h
branch: feat/storage-ui-ux
tags: [storage, ui, sidebar, drawer, drag-drop, upload, react]
created: 2026-03-21
issue: https://github.com/digitopvn/agentwiki/issues/22
brainstorm: plans/reports/brainstorm-260321-1139-storage-cloudflare-r2.md
blockedBy: [260321-1139-sp1-text-extraction-pipeline]
blocks: []
---

# SP2: Storage UI/UX Enhancements

Move Storage from Settings tab to a dedicated sidebar icon with slide-out drawer. Add global drag & drop, upload progress, extraction status.

## Current State

- Storage tab exists in Settings page (grid view, upload, delete, preview)
- Editor has drag-drop for images only (auto-upload to R2)
- No sidebar storage access, no global drop zone
- No upload progress indicators
- File size limit: 10MB (will increase to 100MB)

## Architecture

```
┌─────────────────────────────────────────────┐
│ Left Sidebar                                 │
│  ├─ Logo                                     │
│  ├─ Search                                   │
│  ├─ New doc / New folder / Filter            │
│  ├─ Folder tree                              │
│  ├─ Footer: Profile | Settings | Theme       │
│  └─ [NEW] HardDrive icon (above footer)      │
│         └─ Opens Storage Drawer →             │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Storage Drawer (400px, right slide-out)       │
│  ├─ Header: "Storage" + Upload btn + Close   │
│  ├─ Search/filter bar                        │
│  ├─ File grid with:                          │
│  │   ├─ Thumbnail/icon                       │
│  │   ├─ Filename, size, date                 │
│  │   ├─ Extraction status badge              │
│  │   └─ Actions (download, delete, copy URL) │
│  └─ Empty state with upload prompt           │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Global Drop Zone (full-screen overlay)        │
│  ├─ Visible when dragging file into window   │
│  ├─ "Drop files to upload" indicator         │
│  ├─ Auto-opens Storage drawer on drop        │
│  └─ Shows progress per file                  │
└─────────────────────────────────────────────┘
```

## Phases

| # | Phase | Effort | Status | File |
|---|-------|--------|--------|------|
| 1 | Storage Drawer + Sidebar Icon | 10h | Completed | [phase-01](./phase-01-storage-drawer-sidebar.md) |
| 2 | Global Drop Zone + Upload Progress | 10h | Completed | [phase-02](./phase-02-global-dropzone-progress.md) |

## Key Dependencies

- SP1 must be completed (extraction_status field in uploads table)
- Existing Zustand store (app-store.ts) for drawer state
- Existing TanStack Query hooks (use-uploads.ts) for data

## Success Criteria

- HardDrive icon visible in sidebar, opens drawer
- Storage drawer shows files with extraction status
- Global drag & drop works across all pages
- Multi-file upload with progress indicators
- 100MB file size limit enforced with clear error
- Drawer loads < 500ms
