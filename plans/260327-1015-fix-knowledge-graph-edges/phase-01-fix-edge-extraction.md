# Phase 1: Fix Edge Extraction

## Context

- [wikilink-extractor.ts](../../packages/api/src/utils/wikilink-extractor.ts) — current wikilink regex
- [document-service.ts](../../packages/api/src/services/document-service.ts) — `syncWikilinks()` at line 511

## Overview

- **Priority:** P1 (Critical — graph is completely broken without this)
- **Status:** Pending
- **Effort:** 1.5h

## Key Insight

BlockNote editor saves links as `[display text](/doc/slug-here)`. The extractor only looks for `[[wikilinks]]`. Need to also extract standard markdown internal links matching the `/doc/` URL pattern.

## Architecture

```
Content (markdown)
  ├── extractWikilinks()      → [[target]] links (existing, keep unchanged)
  ├── extractInternalLinks()  → [text](/doc/slug) links (NEW)
  └── merged + deduplicated   → document_links table
```

## Files to Modify

1. `packages/api/src/utils/wikilink-extractor.ts`
2. `packages/api/src/services/document-service.ts`

## Implementation Steps

### Step 1: Add `extractInternalLinks()` to wikilink-extractor.ts

Add new function after existing `extractWikilinks()`:

```typescript
const INTERNAL_LINK_REGEX = /\[([^\]]*)\]\(\/doc\/([^)]+)\)/g

/** Extract standard markdown links pointing to /doc/{slug} */
export function extractInternalLinks(content: string): ExtractedLink[] {
  const links: ExtractedLink[] = []
  let match: RegExpExecArray | null

  while ((match = INTERNAL_LINK_REGEX.exec(content)) !== null) {
    const displayText = match[1].trim() || null
    const target = match[2].trim() // slug or ID from URL

    // Extract ~80 chars of surrounding context
    const start = Math.max(0, match.index - 40)
    const end = Math.min(content.length, match.index + match[0].length + 40)
    const context = content.slice(start, end).replace(/\n/g, ' ').trim()

    links.push({ target, displayText, context, type: null })
  }

  return links
}
```

Key decisions:
- Regex: `/\[([^\]]*)\]\(\/doc\/([^)]+)\)/g` matches `[any text](/doc/any-slug)`
- `target` is the slug from URL path (second capture group)
- `type` is null (no type annotation in standard links)
- Context extraction mirrors existing wikilink approach

### Step 2: Update `syncWikilinks()` in document-service.ts

1. Import `extractInternalLinks` alongside existing `extractWikilinks`
2. In `syncWikilinks()` (line 511-550), after extracting wikilinks, also extract internal links
3. Merge both arrays, deduplicating by target (wikilinks take priority since they can have type annotations)

Changes at line 16:
```typescript
import { extractWikilinks, extractInternalLinks } from '../utils/wikilink-extractor'
```

Changes in `syncWikilinks()` function body (line 520-521):
```typescript
const wikilinks = extractWikilinks(content)
const internalLinks = extractInternalLinks(content)

// Merge: wikilinks first (they may have type annotations), deduplicate by target
const seen = new Set<string>()
const links = [...wikilinks, ...internalLinks].filter((link) => {
  const key = link.target.toLowerCase()
  if (seen.has(key)) return false
  seen.add(key)
  return true
})
if (!links.length) return
```

### Step 3: Fix target resolution for slug-based links

Current resolution (line 532) matches by `slug = target.toLowerCase() OR title = target`. This already works for slug-based targets from internal links. No change needed — the SQL query handles both cases.

## TODO

- [ ] Add `extractInternalLinks()` function to `wikilink-extractor.ts`
- [ ] Export new function from `wikilink-extractor.ts`
- [ ] Import `extractInternalLinks` in `document-service.ts`
- [ ] Update `syncWikilinks()` to merge both link sources with deduplication
- [ ] Verify existing `extractWikilinks` behavior unchanged
- [ ] Run `pnpm type-check` and `pnpm lint`

## Success Criteria

- `extractInternalLinks("[Go here](/doc/my-slug)")` returns `[{ target: "my-slug", ... }]`
- `syncWikilinks()` creates edges for both `[[wikilink]]` and `[text](/doc/slug)` format
- Existing wikilink tests (if any) still pass
- No duplicate edges when same doc linked via both formats

## Risk Assessment

- **Low risk:** Adding a new function, not modifying existing one
- **Edge case:** Links with encoded characters in slug (e.g., `%20`) — unlikely since slugs are normalized, but worth a note

## Security Considerations

- Regex is non-backtracking for common cases — no ReDoS risk
- Target resolution already scoped by `tenantId` — no cross-tenant leakage
