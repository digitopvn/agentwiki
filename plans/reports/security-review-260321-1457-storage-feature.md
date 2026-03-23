# Security Review: Issue #22 — Storage (Cloudflare R2)

**Date:** 2026-03-21
**Scope:** All changes on `ultrathink` branch vs `main` related to file storage, extraction pipeline, and search
**Severity Scale:** CRITICAL / HIGH / MEDIUM / LOW / INFO

---

## 1. Secrets & Credentials

### Result: PASS

- **No hardcoded secrets found** in committed code. All sensitive values (API keys, shared secrets, DB credentials) use:
  - Cloudflare Workers env bindings (`c.env.*`) — set via `wrangler secret` or dashboard
  - Python `os.getenv()` loaded from `.env` (not committed)
  - GitHub Actions `${{ secrets.* }}`
- `.gitignore` covers `.env`, `.env.*`, `.dev.vars`, `*.local`
- `.env.example` contains placeholder values only (`your-shared-secret-here`)
- `AI_ENCRYPTION_KEY` docs reference in system-architecture.md shows example literal `"your-secret-key-for-encrypting-api-keys"` — but this is documentation, not executable code

**No issues.**

---

## 2. Authentication & Authorization

### 2.1 Internal API Auth — `packages/api/src/middleware/internal-auth.ts`

**PASS** — Well implemented:
- Uses timing-safe comparison (XOR with padding to fixed 256 bytes)
- Includes length difference in XOR result (`a.length ^ b.length`)
- Header: `X-Internal-Secret`
- Applied via `internalRouter.use('*', internalAuth)` — covers all internal routes

### 2.2 VPS `/jobs` Endpoint — `packages/extraction-service/app/main.py`

| Severity | Finding |
|----------|---------|
| **MEDIUM** | **Python uses `!=` for secret comparison — vulnerable to timing attack.** Line 43: `if x_internal_secret != AGENTWIKI_INTERNAL_SECRET` should use `hmac.compare_digest()` or `secrets.compare_digest()` for constant-time comparison. |

**Recommendation:** Replace with:
```python
import hmac
if not hmac.compare_digest(x_internal_secret, AGENTWIKI_INTERNAL_SECRET):
    raise HTTPException(status_code=401, detail="Unauthorized")
```

**Risk context:** VPS is internal-only (not internet-facing), so practical exploitability is low, but defense-in-depth requires fixing.

### 2.3 Download Token — `packages/api/src/routes/uploads.ts`

**PASS** — Properly implemented:
- Token stored in KV with 15-min TTL (`expirationTtl: 900`)
- One-time use: KV entry deleted BEFORE serving file (line 73) — prevents TOCTOU race
- Token validated against exact `fileKey` match (prevents token reuse for different files)
- Failed token returns 403, not 404 (no file existence leakage)

### 2.4 File Serving Access Control — `packages/api/src/routes/uploads.ts`

**PASS** — Three-tier access:
1. Download token path: validated + consumed
2. Authenticated user path: tenant prefix check via `getFile()` → `fileKey.startsWith(tenantId/)`
3. No auth + no token → 401 (line 100) — **public fallthrough correctly blocked**

### 2.5 Search Endpoint — `packages/api/src/routes/search.ts`

**PASS** — `searchRouter.use('*', authGuard)` applied to all search routes. Rate limiting applied.

---

## 3. Input Validation

### 3.1 Extraction Result Payload — `packages/api/src/routes/internal.ts`

**PASS** — Zod schema enforces:
- `uploadId`: `z.string().min(1)`
- `tenantId`: `z.string().min(1)`
- `extractedText`: `z.string().max(5_000_000)` — 5MB limit protects D1
- `extractionMethod`: `z.enum(...)` — whitelist only
- `error`: `z.string().max(2000).optional()`

### 3.2 Search Source Param — `packages/api/src/routes/search.ts`

**PASS** — Whitelist validation:
```typescript
const source: SearchSource = ['docs', 'storage', 'all'].includes(rawSource) ? rawSource as SearchSource : 'docs'
```
Invalid values default to `'docs'`.

### 3.3 File Size Limit — `packages/api/src/routes/uploads.ts`

**PASS** — 100MB max enforced at route level (line 25). Checked before any processing.

### 3.4 LIKE Wildcard Escaping — `packages/api/src/services/storage-search-service.ts`

**PASS** — Line 20:
```typescript
const escapedQuery = query.replace(/[%_\\]/g, '\\$&')
```
Escapes `%`, `_`, and `\` to prevent wildcard injection in LIKE queries.

### 3.5 Search Limit Capping

**PASS** — `Math.min(50, ...)` for search, `Math.min(10, ...)` for suggestions. Prevents abuse.

---

## 4. OWASP Top 10

### 4.1 SQL Injection

**PASS** — All DB queries use Drizzle ORM parameterized queries. The LIKE query in `storage-search-service.ts` uses `sql\`...\`` template literals with `${likeQuery}` which Drizzle parameterizes. Combined with explicit LIKE meta-char escaping.

### 4.2 XSS

**LOW** — React auto-escapes by default. No `dangerouslySetInnerHTML` found in storage components. Extracted text rendered as plain text/snippets.

### 4.3 SSRF — VPS Extraction Service

| Severity | Finding |
|----------|---------|
| **MEDIUM** | **VPS downloads files from URLs provided in job payload (`file_url` field).** The URL is constructed by the CF Worker (`extraction-job-dispatcher.ts`) from trusted data (env var + fileKey), but the VPS worker trusts whatever URL arrives in the BullMQ job. If Redis is compromised or a malicious job is injected, the VPS would download from arbitrary URLs. |

**Mitigations already in place:**
- BullMQ queue protected by Redis auth
- `/jobs` endpoint requires `X-Internal-Secret`
- VPS not internet-facing

**Recommendation:** Add URL allowlist validation in `worker.py` before downloading:
```python
if not file_url.startswith(AGENTWIKI_API_URL):
    raise ValueError(f"Untrusted file URL: {file_url}")
```

### 4.4 Path Traversal — Python Document Extractor

**PASS** — `document_extractor.py` line 17:
```python
safe_name = os.path.basename(filename.replace("..", "_"))
```
- `..` replaced with `_`
- `os.path.basename()` strips directory components
- File written to `tempfile.mkdtemp()` (unique temp dir)
- Cleanup in `finally` block

### 4.5 Broken Access Control

**PASS** — All file-serving paths require either:
- Valid auth + tenant prefix match
- Valid one-time download token matching exact fileKey
- No fallthrough to public access

---

## 5. Data Exposure

### 5.1 Public File Fallthrough

**PASS** — `filesRouter.get('/*')` returns 401 when no auth and no download token (line 100). Verified.

### 5.2 Tenant Isolation

**PASS across all queries:**
- `upload-service.ts`: `getFile()` checks `fileKey.startsWith(tenantId/)` — line 70
- `upload-service.ts`: `listUploads()` filters by `eq(uploads.tenantId, tenantId)` — line 85
- `upload-service.ts`: `deleteFile()` filters by `and(eq(id), eq(tenantId))` — line 108
- `storage-search-service.ts`: keyword search filters `eq(fileExtractions.tenantId, tenantId)` — line 33
- `storage-search-service.ts`: semantic search filters `{ org_id: tenantId }` in Vectorize — line 60
- `extraction-service.ts`: `handleExtractionResult()` verifies `and(eq(id), eq(tenantId))` — line 19
- `internal.ts`: extraction-retry and status endpoints are internal-only (no tenant leakage)

### 5.3 Download Token One-Time Use

**PASS** — Token deleted from KV before file is served (line 73). 15-min TTL as backup expiration.

---

## 6. Additional Findings

### 6.1 Encryption at Rest

| Severity | Finding |
|----------|---------|
| **LOW** | PBKDF2 salt is hardcoded: `'agentwiki-ai-keys'` (`packages/api/src/utils/encryption.ts` line 19). This means all tenants share the same salt. Not a vulnerability if `AI_ENCRYPTION_KEY` is strong, but per-tenant salts would be better practice. |

### 6.2 Docker Security

| Severity | Finding |
|----------|---------|
| **LOW** | Dockerfile runs as root (no `USER` directive). Add `RUN useradd -r appuser && USER appuser` for least-privilege. |

### 6.3 Health Endpoint Information Disclosure

| Severity | Finding |
|----------|---------|
| **INFO** | `/health` endpoint exposes queue job counts (active, waiting, failed, completed). No auth required. Minor info leak about system load. Consider restricting or removing job counts from public health check. |

### 6.4 Error Message Leakage

| Severity | Finding |
|----------|---------|
| **LOW** | `internal.ts` line 39 returns `(err as Error).message` in 500 response. Internal-only route, so low risk, but could leak stack traces to VPS logs. |

### 6.5 Vectorize Deletion Best-Effort

| Severity | Finding |
|----------|---------|
| **INFO** | `upload-service.ts` line 118-119: Vectorize cleanup generates IDs `upload-{id}-0` through `upload-{id}-49` and deletes them. If an upload produced more than 50 chunks, orphaned vectors remain. Not a security issue per se, but could cause stale search results. |

---

## Summary

| Category | Status | Issues |
|----------|--------|--------|
| Secrets/Credentials | PASS | None |
| Authentication | PASS with 1 MEDIUM | Python timing-safe comparison missing |
| Input Validation | PASS | All validated with Zod/whitelist/escaping |
| SQL Injection | PASS | Drizzle parameterization + LIKE escaping |
| XSS | PASS | React auto-escaping |
| SSRF | PASS with 1 MEDIUM | VPS trusts job URL without allowlist |
| Path Traversal | PASS | basename + .. replacement |
| Access Control | PASS | Tenant isolation verified across all queries |
| Data Exposure | PASS | No public fallthrough, one-time tokens |

### Action Items (by priority)

1. **MEDIUM — Fix Python timing attack:** Use `hmac.compare_digest()` in `app/main.py:43`
2. **MEDIUM — Add URL allowlist in VPS worker:** Validate `file_url` starts with expected API domain before downloading
3. **LOW — Docker non-root user:** Add `USER` directive to Dockerfile
4. **LOW — Hardcoded PBKDF2 salt:** Consider per-tenant salt for AI key encryption
5. **INFO — Health endpoint:** Consider auth-gating queue stats or removing from public response

---

**Status:** DONE
**Summary:** No critical or high-severity issues found. Two medium findings: Python secret comparison not timing-safe, and VPS worker lacks URL allowlist for SSRF defense-in-depth. Overall security posture is solid — tenant isolation, input validation, access control, and one-time download tokens are well implemented.
