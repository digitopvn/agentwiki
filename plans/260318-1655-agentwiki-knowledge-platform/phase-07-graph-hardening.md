---
title: "Phase 7: Knowledge Graph & Security Hardening"
status: pending
priority: P2
effort: 16h
---

# Phase 7: Knowledge Graph & Security Hardening

## Context Links
- [Architecture — Knowledge Graph & Security](../reports/researcher-02-260318-1655-knowledge-platform-architecture.md)
- [Phase 3 — Wikilinks & document_links](./phase-03-core-api-database.md)

## Overview
Knowledge graph visualization using Cytoscape.js. Extract wikilinks + backlinks, render interactive force-directed graph. Security hardening: OWASP audit, CSP headers, input sanitization, E2E tests with Playwright.

## Key Insights
- Cytoscape.js handles 10K-100K nodes; good for knowledge base graphs
- Graph data from `document_links` table (Phase 3) + optional semantic similarity edges
- Force-directed layout (cose or cola) auto-positions nodes
- Interactive: click → navigate, hover → preview, filter by category/tag
- Security: CSP headers via `_headers` file on Cloudflare Pages
- E2E: Playwright against local wrangler dev for realistic testing

## Requirements

### Functional
- Knowledge graph page showing document relationships
- Nodes = documents, edges = wikilinks (forward + back)
- Force-directed layout with physics simulation
- Click node → navigate to document
- Hover node → show title + summary preview
- Filter graph by category, tag, folder
- Zoom, pan, fit-to-screen controls
- Mini-map for large graphs

### Non-Functional
- Graph render < 1s for 1000 nodes
- Smooth interaction at 30fps minimum
- All OWASP top 10 mitigations in place
- E2E test suite covering critical paths

## Architecture

### Graph Data API
```
GET /api/graph?category=&tag=&folder=
Response: {
  nodes: [{ id, label, category, tags, summary, updatedAt }],
  edges: [{ source, target, linkText }]
}

Built from:
  - nodes: SELECT id, title, category, summary FROM documents WHERE tenant_id = ?
  - edges: SELECT source_id, target_id, link_text FROM document_links
           WHERE source_id IN (tenant doc IDs)
```

### Component Structure
```
<GraphPage>
  <GraphToolbar>              ← filter controls, layout toggle, zoom
    <CategoryFilter />
    <TagFilter />
    <LayoutSelector />
    <ZoomControls />
  </GraphToolbar>
  <GraphCanvas>               ← Cytoscape.js container
    <CytoscapeComponent />
    <NodePreview />           ← hover tooltip
    <MiniMap />               ← small overview
  </GraphCanvas>
</GraphPage>
```

## Related Code Files

### Files to Create
- `packages/api/src/routes/graph.ts` — graph data endpoint
- `packages/api/src/services/graph-service.ts` — build graph from DB
- `packages/web/src/routes/graph.tsx` — graph page
- `packages/web/src/components/graph/graph-canvas.tsx` — Cytoscape wrapper
- `packages/web/src/components/graph/graph-toolbar.tsx` — filters + controls
- `packages/web/src/components/graph/node-preview.tsx` — hover tooltip
- `packages/web/src/hooks/use-graph.ts` — graph data fetching
- `packages/web/public/_headers` — CSP + security headers
- `packages/web/public/_redirects` — Cloudflare Pages redirects (SPA)
- `tests/e2e/auth.spec.ts` — auth E2E tests
- `tests/e2e/documents.spec.ts` — document CRUD E2E
- `tests/e2e/search.spec.ts` — search E2E
- `tests/e2e/graph.spec.ts` — graph page E2E
- `tests/e2e/playwright.config.ts` — Playwright config
- `packages/api/src/middleware/security-headers.ts` — security header middleware

### Files to Modify
- `packages/api/src/index.ts` — register graph route, add security middleware
- `packages/web/src/app.tsx` — add graph route
- `packages/web/src/components/layout/sidebar.tsx` — add graph nav link

## Implementation Steps

### 1. Graph API (2h)
1. `services/graph-service.ts`:
   ```typescript
   export async function buildGraph(tenantId: string, filters?: GraphFilters) {
     // Fetch documents (filtered)
     let query = db.select().from(documents).where(eq(documents.tenantId, tenantId))
     if (filters?.category) query = query.where(eq(documents.category, filters.category))
     // ... tag filter via join on document_tags

     const docs = await query
     const docIds = docs.map(d => d.id)

     // Fetch edges
     const links = await db.select().from(documentLinks)
       .where(inArray(documentLinks.sourceId, docIds))

     return {
       nodes: docs.map(d => ({
         id: d.id, label: d.title, category: d.category,
         summary: d.summary, updatedAt: d.updatedAt
       })),
       edges: links.map(l => ({
         source: l.sourceId, target: l.targetId, linkText: l.linkText
       }))
     }
   }
   ```
2. `routes/graph.ts`:
   - `GET /api/graph?category=&tag=&folder=` — return nodes + edges

### 2. Cytoscape.js Graph (5h)
1. Install: `cytoscape`, `cytoscape-cose-bilkent` (better force layout)
2. `components/graph/graph-canvas.tsx`:
   ```typescript
   import cytoscape from 'cytoscape'
   import coseBilkent from 'cytoscape-cose-bilkent'
   cytoscape.use(coseBilkent)

   export function GraphCanvas({ nodes, edges }) {
     const containerRef = useRef<HTMLDivElement>(null)
     const cyRef = useRef<cytoscape.Core>()

     useEffect(() => {
       cyRef.current = cytoscape({
         container: containerRef.current,
         elements: [
           ...nodes.map(n => ({ data: { id: n.id, label: n.label, ...n } })),
           ...edges.map(e => ({ data: { source: e.source, target: e.target } }))
         ],
         layout: { name: 'cose-bilkent', animate: true, nodeDimensionsIncludeLabels: true },
         style: [
           { selector: 'node', style: {
             'label': 'data(label)',
             'background-color': mapCategoryToColor,
             'font-size': 12, 'text-wrap': 'ellipsis', 'text-max-width': 100
           }},
           { selector: 'edge', style: {
             'curve-style': 'bezier', 'target-arrow-shape': 'triangle',
             'line-color': '#ccc', 'width': 1
           }}
         ]
       })

       // Events
       cyRef.current.on('tap', 'node', (e) => navigateToDocument(e.target.id()))
       cyRef.current.on('mouseover', 'node', (e) => showPreview(e.target.data()))
       cyRef.current.on('mouseout', 'node', () => hidePreview())

       return () => cyRef.current?.destroy()
     }, [nodes, edges])

     return <div ref={containerRef} className="w-full h-full" />
   }
   ```
3. Node styling: color by category, size by link count (more links = larger)
4. Edge styling: directed arrows, different colors for different link types
5. `components/graph/graph-toolbar.tsx`:
   - Category filter dropdown
   - Tag multi-select
   - Layout toggle (force-directed / circle / grid)
   - Zoom in/out/fit buttons
   - Search within graph (highlight matching nodes)

### 3. Node Preview Tooltip (1h)
1. `components/graph/node-preview.tsx`:
   - Positioned near hovered node
   - Shows: title, category badge, first 100 chars of summary, tag pills
   - Disappears on mouseout

### 4. Security Headers (2h)
1. `packages/web/public/_headers`:
   ```
   /*
     X-Frame-Options: DENY
     X-Content-Type-Options: nosniff
     Referrer-Policy: strict-origin-when-cross-origin
     Permissions-Policy: camera=(), microphone=(), geolocation=()
     Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: *.r2.dev; connect-src 'self' https://api.agentwiki.com
   ```
2. `middleware/security-headers.ts` (API):
   ```typescript
   export function securityHeaders(): MiddlewareHandler {
     return async (c, next) => {
       await next()
       c.header('X-Content-Type-Options', 'nosniff')
       c.header('X-Frame-Options', 'DENY')
       c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
     }
   }
   ```

### 5. Input Sanitization Audit (1h)
1. Review all user input paths:
   - Document content: already handled by BlockNote + Zod validation
   - File uploads: validate content-type, filename sanitization
   - Search queries: parameterized in FTS5 + Vectorize
   - URL params: validated by Zod schemas
2. Add `DOMPurify` for any raw HTML rendering (share viewer, published pages)
3. SQL injection: verify all queries use Drizzle parameterized queries (no raw SQL with interpolation)

### 6. Rate Limiting Refinement (1h)
1. Per-endpoint limits:
   - Auth endpoints: 10 req/min (brute force protection)
   - Document CRUD: 100 req/min
   - Search: 50 req/min
   - File upload: 20 req/min
   - Graph: 30 req/min
2. Per-role multipliers: Agent keys get 2x limit, Admin gets 5x

### 7. Performance Optimization (2h)
1. **Web bundle splitting**:
   - Lazy load editor route (BlockNote is heavy)
   - Lazy load graph route (Cytoscape is heavy)
   - `React.lazy(() => import('./routes/dashboard'))` etc.
2. **KV caching audit**:
   - Cache graph data per tenant (TTL 120s)
   - Cache user permissions (TTL 60s)
   - Cache category/tag lists (TTL 300s)
3. **Query optimization**:
   - Add missing indexes (review slow query patterns)
   - Batch D1 queries where possible (`.batch()` API)

### 8. E2E Testing (2h)
1. `tests/e2e/playwright.config.ts`:
   ```typescript
   export default defineConfig({
     testDir: './tests/e2e',
     webServer: [
       { command: 'pnpm --filter api dev', port: 8787 },
       { command: 'pnpm --filter web dev', port: 5173 }
     ],
     use: { baseURL: 'http://localhost:5173' }
   })
   ```
2. Test scenarios:
   - `auth.spec.ts`: login flow, logout, session persistence
   - `documents.spec.ts`: create doc, edit, save, delete, version history
   - `search.spec.ts`: keyword search, navigate to result
   - `graph.spec.ts`: graph loads, nodes visible, click navigates
3. CI integration: add Playwright to GitHub Actions workflow

## Todo List
- [ ] Implement graph data API (nodes + edges from DB)
- [ ] Build Cytoscape.js graph canvas component
- [ ] Implement graph toolbar (filters, layout, zoom)
- [ ] Build node preview tooltip
- [ ] Add graph route to web app + sidebar nav
- [ ] Configure security headers (_headers file + API middleware)
- [ ] Audit input sanitization across all endpoints
- [ ] Add DOMPurify for HTML rendering paths
- [ ] Refine per-endpoint rate limits
- [ ] Implement bundle splitting (lazy load editor + graph)
- [ ] Add KV caching for graph + permissions + categories
- [ ] Optimize D1 queries + add missing indexes
- [ ] Setup Playwright + write E2E test suite
- [ ] Add E2E tests to CI pipeline
- [ ] Final security review (OWASP checklist)

## Success Criteria
- Knowledge graph renders with correct nodes + edges
- Click node → navigates to document
- Hover → shows preview tooltip
- Filter by category/tag updates graph in real-time
- Graph handles 500+ nodes without lag
- All security headers present (verify with securityheaders.com)
- No XSS vectors in share viewer or published pages
- E2E tests pass: auth, doc CRUD, search, graph
- Bundle size: main chunk < 150KB, editor chunk < 200KB, graph chunk < 100KB
- Lighthouse performance score > 80

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Cytoscape performance with large graphs | Medium | Medium | Limit to 1000 nodes; paginate; show "zoom to area" |
| CSP breaks BlockNote or Cytoscape | Medium | Medium | Test CSP locally; use nonces if inline scripts needed |
| E2E tests flaky with wrangler dev | High | Low | Retry config in Playwright; increase timeouts |
| Missing security vectors | Low | Critical | Use OWASP ZAP automated scan; manual review |

## Security Considerations
- CSP: restrict script-src, style-src, img-src, connect-src
- HSTS: enforce HTTPS with long max-age
- X-Frame-Options: DENY prevents clickjacking
- DOMPurify on all HTML rendering paths
- Rate limiting on all endpoints
- Audit log retention: 1 year, append-only
- Regular dependency audit: `pnpm audit` in CI

## Next Steps
- Post-launch: Durable Objects for real-time collaboration (premium feature)
- Post-launch: Additional SSO providers (Okta, Microsoft Entra)
- Post-launch: Advanced analytics dashboard
- Post-launch: Mobile-responsive improvements
