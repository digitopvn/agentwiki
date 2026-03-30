---
phase: 4
title: Organization Tools
priority: medium
status: completed
effort: medium
blockedBy: [phase-01]
---

# Phase 4: Organization Tools (8 tools)

## Context Links

- [Folder Service](../../packages/api/src/services/folder-service.ts)
- [Upload Service](../../packages/api/src/services/upload-service.ts)
- [Tags Route](../../packages/api/src/routes/tags.ts)

## Overview

Implement folder management, tag listing, and file upload tools. Folders and tags provide organization context critical for AI agents navigating the knowledge base.

## Related Code Files

### Files to create
- `packages/mcp/src/tools/folder-tools.ts` — 4 folder tools
- `packages/mcp/src/tools/tag-tools.ts` — 2 tag tools
- `packages/mcp/src/tools/upload-tools.ts` — 2 upload tools

### Files to import
- `packages/api/src/services/folder-service.ts` — Folder CRUD
- `packages/api/src/services/upload-service.ts` — File upload/list
- `packages/api/src/routes/tags.ts` — Tag/category queries (inline, may need service extraction)

## Implementation Steps

### Folder Tools (4)

| Tool | Permission | Service Call |
|------|-----------|-------------|
| `folder_create` | `doc:create` | `createFolder(env, tenantId, userId, name, parentId?)` |
| `folder_list` | `doc:read` | `getFolderTree(env, tenantId)` |
| `folder_update` | `doc:update` | `updateFolder(env, tenantId, folderId, { name?, parentId?, position? })` |
| `folder_delete` | `doc:delete` | `deleteFolder(env, tenantId, folderId)` |

### Tag Tools (2)

| Tool | Permission | Service Call |
|------|-----------|-------------|
| `tag_list` | `doc:read` | Query `document_tags` grouped by tag with count |
| `category_list` | `doc:read` | Query distinct `documents.category` |

**Note:** Tag/category logic is in route handler, not service. Implement inline or extract.

### Upload Tools (2)

| Tool | Permission | Service Call |
|------|-----------|-------------|
| `upload_file` | `doc:create` | `uploadFile(env, tenantId, userId, filename, contentType, buffer, documentId?)` |
| `upload_list` | `doc:read` | `listUploads(env, tenantId, documentId?)` |

**Upload via MCP:** Input accepts `contentBase64` (string). Decode to ArrayBuffer before passing to service. **Limit: 2MB** (base64 encoded) = ~1.5MB actual file.

```typescript
{
  name: "upload_file",
  inputSchema: z.object({
    filename: z.string().describe("File name with extension"),
    contentBase64: z.string().max(2_097_152).describe("Base64-encoded file content (max 2MB encoded)"),
    contentType: z.string().describe("MIME type (e.g. image/png)"),
    documentId: z.string().optional().describe("Link upload to document"),
  }),
}
```

## Todo List

- [ ] Create `packages/mcp/src/tools/folder-tools.ts` (4 tools)
- [ ] Create `packages/mcp/src/tools/tag-tools.ts` (2 tools)
- [ ] Create `packages/mcp/src/tools/upload-tools.ts` (2 tools)
- [ ] Handle base64 decode for uploads
- [ ] Enforce 2MB upload limit
- [ ] Register all 8 tools in `server.ts`

## Success Criteria

- Folder tree returns hierarchical structure
- Folder CRUD works with parent/child relationships
- Tag list returns tags with document counts
- Category list returns distinct categories
- File upload via base64 stores in R2
- Upload size limit enforced (2MB encoded)

## Next Steps

→ Phase 5: Admin Tools
