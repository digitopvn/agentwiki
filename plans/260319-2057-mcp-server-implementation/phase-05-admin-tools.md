---
phase: 5
title: Admin Tools
priority: medium
status: completed
effort: small
blockedBy: [phase-01]
---

# Phase 5: Admin Tools (7 tools)

## Context Links

- [Member Service](../../packages/api/src/services/member-service.ts)
- [API Key Service](../../packages/api/src/services/api-key-service.ts)
- [Share Service](../../packages/api/src/services/share-service.ts)
- [Publish Service](../../packages/api/src/services/publish-service.ts)

## Overview

Implement member management, API key management, and share link tools. These require higher permissions (`tenant:manage`, `key:*`, `doc:share`).

## Implementation Steps

### Member Tools (3)

| Tool | Permission | Service Call |
|------|-----------|-------------|
| `member_list` | `tenant:manage` | `listMembers(env, tenantId)` |
| `member_update_role` | `user:manage` | `updateMemberRole(env, membershipId, role)` |
| `member_remove` | `user:manage` | `removeMember(env, membershipId)` |

### API Key Tools (3)

| Tool | Permission | Service Call |
|------|-----------|-------------|
| `api_key_create` | `key:*` | `createApiKey(env, tenantId, name, scopes, userId, expiresAt?)` |
| `api_key_list` | `key:*` | `listApiKeys(env, tenantId)` |
| `api_key_revoke` | `key:*` | `revokeApiKey(env, keyId, tenantId)` |

**Security:** `api_key_create` returns plaintext key once. MCP response must clearly state this.

### Share Link Tool (1)

| Tool | Permission | Service Call |
|------|-----------|-------------|
| `share_link_create` | `doc:share` | `createShareLink(env, documentId, userId, expiresInDays?)` |

### Files to create
- `packages/mcp/src/tools/member-tools.ts` — 3 member tools
- `packages/mcp/src/tools/api-key-tools.ts` — 3 API key tools
- `packages/mcp/src/tools/share-tools.ts` — 1 share link tool

## Todo List

- [ ] Create `packages/mcp/src/tools/member-tools.ts`
- [ ] Create `packages/mcp/src/tools/api-key-tools.ts`
- [ ] Create `packages/mcp/src/tools/share-tools.ts`
- [ ] Register all 7 tools in `server.ts`
- [ ] Verify admin-only tools blocked for agent/viewer roles

## Success Criteria

- Member tools require `tenant:manage` / `user:manage`
- API key creation returns plaintext key with clear warning
- Share link creation returns shareable URL
- All admin tools blocked for non-admin API keys
- Audit logs for all admin actions

## Next Steps

→ Phase 6: Resources + Prompts
