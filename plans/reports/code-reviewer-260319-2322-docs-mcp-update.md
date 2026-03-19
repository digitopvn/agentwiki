# Code Review: Documentation Update (MCP Server + README)

## Scope
- Files: README.md, docs/deployment-guide.md, docs/index.md, docs/mcp-server.md (new), docs/project-overview-pdr.md
- LOC: +811 / -49
- Focus: Documentation-only changes for MCP server feature

## Overall Assessment
Clean documentation update. README condensed well. New MCP server doc is comprehensive. Two broken links found, one placeholder URL needs fixing.

---

## Pass 1: CRITICAL (Blocking)

### 1. Broken anchor link in mcp-server.md
**File**: `docs/mcp-server.md` line ~631 (References section)
```markdown
[Agent Integration Guide](./deployment-guide.md#mcp-worker-deployment)
```
Anchor `#mcp-worker-deployment` does not exist in deployment-guide.md. The actual section heading is `### 4b. Deploy MCP Worker`, which renders as `#4b-deploy-mcp-worker`.
**Fix**: Change to `./deployment-guide.md#4b-deploy-mcp-worker`

### 2. Broken anchor link in mcp-server.md
**File**: `docs/mcp-server.md` line ~624 (Cloudflare Configuration section)
```markdown
See [Deployment Guide](./deployment-guide.md#production-deployment) for setup.
```
Anchor `#production-deployment` exists as `## Production Deployment` which renders as `#production-deployment`. **Actually valid** -- confirmed heading exists at line 165. Disregard.

### 3. Placeholder org in clone URL
**File**: `docs/mcp-server.md` line 534
```bash
git clone https://github.com/your-org/agentwiki.git
```
Actual remote is `github.com/digitopvn/agentwiki`. Should use real org or clearly mark as placeholder.
**Fix**: `git clone https://github.com/digitopvn/agentwiki.git`

### 4. No secrets or API keys leaked
Verified: All API keys use placeholder format `aw_xxxxxxxxxxxxx`. No real credentials. PASS.

---

## Pass 2: INFORMATIONAL (Non-blocking)

### 1. Tool count discrepancy
`mcp-server.md` overview says "25 tools" but the tool reference documents: 8 (document) + 2 (search) + 4 (folder) + 2 (tag) + 2 (upload) + 3 (member) + 3 (API key) + 1 (share) = **25**. Confirmed correct.

### 2. README table count says "15 tables" but lists only 15 names
Previously said 13 with a table. Now says 15 inline. Count of listed names: tenants, users, tenant_memberships, sessions, api_keys, audit_logs, documents, document_tags, document_versions, document_links, folders, share_links, uploads, ai_settings, ai_usage = **15**. Correct.

### 3. CORS "allows Origin: *" noted in security section
`docs/mcp-server.md` security section states CORS allows `Origin: *`. Documented as intentional for MCP protocol. Fine for server-to-server MCP calls, worth noting if browser clients ever connect directly.

### 4. mcp-server.md is 762 lines
Exceeds 200-line guideline for code files, but this is a documentation file so the rule doesn't apply per development-rules.md exclusions.

### 5. Health check URL inconsistency
`deployment-guide.md` health check: `curl https://api.agentwiki.cc/health`
This checks the main API health endpoint. If MCP is a separate worker, should it have its own health URL? Minor -- depends on routing config.

### 6. Missing `id` field in jsonrpc test examples
The JSONRPC test curl examples in mcp-server.md omit the `"id"` field which is required by JSON-RPC 2.0 spec for non-notification requests. Consider adding `"id": 1` to the request bodies.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2 (broken anchor link, placeholder org URL) |
| Informational | 6 |

### Recommended Actions
1. Fix broken anchor: `#mcp-worker-deployment` -> `#4b-deploy-mcp-worker`
2. Fix placeholder: `your-org` -> `digitopvn`
3. (Optional) Add `"id": 1` to JSON-RPC curl examples

### Positive Observations
- README condensation is well done -- removes redundancy, adds cross-references
- MCP server doc is thorough: auth, tools, resources, prompts, troubleshooting, architecture
- Proper cross-linking between docs/index.md, deployment-guide, and mcp-server
- No secrets exposed
- project-overview-pdr.md properly updated with MCP milestones
