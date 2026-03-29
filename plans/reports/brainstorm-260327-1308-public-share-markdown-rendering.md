# Brainstorm: Public Share Pages Markdown Rendering

**Issue:** [#56](https://github.com/digitopvn/agentwiki/issues/56)
**Date:** 2026-03-27
**Status:** Approved

## Problem Statement

Public share pages (`/share/:token`) render markdown as plain text using `whitespace-pre-wrap`. No markdown parsing/rendering. Users see raw `#`, `**`, `- ` syntax instead of formatted content. Additionally, API needs to support `Accept: text/markdown` header for raw markdown plain-text responses.

## Requirements

1. **Well-rendered markdown** on share pages (headings, lists, tables, code blocks, images, links, blockquotes)
2. **Accept: text/markdown** content negotiation — API returns raw markdown with `Content-Type: text/markdown` when requested
3. **Syntax highlighting** for code blocks
4. **New route** `/doc/:slug` for published docs (SEO-friendly)

## Evaluated Approaches

### Approach A: react-markdown + rehype plugins (CHOSEN)
- **Pros**: Lightweight (~30KB gzip), excellent GFM support, works with Tailwind prose, XSS-safe by default (no dangerouslySetInnerHTML), active ecosystem
- **Cons**: New dependency, need remark-gfm for tables/strikethrough
- **Bundle**: react-markdown (~12KB) + remark-gfm (~5KB) + rehype-highlight (~3KB) + highlight.js (~12KB subset) ≈ ~35KB gzip

### Approach B: BlockNote read-only viewer
- **Pros**: Exact editor fidelity
- **Cons**: BlockNote v0.22 read-only not well-documented, heavy bundle, couples share view to editor internals, contentJson format is proprietary
- **Verdict**: Rejected — over-engineered, tight coupling

### Approach C: Server-side HTML conversion
- **Pros**: No frontend dependency
- **Cons**: Current regex converter is fragile, would need a proper library (marked/markdown-it) on Workers, harder to style consistently
- **Verdict**: Rejected — shifts complexity to backend, harder to maintain

## Final Design

### 1. Frontend: ShareView Markdown Renderer

**New dependencies:**
- `react-markdown` — renders markdown to React components
- `remark-gfm` — GitHub Flavored Markdown (tables, strikethrough, task lists)
- `rehype-highlight` — syntax highlighting via highlight.js
- `highlight.js` — syntax highlighting engine (import only needed languages)

**Component**: Extract ShareView from `app.tsx` into `packages/web/src/routes/share-view.tsx`

**Implementation:**
```tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

<ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
  {doc.content}
</ReactMarkdown>
```

Style with Tailwind `prose prose-invert` classes. Add highlight.js dark theme CSS.

### 2. Backend: Accept: text/markdown Content Negotiation

**File**: `packages/api/src/routes/share.ts`

Modify `GET /share/public/:token`:
```ts
shareRouter.get('/public/:token', async (c) => {
  const result = await getDocumentByShareToken(c.env, c.req.param('token'))
  if (!result) return c.json({ error: 'Not found' }, 404)

  const accept = c.req.header('Accept') || ''
  if (accept.includes('text/markdown')) {
    return c.text(result.document.content, 200, {
      'Content-Type': 'text/markdown; charset=utf-8',
    })
  }
  return c.json(result)
})
```

### 3. New Route: /doc/:slug for Published Documents

**Frontend**: Add `/doc/:slug` route in `app.tsx` → reuses ShareView component
**Backend**: Add `GET /share/published/:slug` endpoint that looks up by document slug/ID
- Query `documents` table where `accessLevel = 'public'` and match by slug
- Return same format as share token response

### 4. Image Handling

Images in markdown reference `/api/uploads/:tenantId/:filename`. Share view needs to handle these:
- If image URLs are relative to API, they'll work as-is (same domain)
- Custom `img` component in ReactMarkdown to add lazy loading + error handling

### 5. Security

- `react-markdown` does NOT use `dangerouslySetInnerHTML` — safe by default
- No need for `rehype-sanitize` since react-markdown outputs React elements
- Strip `contentJson` from public API response (only return `content` markdown)

## Implementation Plan

| Phase | Scope | Files |
|-------|-------|-------|
| 1 | Install deps, create MarkdownRenderer component | package.json, new component |
| 2 | Refactor ShareView to use MarkdownRenderer | app.tsx → share-view.tsx |
| 3 | Add Accept: text/markdown to API | share.ts |
| 4 | Add /doc/:slug route (frontend + backend) | app.tsx, share.ts, share-service.ts |
| 5 | Styling & polish (highlight.js theme, responsive) | CSS/Tailwind |

## Risks

- **Bundle size**: ~35KB gzip addition — acceptable for a knowledge platform
- **highlight.js languages**: Import only common ones (js, ts, python, bash, json, sql, html, css) to control size
- **Image auth**: Upload images behind auth won't render in public view — need to check if share token provides image access

## Success Criteria

- [ ] Share page renders headings, lists, tables, code blocks, links, images, blockquotes properly
- [ ] Code blocks have syntax highlighting with dark theme
- [ ] `curl -H "Accept: text/markdown" /api/share/public/:token` returns raw markdown
- [ ] `/doc/:slug` route works for published documents
- [ ] No XSS vulnerabilities
- [ ] Bundle size increase < 50KB gzipped
