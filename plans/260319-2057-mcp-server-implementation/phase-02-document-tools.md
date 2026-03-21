---
phase: 2
title: Document Tools
priority: high
status: completed
effort: medium
blockedBy: [phase-01]
---

# Phase 2: Document Tools (8 tools)

## Context Links

- [Document Service](../../packages/api/src/services/document-service.ts)
- [Document Schemas](../../packages/shared/src/schemas/document.ts)
- [Document Types](../../packages/shared/src/types/document.ts)

## Overview

Implement 8 MCP tools for full document CRUD + versioning + links. All tools reuse `document-service.ts` directly.

## Key Insights

- `createDocument()` enqueues QUEUE job for AI summary + embedding — MCP must have QUEUE binding
- `updateDocument()` auto-creates version if content changed + 5min time-gate passed
- `deleteDocument()` is soft-delete (sets `deletedAt`)
- `getDocument()` returns document with tags + author info
- `listDocuments()` supports pagination + filters (folderId, category, tag, search)

## Related Code Files

### Files to create
- `packages/mcp/src/tools/document-tools.ts` — All 8 document tools

### Files to read/import
- `packages/api/src/services/document-service.ts` — All service functions
- `packages/shared/src/schemas/document.ts` — Zod schemas

## Implementation Steps

### Register 8 tools in `document-tools.ts`

```typescript
export function registerDocumentTools(server: McpServer, env: Env, auth: AuthContext) {
  // Each tool: validate permission → call service → format response
}
```

| Tool | Permission | Service Call | Input |
|------|-----------|-------------|-------|
| `document_create` | `doc:create` | `createDocument(env, auth.tenantId, auth.userId, input)` | `{ title, content?, folderId?, category?, tags?, accessLevel? }` |
| `document_get` | `doc:read` | `getDocument(env, auth.tenantId, id)` or `getDocumentBySlug(env, auth.tenantId, slug)` | `{ id?, slug? }` (one required) |
| `document_list` | `doc:read` | `listDocuments(env, auth.tenantId, params, filters)` | `{ limit?, offset?, folderId?, category?, tag?, search? }` |
| `document_update` | `doc:update` | `updateDocument(env, auth.tenantId, id, auth.userId, input)` | `{ id, title?, content?, folderId?, category?, tags?, accessLevel? }` |
| `document_delete` | `doc:delete` | `deleteDocument(env, auth.tenantId, id)` | `{ id }` |
| `document_versions_list` | `doc:read` | `getVersionHistory(env, id)` | `{ documentId }` |
| `document_version_create` | `doc:update` | `createVersionCheckpoint(env, auth.tenantId, id, auth.userId)` | `{ documentId }` |
| `document_links_get` | `doc:read` | `getDocumentLinks(env, id)` | `{ documentId }` |

### Response format

All tools return `TextContent` with JSON:
```typescript
return {
  content: [{
    type: "text",
    text: JSON.stringify(result, null, 2)
  }]
};
```

For `document_get` with large content, return markdown directly:
```typescript
return {
  content: [
    { type: "text", text: `# ${doc.title}\n\n${doc.content}` },
    { type: "text", text: `\n\n---\nMetadata: ${JSON.stringify({ id, slug, category, tags, updatedAt })}` }
  ]
};
```

## Todo List

- [ ] Create `packages/mcp/src/tools/document-tools.ts`
- [ ] Implement `document_create` tool
- [ ] Implement `document_get` tool (by ID or slug)
- [ ] Implement `document_list` tool (with all filters)
- [ ] Implement `document_update` tool
- [ ] Implement `document_delete` tool (with destructive annotation)
- [ ] Implement `document_versions_list` tool
- [ ] Implement `document_version_create` tool
- [ ] Implement `document_links_get` tool
- [ ] Register all tools in `server.ts`
- [ ] Verify QUEUE job enqueued on create/update

## Success Criteria

- All 8 tools callable via MCP protocol
- `document_create` creates doc + enqueues AI summary
- `document_get` returns full content + tags
- `document_list` pagination + filters work
- `document_update` creates version checkpoint when content changes
- `document_delete` soft-deletes
- RBAC blocks agent role from create/update/delete
- Audit log entries for write operations

## Next Steps

→ Phase 3: Search + Graph Tools
