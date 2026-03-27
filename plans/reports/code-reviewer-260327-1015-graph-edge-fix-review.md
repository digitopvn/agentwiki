# Code Review: Knowledge Graph Edge Extraction & Mobile Responsiveness

**Date:** 2026-03-27
**Reviewer:** code-reviewer
**Scope:** 8 files across api + web packages
**Focus:** Regex correctness, security, edge cases, mobile UX, performance

## Overall Assessment

Solid fix for the core problem (0 edges due to BlockNote producing `[text](/doc/slug)` instead of `[[wikilinks]]`). The link extraction logic is clean and the dedup strategy is correct. One **critical** bug found: the backfill endpoint uses a non-existent permission string. Several medium-priority items around performance and edge cases.

---

## Critical Issues

### 1. Backfill endpoint permission string does not exist (BLOCKING)

**File:** `packages/api/src/routes/graph.ts:174`

```ts
graphRouter.post('/backfill-edges', requirePermission('org:manage'), async (c) => {
```

`org:manage` is not defined in `PERMISSIONS` (packages/shared/src/constants.ts). Admin role has `tenant:manage`, not `org:manage`. The `hasPermission()` check will return `false` for ALL roles, including admin. Endpoint is effectively dead code -- always returns 403.

**Fix:** Change to `requirePermission('tenant:manage')` or use the existing `requireAdmin` export.

### 2. Backfill endpoint has no rate limiting or size guard

**File:** `packages/api/src/routes/graph.ts:179-193`

The endpoint loads ALL documents into memory and processes them sequentially with individual DB queries per link. For a tenant with thousands of docs, this will:
- Exceed Cloudflare Workers CPU time limits (50ms free / 30s paid per request)
- Hold a single request open for an unbounded duration

**Fix:** Add pagination (process in batches of 50-100), or return a job ID and process via queue. At minimum, add a `LIMIT` clause and allow repeated calls.

---

## High Priority

### 3. N+1 query pattern in syncWikilinks

**File:** `packages/api/src/services/document-service.ts:525-551`

Each extracted link triggers an individual DB query to resolve the target (line 526-536). For a document with 20 links, that's 20 sequential DB roundtrips + 20 inserts.

**Suggestion:** Batch-resolve all targets in one query using `WHERE slug IN (...) OR title IN (...) OR id IN (...)`, then iterate locally. Would reduce from O(N) queries to O(1).

### 4. SQL injection surface in raw SQL template

**File:** `packages/api/src/services/document-service.ts:533`

```ts
sql`(${documents.id} = ${link.target} OR ${documents.slug} = ${link.target.toLowerCase()} OR ${documents.title} = ${link.target})`
```

Drizzle parameterizes template values, so this is **safe**. However, the `link.target` comes from user-authored markdown content. The parameterization makes this safe, but worth noting for future reviewers that this relies on Drizzle's tagged template behavior.

### 5. Regex does not handle URL-encoded slugs

**File:** `packages/api/src/utils/wikilink-extractor.ts:16`

```ts
const INTERNAL_LINK_REGEX = /\[([^\]]*)\]\(\/doc\/([^)]+)\)/g
```

If BlockNote generates links like `/doc/my%20document`, the `%20` will be passed as-is to the DB lookup. The slug in DB likely stores `my-document` (slugified), so URL-encoded spaces/special chars will fail to match.

**Fix:** Apply `decodeURIComponent()` to `match[2]` before returning.

---

## Medium Priority

### 6. Case sensitivity mismatch in dedup vs resolution

**File:** `packages/api/src/utils/wikilink-extractor.ts:74`
**File:** `packages/api/src/services/document-service.ts:533`

`extractAllLinks()` deduplicates by `target.toLowerCase()`, but the SQL resolution does `documents.slug = link.target.toLowerCase()` only for slug, while `documents.title = link.target` (case-sensitive) and `documents.id = link.target` (case-sensitive). This means two links with different casing pointing to the same title would both be extracted but only one would resolve, which is fine. But a link targeting a title with different casing than stored won't resolve at all.

**Suggestion:** Use `LOWER()` SQL function for title comparison too: `LOWER(${documents.title}) = ${link.target.toLowerCase()}`

### 7. Backfill edge count is misleading

**File:** `packages/api/src/routes/graph.ts:189-192`

```ts
const edges = await db.select({ id: documentLinks.id })
  .from(documentLinks)
  .where(eq(documentLinks.sourceDocId, doc.id))
edgesCreated += edges.length
```

This counts ALL edges for the doc after sync, not just newly created ones. If a doc already had 5 edges and sync recreates them, it reports 5 "created." Also, this is an extra query per document that could be avoided.

**Suggestion:** Have `syncWikilinks` return the count of inserted links instead of re-querying.

### 8. GraphInsightPanel mobile toggle creates layout shift

**File:** `packages/web/src/components/graph/graph-insight-panel.tsx:35`

The panel uses `absolute inset-y-0 right-0 z-10` when open on mobile, which overlays the graph canvas. The `hidden md:relative md:flex` means on desktop it's always visible. This is acceptable UX, but the toggle button at `right-3 top-14` might overlap with the header depending on header height.

**Minor:** Consider adding `safe-area-inset` padding for notched mobile devices.

---

## Low Priority

### 9. `scrollbar-none` in toolbar

**File:** `packages/web/src/components/graph/graph-toolbar.tsx:26`

`scrollbar-none` is a Tailwind plugin class. Verify it's configured; otherwise the scrollbar will be visible on overflow. Non-breaking if missing -- just cosmetic.

### 10. Self-link prevention is correct but silent

**File:** `packages/api/src/services/document-service.ts:538`

`target[0].id !== docId` correctly prevents self-links. Good.

---

## Positive Observations

- Clean separation: `extractWikilinks`, `extractInternalLinks`, `extractAllLinks` -- modular and testable
- Wikilinks take priority in dedup (preserving type annotations) -- correct design choice
- `h-dvh` instead of `h-screen` correctly handles mobile browser chrome
- Legend hidden on `sm:` breakpoint avoids clutter on phones
- Graph insight panel collapsible on mobile with clean toggle
- Self-link and duplicate prevention in `syncWikilinks`
- Context extraction (40 chars before/after) preserved for both link types

---

## Recommended Actions

1. **[CRITICAL]** Fix permission: `org:manage` -> `tenant:manage` in graph.ts:174
2. **[CRITICAL]** Add size guard to backfill: LIMIT + batch processing or queue-based
3. **[HIGH]** Batch-resolve link targets to eliminate N+1 query pattern
4. **[HIGH]** `decodeURIComponent()` on extracted internal link targets
5. **[MEDIUM]** Case-insensitive title matching in SQL resolution
6. **[MEDIUM]** Return insert count from `syncWikilinks` instead of re-querying

## Unresolved Questions

- Does BlockNote ever generate links with query params (e.g., `/doc/slug?version=2`)? If so, the regex would capture the query string as part of the target.
- Are there existing documents with titles containing special characters that would affect slug matching?
- Is there a Cloudflare Workers CPU time limit concern for the sequential `syncWikilinks` call during normal document save (not backfill)?
