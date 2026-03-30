---
phase: 7
title: Testing + Deploy
priority: high
status: completed
effort: medium
blockedBy: [phase-01, phase-02, phase-03, phase-04, phase-05, phase-06]
---

# Phase 7: Testing + Deploy

## Overview

End-to-end testing of all 25 tools, 6 resources, 4 prompts. Deploy to `mcp.agentwiki.cc` via Cloudflare Workers. Verify integration with Claude Desktop, Claude Code, and Cursor.

## Implementation Steps

### 1. Local Testing

```bash
cd packages/mcp
pnpm dev  # wrangler dev
```

Test with curl:
```bash
# Initialize
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -H "x-api-key: aw_test_key" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'

# List tools
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -H "x-api-key: aw_test_key" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# Call search tool
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -H "x-api-key: aw_test_key" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search","arguments":{"query":"test","type":"keyword"}}}'
```

### 2. Auth Testing

- Valid API key via `x-api-key` header → 200
- Valid API key via `Authorization: Bearer aw_...` → 200
- Valid API key via `?api_key=aw_...` → 200
- Missing key → 401
- Invalid key → 401
- Expired key → 401
- Agent role calling `document_create` → permission error
- Admin role calling all tools → success

### 3. Tool Testing Checklist

Test each tool with valid inputs + edge cases:

**Documents:**
- [ ] `document_create` — create with all fields, verify queue job
- [ ] `document_get` — by ID, by slug, not found
- [ ] `document_list` — pagination, filters (folder, category, tag, search)
- [ ] `document_update` — content change triggers version
- [ ] `document_delete` — soft delete, verify deletedAt set
- [ ] `document_versions_list` — returns history
- [ ] `document_version_create` — manual checkpoint
- [ ] `document_links_get` — forward + backlinks

**Search + Graph:**
- [ ] `search` — keyword, semantic, hybrid modes
- [ ] `graph_get` — nodes + edges, category/tag filters

**Organization:**
- [ ] `folder_create` — with/without parent
- [ ] `folder_list` — hierarchical tree
- [ ] `folder_update` — rename, move
- [ ] `folder_delete` — cascade behavior
- [ ] `tag_list` — tags with counts
- [ ] `category_list` — distinct categories
- [ ] `upload_file` — base64 file, size limit
- [ ] `upload_list` — by document, all

**Admin:**
- [ ] `member_list` — returns members
- [ ] `member_update_role` — role change
- [ ] `member_remove` — removal
- [ ] `api_key_create` — returns plaintext key
- [ ] `api_key_list` — masked keys
- [ ] `api_key_revoke` — revocation
- [ ] `share_link_create` — returns token URL

### 4. Resource + Prompt Testing

- [ ] Browse `agentwiki://documents` → returns doc list
- [ ] Read `agentwiki://documents/{id}` → returns markdown
- [ ] Browse `agentwiki://folders` → returns tree
- [ ] Use `search_and_summarize` prompt → generates correct message
- [ ] All 4 prompts accessible via `prompts/list`

### 5. Deploy to Production

```bash
cd packages/mcp
pnpm deploy  # wrangler deploy
```

Verify:
- `https://mcp.agentwiki.cc/mcp` responds to POST
- DNS configured for `mcp.agentwiki.cc` subdomain
- All CF bindings connected (D1, R2, KV, Vectorize, Queue, AI)
- Secrets set: (no JWT_SECRET needed, only binding IDs)

### 6. Claude Desktop Integration Test

Add to Claude Desktop config:
```json
{
  "mcpServers": {
    "agentwiki": {
      "url": "https://mcp.agentwiki.cc/mcp",
      "headers": { "x-api-key": "aw_..." }
    }
  }
}
```

Verify:
- [ ] Claude Desktop shows AgentWiki tools
- [ ] Can search documents
- [ ] Can create/read documents
- [ ] Can browse resources

### 7. Claude Code Integration Test

Add to `.claude/settings.json`:
```json
{
  "mcpServers": {
    "agentwiki": {
      "url": "https://mcp.agentwiki.cc/mcp",
      "headers": { "x-api-key": "aw_..." }
    }
  }
}
```

## Todo List

- [ ] Run all curl tests locally
- [ ] Test auth flows (header, bearer, query param)
- [ ] Test all 25 tools
- [ ] Test all 6 resources
- [ ] Test all 4 prompts
- [ ] Test RBAC (agent vs admin vs editor)
- [ ] Deploy to `mcp.agentwiki.cc`
- [ ] Configure DNS subdomain
- [ ] Test Claude Desktop integration
- [ ] Test Claude Code integration
- [ ] Verify audit logs generated

## Success Criteria

- All 25 tools pass functional tests
- Auth works across all 3 methods
- RBAC properly enforced
- Deployed and accessible at `mcp.agentwiki.cc`
- Works in Claude Desktop + Claude Code
- Latency: < 50ms reads, < 200ms search
- No errors in CF Worker logs
