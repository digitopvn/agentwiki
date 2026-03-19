# Phase 05: Cloudflare R2 Storage UI (#10)

## Priority: P2 | Status: Pending | Effort: 5h

New feature page for browsing/managing R2 uploaded files, plus editor image upload integration.

---

## Issue #10: Cloudflare R2 Storage UI

### Problem
No UI to browse, preview, or manage files uploaded to R2. No way to upload images directly from the editor.

### Current State
- Backend `uploads.ts` routes exist: `POST /api/uploads`, `GET /api/files/:key`, `DELETE /api/uploads/:id`
- `uploads` table tracks: `id, tenantId, documentId, fileKey, filename, contentType, sizeBytes, uploadedBy, createdAt`
- `upload-service.ts` handles R2 put/get/delete
- No frontend upload management UI
- BlockNote editor has no image upload integration

### Dependencies
- Phase 4 (#9): Settings page needed for R2 config tab

### Files to Create
- `packages/web/src/components/settings/storage-tab.tsx` — file browser in Settings
- `packages/web/src/hooks/use-uploads.ts` — TanStack hooks for upload CRUD
- `packages/web/src/components/editor/image-upload-handler.ts` — BlockNote image upload config

### Files to Modify
- `packages/web/src/routes/settings.tsx` — add Storage tab
- `packages/web/src/components/editor/editor.tsx` — configure BlockNote image upload
- `packages/api/src/routes/uploads.ts` — add `GET /api/uploads` list endpoint if missing

### Implementation Steps

1. **Verify backend list endpoint**
   Check if `GET /api/uploads` exists to list all tenant uploads. If not, add:
   ```typescript
   // In uploads.ts
   uploadRouter.get('/', authGuard, async (c) => {
     const { tenantId } = c.get('auth')
     const uploads = await listUploads(c.env, tenantId, parsePagination(c.req.query()))
     return c.json(uploads)
   })
   ```

   In `upload-service.ts`:
   ```typescript
   export async function listUploads(env: Env, tenantId: string, params: PaginationParams) {
     const db = drizzle(env.DB)
     const data = await db
       .select()
       .from(uploads)
       .where(eq(uploads.tenantId, tenantId))
       .orderBy(desc(uploads.createdAt))
       .limit(params.limit)
       .offset(params.offset)
     return { data }
   }
   ```

2. **Create `use-uploads.ts` hook**
   ```typescript
   export function useUploads(params?: { limit?: number }) {
     return useQuery({
       queryKey: ['uploads', params],
       queryFn: () => apiClient.get<{ data: Upload[] }>(`/api/uploads?limit=${params?.limit ?? 50}`),
     })
   }

   export function useUploadFile() {
     const qc = useQueryClient()
     return useMutation({
       mutationFn: async (file: File) => {
         const formData = new FormData()
         formData.append('file', file)
         // Use raw fetch since apiClient sets JSON content-type
         const res = await fetch('/api/uploads', {
           method: 'POST',
           body: formData,
           credentials: 'include',
         })
         if (!res.ok) throw new Error('Upload failed')
         return res.json()
       },
       onSuccess: () => qc.invalidateQueries({ queryKey: ['uploads'] }),
     })
   }

   export function useDeleteUpload() {
     const qc = useQueryClient()
     return useMutation({
       mutationFn: (id: string) => apiClient.delete(`/api/uploads/${id}`),
       onSuccess: () => qc.invalidateQueries({ queryKey: ['uploads'] }),
     })
   }
   ```

3. **Create Storage tab in Settings**
   `components/settings/storage-tab.tsx`:

   Layout:
   - **Upload button** at top (drag-and-drop zone or file picker)
   - **File grid/list** with columns: Thumbnail | Filename | Size | Type | Date | Actions
   - **Preview modal** — click file to preview (image inline, others show metadata)
   - **Delete button** per file with confirmation
   - **Storage usage** summary (total files, total size)

   File preview logic:
   ```typescript
   const isImage = (contentType: string) => contentType.startsWith('image/')
   const isPdf = (contentType: string) => contentType === 'application/pdf'

   // For images: show <img src={`/api/files/${fileKey}`} />
   // For others: show file metadata + download link
   ```

   Grid item:
   ```typescript
   <div className="group relative rounded-lg border overflow-hidden">
     {isImage(file.contentType) ? (
       <img src={`/api/files/${file.fileKey}`} className="h-32 w-full object-cover" />
     ) : (
       <div className="flex h-32 items-center justify-center bg-surface-2">
         <FileIcon className="h-8 w-8 text-neutral-500" />
       </div>
     )}
     <div className="p-2">
       <p className="truncate text-xs">{file.filename}</p>
       <p className="text-[10px] text-neutral-500">{formatBytes(file.sizeBytes)}</p>
     </div>
   </div>
   ```

4. **Integrate image upload in BlockNote editor**
   BlockNote supports custom upload handlers via the `uploadFile` option:

   In `editor.tsx`:
   ```typescript
   const editor = useCreateBlockNote({
     uploadFile: async (file: File) => {
       const formData = new FormData()
       formData.append('file', file)
       const res = await fetch('/api/uploads', {
         method: 'POST',
         body: formData,
         credentials: 'include',
       })
       if (!res.ok) throw new Error('Upload failed')
       const data = await res.json()
       // Return the URL to the uploaded file
       return `/api/files/${data.fileKey}`
     },
   })
   ```

   This enables:
   - Drag-and-drop images into editor → auto-upload to R2
   - Paste images from clipboard → auto-upload to R2
   - Image toolbar "Upload" button → file picker → upload to R2

5. **Add Storage tab to Settings page**
   In `settings.tsx`, add "Storage" tab (available to admin + editor roles):
   ```typescript
   { id: 'storage', label: 'Storage', component: <StorageTab /> }
   ```

### Upload Flow
```
User drags image into editor (or selects file in Storage tab)
  |
  v
POST /api/uploads (FormData with file)
  |
  v
API: upload-service.ts
  ├─ Generate unique fileKey: `{tenantId}/{docId}/{uuid}-{filename}`
  ├─ Upload to R2 bucket
  ├─ Insert metadata into `uploads` table
  └─ Return { id, fileKey, filename, contentType, sizeBytes }
  |
  v
Frontend receives fileKey
  ├─ Editor: inserts <img> block with src="/api/files/{fileKey}"
  └─ Storage tab: refetches upload list
```

### Todo
- [ ] Verify/add `GET /api/uploads` list endpoint
- [ ] Create `use-uploads.ts` hook (list, upload, delete)
- [ ] Create `storage-tab.tsx` with file grid + upload zone
- [ ] Add file preview modal (images inline, others metadata)
- [ ] Add delete confirmation + action
- [ ] Add storage usage summary
- [ ] Configure BlockNote `uploadFile` handler in `editor.tsx`
- [ ] Test: drag image into editor → uploads to R2 → displays inline
- [ ] Test: paste image → uploads correctly
- [ ] Test: Storage tab shows all uploads → preview → delete
- [ ] Test: deleted file returns 404 from API

---

## Success Criteria
- Settings > Storage tab shows all uploaded files with preview
- Files can be uploaded, previewed, and deleted from the UI
- Dragging/pasting images into the editor auto-uploads to R2
- Storage usage is visible
