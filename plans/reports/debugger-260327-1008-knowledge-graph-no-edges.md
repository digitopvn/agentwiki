# Debug Report: Knowledge Graph Shows No Edges

**Date:** 2026-03-27
**Status:** ROOT CAUSE IDENTIFIED
**Severity:** Critical — core feature completely non-functional
**URL:** https://app.agentwiki.cc/graph

---

## Executive Summary

Knowledge Graph displays all documents as orphan nodes with zero connections. **Root cause: the edge creation pipeline only extracts `[[wikilinks]]` but the BlockNote WYSIWYG editor produces standard markdown links `[text](url)`, so no edges are ever created.** Secondary issue: implicit similarity edges are disabled by default in the UI.

---

## Root Cause Analysis

### PRIMARY: Wikilink Extraction Disconnected from Editor Output

**The data flow has a fundamental disconnect:**

```
Editor (BlockNote WYSIWYG)
  → saves contentJson (BlockNote JSON)  [Stage 1: immediate]
  → converts to markdown via blocksToMarkdownLossy()  [Stage 2: deferred]
  → markdown uses standard links: [text](url)

syncWikilinks()
  → regex: /\[\[([^\]]+)\]\]/g
  → looks for [[wikilink]] syntax
  → NEVER finds any matches in BlockNote-generated markdown
  → document_links table stays EMPTY
  → Graph API returns 0 edges
```

**Evidence chain:**

1. `packages/web/src/components/editor/editor.tsx:164` — `editor.blocksToMarkdownLossy(snapshotBlocks)` produces standard markdown, NOT wikilink syntax
2. `packages/api/src/utils/wikilink-extractor.ts:12` — `WIKILINK_REGEX = /\[\[([^\]]+)\]\]/g` only matches `[[...]]`
3. `packages/api/src/services/document-service.ts:402` — `syncWikilinks()` called on every content update, finds 0 links
4. `packages/api/src/services/graph-service.ts:245` — `fetchLinks()` queries `document_links` table → returns empty
5. `packages/api/src/services/graph-service.ts:155-167` — `formatGraphResponse()` creates 0 explicit edges

**BlockNote creates links like:**
```markdown
Check out [Getting Started](/doc/abc123) for more info.
```

**But the extractor expects:**
```markdown
Check out [[Getting Started]] for more info.
```

### SECONDARY: Implicit Similarity Edges Disabled by Default

- `packages/web/src/components/graph/graph-toolbar.tsx:52` — `filters.includeImplicit ?? false`
- Even if the user toggles "Similarity" ON, the similarities require:
  - Vectorize embeddings to exist (queue job `embed` → `compute-similarities`)
  - Cosine similarity ≥ 0.7 threshold (`similarity-service.ts:10`)
  - Queue processing to have completed successfully

### TERTIARY: No Internal Link Detection

The system has no mechanism to detect **internal navigation links** like `[text](/doc/{id})` or `[text](/doc/{slug})` that BlockNote might produce when users create links to other documents within the wiki.

---

## Mobile Responsiveness Issues

**File:** `packages/web/src/routes/graph.tsx`

| Issue | Location | Impact |
|-------|----------|--------|
| `h-screen` doesn't account for mobile browser chrome | `graph.tsx:31` | Canvas gets clipped behind mobile address bar |
| GraphInsightPanel sidebar doesn't collapse | `graph.tsx:70-73` | Takes ~300px on mobile, crushing canvas |
| Toolbar filter buttons overflow | `graph-toolbar.tsx:28-46` | Edge type buttons wrap badly on small screens |
| Zoom controls overlap legend | `graph-canvas.tsx:218,243` | Both positioned bottom corners, overlap on narrow screens |
| No touch gesture support | `graph-canvas.tsx` | Cytoscape has touch support but pinch-to-zoom may conflict with browser |

---

## Recommended Fixes

### Fix 1: Extract Internal Links from Markdown (Quick Win)

Add standard markdown link extraction alongside wikilinks in `wikilink-extractor.ts`:

```typescript
// Match internal document links: [text](/doc/slug-or-id)
const INTERNAL_LINK_REGEX = /\[([^\]]+)\]\(\/doc\/([^)]+)\)/g
```

Resolve target by ID or slug, create edges same as wikilinks.

**Pros:** Minimal code change, works with existing BlockNote output
**Cons:** Depends on links using `/doc/` prefix; fragile if URL format changes

### Fix 2: Extract Links from BlockNote JSON (Most Robust)

Parse `contentJson` directly instead of markdown. BlockNote JSON has structured link data:

```json
{ "type": "link", "href": "/doc/abc123", "content": [{"type": "text", "text": "Getting Started"}] }
```

Add a `extractLinksFromBlockNote(contentJson)` function that walks the block tree.

**Pros:** Most reliable, no regex parsing, works regardless of markdown format
**Cons:** Requires understanding BlockNote JSON schema; needs to handle both `contentJson` and `content` paths

### Fix 3: Add Wikilink Support to BlockNote (Enhances UX)

Create a BlockNote custom inline content type or slash command for `[[wikilinks]]` with autocomplete.

**Pros:** Wiki-native experience, enables type annotations `[[Page|type:depends-on]]`
**Cons:** Significant effort; BlockNote custom inline content API may be limited

### Fix 4: Enable Implicit Edges by Default

Change default filter: `includeImplicit ?? false` → `includeImplicit ?? true`

**Pros:** Immediate visual improvement, shows AI-inferred connections
**Cons:** Only a bandaid; requires embeddings to exist and be computed

### Fix 5: Backfill Edges from Existing Content

Create a one-time migration job that:
1. Reads all documents' `content` (markdown) field
2. Extracts internal links using new regex
3. Populates `document_links` table

---

## Recommended Approach (Priority Order)

1. **Fix 1 + Fix 4** — Quick wins, immediately shows connections
2. **Fix 5** — Backfill existing docs so graph isn't empty
3. **Fix 2** — Long-term robust solution (extract from JSON)
4. **Fix 3** — UX enhancement for power users (wikilink autocomplete)
5. **Mobile fixes** — Responsive layout improvements

---

## Prevention

1. **Integration test**: Verify that saving a document with internal links creates entries in `document_links`
2. **Graph health check**: Add a warning banner when `stats.edgeCount === 0 && stats.nodeCount > 5` (likely missing edge extraction)
3. **Editor-Graph contract**: Document that edge extraction must match editor link output format
4. **E2E test**: Create doc A, link to doc B in editor, verify edge appears in graph API response

---

## Files Involved

| File | Role |
|------|------|
| `packages/api/src/utils/wikilink-extractor.ts` | Only extracts `[[wikilinks]]`, misses standard links |
| `packages/api/src/services/document-service.ts:511-550` | `syncWikilinks()` — edge creation entry point |
| `packages/web/src/components/editor/editor.tsx:161-170` | Deferred markdown conversion via BlockNote |
| `packages/api/src/services/graph-service.ts` | Graph data fetching (works correctly, just no data) |
| `packages/web/src/components/graph/graph-canvas.tsx` | Cytoscape rendering (works correctly) |
| `packages/web/src/components/graph/graph-toolbar.tsx:52` | Implicit edges default=false |
| `packages/web/src/routes/graph.tsx` | Mobile layout issues |

---

**Status:** DONE
**Summary:** Graph edges broken because wikilink-only extraction doesn't match BlockNote editor output. Recommend extracting standard markdown links + enabling implicit edges by default.
