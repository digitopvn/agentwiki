---
phase: 5
title: "Frontend Graph Visualization"
status: completed
priority: P1
effort: 20h
dependencies: [phase-02, phase-03]
---

# Phase 5: Frontend Graph Visualization + AI Insight Panel

Interactive Cytoscape.js graph with edge type styling and AI insights sidebar.

## Context Links
- [plan.md](plan.md) | [Phase 2](phase-02-graph-traversal-api.md) | [Phase 3](phase-03-implicit-similarity-layer.md)
- Web package: `packages/web/src/`
- App store: `packages/web/src/stores/app-store.ts`
- Layout: `packages/web/src/components/layout.tsx`

## Overview

Full-page graph view accessible from sidebar. Cytoscape.js with force-directed layout, typed edge styling, filter controls, and AI insight panel showing clusters, suggestions, and explanations.

## Requirements

### Functional
- Graph page at `/graph` route
- Cytoscape.js with `cose-bilkent` layout
- Edge type → color + line style mapping
- Implicit edges → dotted gray, opacity by score
- Node size → degree (connection count)
- Click node → navigate to document editor
- Hover node → tooltip (title + summary + tags)
- Filter bar: edge types, categories, tags, implicit toggle, min-similarity slider
- Zoom/pan/fit-to-screen controls
- AI insight panel (collapsible sidebar):
  - Cluster labels
  - Suggested links for selected node
  - "Why connected?" for 2 selected nodes
  - Graph stats summary

### Non-functional
- Render <1s for 1K nodes
- Responsive: full-width on mobile (no insight panel), 3/4 + 1/4 split on desktop
- Lazy-load Cytoscape.js (chunked import)

## Architecture

```
/graph route
├── GraphPage (page container)
│   ├── GraphToolbar (filters, controls)
│   ├── GraphCanvas (Cytoscape.js wrapper)
│   └── GraphInsightPanel (AI insights sidebar)
└── hooks/
    ├── use-graph-data.ts (React Query for /api/graph)
    └── use-graph-insights.ts (AI insight queries)
```

## Related Code Files

### Create
- `packages/web/src/pages/graph-page.tsx` — Main graph page
- `packages/web/src/components/graph/graph-canvas.tsx` — Cytoscape.js wrapper
- `packages/web/src/components/graph/graph-toolbar.tsx` — Filter controls
- `packages/web/src/components/graph/graph-insight-panel.tsx` — AI insights sidebar
- `packages/web/src/components/graph/graph-node-tooltip.tsx` — Hover tooltip
- `packages/web/src/hooks/use-graph-data.ts` — Data fetching hook
- `packages/web/src/hooks/use-graph-insights.ts` — AI insight hooks

### Modify
- `packages/web/src/App.tsx` (or router config) — Add `/graph` route
- `packages/web/src/components/sidebar.tsx` — Add graph icon/link

## Implementation Steps

### Step 1: Install Dependencies

```bash
pnpm -F @agentwiki/web add cytoscape cytoscape-cose-bilkent
pnpm -F @agentwiki/web add -D @types/cytoscape
```

### Step 2: Shared Types Hook

`packages/web/src/hooks/use-graph-data.ts`:

```typescript
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiClient } from '../lib/api-client'
import type { GraphResponse } from '@agentwiki/shared'

export function useGraphData(opts: {
  category?: string
  tag?: string
  types?: string[]
  includeImplicit?: boolean
}) {
  return useQuery({
    queryKey: ['graph', opts],
    queryFn: () => apiClient.get<GraphResponse>('/api/graph', { params: {
      category: opts.category,
      tag: opts.tag,
      types: opts.types?.join(','),
      include_implicit: opts.includeImplicit,
    }}),
    staleTime: 60_000,
  })
}

export function useGraphNeighbors(docId: string | null, depth = 1) {
  return useQuery({
    queryKey: ['graph-neighbors', docId, depth],
    queryFn: () => apiClient.get(`/api/graph/neighbors/${docId}`, { params: { depth } }),
    enabled: !!docId,
  })
}

export function useGraphSimilar(docId: string | null) {
  return useQuery({
    queryKey: ['graph-similar', docId],
    queryFn: () => apiClient.get(`/api/graph/similar/${docId}`),
    enabled: !!docId,
  })
}
```

### Step 3: Graph Canvas Component

`packages/web/src/components/graph/graph-canvas.tsx`:

Key implementation:
- `useRef` for Cytoscape container div
- `useEffect` to init/update Cytoscape instance
- `cose-bilkent` layout with `nodeRepulsion: 4500`, `idealEdgeLength: 100`
- Edge style mapping:

```typescript
const EDGE_STYLES: Record<string, { color: string; style: string }> = {
  'relates-to': { color: '#9ca3af', style: 'solid' },
  'depends-on': { color: '#3b82f6', style: 'solid' },
  'extends': { color: '#22c55e', style: 'solid' },
  'references': { color: '#9ca3af', style: 'dashed' },
  'contradicts': { color: '#ef4444', style: 'dashed' },
  'implements': { color: '#a855f7', style: 'solid' },
}
```

- Implicit edges: `#d1d5db` dotted, opacity = score
- Node sizing: `width: 20 + degree * 4`, capped at 60px
- Event handlers: `tap` on node → navigate, `mouseover` → tooltip

### Step 4: Graph Toolbar

`packages/web/src/components/graph/graph-toolbar.tsx`:

Controls:
- Edge type checkboxes (6 types + implicit)
- Category dropdown (from existing categories)
- Tag filter input
- Similarity threshold slider (0.5-1.0)
- Zoom in/out/fit buttons
- Layout refresh button

### Step 5: AI Insight Panel

`packages/web/src/components/graph/graph-insight-panel.tsx`:

Sections:
- **Stats**: node count, edge count, density, orphan count
- **Clusters**: list of detected clusters with doc count (from `/api/graph/clusters` if available, else simple degree-based grouping)
- **Selected Node**: when a node is clicked, show suggested links
- **Two Nodes Selected**: show path between them, explain connection
- Collapsible on mobile

### Step 6: Graph Page

`packages/web/src/pages/graph-page.tsx`:

```typescript
export default function GraphPage() {
  const [filters, setFilters] = useState(defaultFilters)
  const { data, isLoading } = useGraphData(filters)
  const [selectedNodes, setSelectedNodes] = useState<string[]>([])

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col">
        <GraphToolbar filters={filters} onChange={setFilters} />
        <GraphCanvas
          data={data}
          onNodeSelect={(id) => setSelectedNodes([id])}
          onNodeNavigate={(id) => navigate(`/doc/${id}`)}
        />
      </div>
      <GraphInsightPanel
        stats={data?.stats}
        selectedNodes={selectedNodes}
      />
    </div>
  )
}
```

### Step 7: Add Route + Sidebar Link

- Add `/graph` route in router config
- Add graph icon in sidebar (Network/Share2 icon from Lucide)

### Step 8: Type-check + Visual Test

```bash
pnpm type-check
pnpm -F @agentwiki/web build
```

Manual visual testing with dev server.

## Todo List
- [x] Install cytoscape + cytoscape-cose-bilkent
- [x] Create `use-graph-data.ts` hook
- [x] Create `graph-canvas.tsx` — Cytoscape.js wrapper
- [x] Create `graph-toolbar.tsx` — filter controls
- [x] Create `graph-insight-panel.tsx` — AI insights sidebar
- [x] Create `graph-node-tooltip.tsx` — hover tooltip
- [x] Create `graph-page.tsx` — page container
- [x] Add `/graph` route
- [x] Add graph icon to sidebar
- [x] Type-check + build
- [x] Visual testing with dev server

## Success Criteria
- Graph renders with typed, colored edges
- Implicit edges shown as dotted lines with opacity
- Filter controls correctly filter visible elements
- Click node navigates to document
- Hover shows tooltip with summary
- AI insight panel shows stats and suggestions
- Renders <1s for 1K nodes
- Responsive on mobile

## Risk Assessment
- **Cytoscape.js bundle size**: ~500KB — lazy load via dynamic import to avoid impacting initial bundle
- **Layout performance**: `cose-bilkent` can be slow for >2K nodes — add loading indicator, consider switching to `fcose` if needed
- **Memory**: Cytoscape keeps all elements in memory — implement pagination/windowing for very large graphs
