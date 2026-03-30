# Phase 3: Mobile Responsive Graph Page

## Context

- [graph.tsx](../../packages/web/src/routes/graph.tsx) — graph page layout
- [graph-canvas.tsx](../../packages/web/src/components/graph/graph-canvas.tsx) — Cytoscape canvas + zoom/legend
- [graph-toolbar.tsx](../../packages/web/src/components/graph/graph-toolbar.tsx) — filter toolbar
- [graph-insight-panel.tsx](../../packages/web/src/components/graph/graph-insight-panel.tsx) — side panel

## Overview

- **Priority:** P3
- **Status:** Pending
- **Effort:** 1h

## Key Issues

1. `h-screen` doesn't account for mobile browser chrome (address bar) — use `h-dvh`
2. `GraphInsightPanel` is fixed 288px (`w-72`) with no way to collapse on mobile
3. Toolbar edge type buttons don't wrap well on narrow screens
4. Zoom controls and legend overlap on small viewports

## Implementation Steps

### Step 1: Fix viewport height (graph.tsx)

Line 31: change `h-screen` to `h-dvh`:
```tsx
<div className="flex h-dvh flex-col bg-surface-0">
```

### Step 2: Collapsible insight panel (graph.tsx + graph-insight-panel.tsx)

In `graph.tsx`, add state for panel visibility:
```typescript
const [showInsights, setShowInsights] = useState(false)
```

Add toggle button in header (after the loading spinner):
```tsx
<button
  onClick={() => setShowInsights((v) => !v)}
  className="ml-auto text-neutral-400 hover:text-neutral-200 md:hidden"
  title="Toggle insights"
>
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
</button>
```

Update insight panel rendering:
```tsx
{/* Desktop: always show. Mobile: toggle */}
<div className={`${showInsights ? 'block' : 'hidden'} md:block`}>
  <GraphInsightPanel
    selectedNodes={selectedNodes}
    onNavigate={handleNodeNavigate}
  />
</div>
```

In `graph-insight-panel.tsx`, add responsive width:
```tsx
<div className="flex w-full flex-col gap-4 overflow-y-auto border-l border-white/[0.06] bg-surface-1 p-4 md:w-72">
```

On mobile when panel is visible, overlay it absolutely:
- Wrap the flex container content area to allow absolute positioning on mobile
- Add `absolute inset-y-0 right-0 z-10 w-72 md:relative md:inset-auto md:z-auto` to panel wrapper on mobile

### Step 3: Scrollable toolbar (graph-toolbar.tsx)

Line 26, change wrapper to allow horizontal scroll:
```tsx
<div className="flex items-center gap-3 overflow-x-auto border-b border-white/[0.06] px-4 py-2.5 scrollbar-none">
```

Add `shrink-0` to stat items so they don't collapse:
```tsx
<div className="ml-auto flex shrink-0 items-center gap-3 text-[11px] text-neutral-500">
```

### Step 4: Adjust zoom controls and legend (graph-canvas.tsx)

Zoom controls — move up from bottom to avoid overlap with legend on small screens:
```tsx
<div className="absolute bottom-4 right-4 flex flex-col gap-1 md:bottom-4">
```

Legend — hide on very small screens, show on tap or medium+:
```tsx
<div className="absolute bottom-4 left-4 hidden rounded-lg bg-surface-1/90 p-3 backdrop-blur-sm sm:block">
```

This hides the legend on phones (< 640px). The edge type colors are already shown in the toolbar filter buttons.

## Related Code Files

| File | Action |
|------|--------|
| `packages/web/src/routes/graph.tsx` | Modify: `h-dvh`, add panel toggle state, conditional rendering |
| `packages/web/src/components/graph/graph-insight-panel.tsx` | Modify: responsive width, mobile overlay positioning |
| `packages/web/src/components/graph/graph-toolbar.tsx` | Modify: `overflow-x-auto`, `shrink-0` on stats |
| `packages/web/src/components/graph/graph-canvas.tsx` | Modify: hide legend on small screens |

## TODO

- [ ] Change `h-screen` to `h-dvh` in graph.tsx
- [ ] Add `showInsights` toggle state + button in graph.tsx header
- [ ] Conditionally render GraphInsightPanel (hidden on mobile by default)
- [ ] Make insight panel overlay on mobile with `absolute` positioning
- [ ] Make insight panel full-width on mobile (`w-full md:w-72`)
- [ ] Add `overflow-x-auto scrollbar-none` to toolbar wrapper
- [ ] Add `shrink-0` to stats section in toolbar
- [ ] Hide legend on `< sm` breakpoint
- [ ] Run `pnpm type-check` and `pnpm lint`
- [ ] Visual test on mobile viewport (375px width)

## Success Criteria

- Graph page fills mobile viewport correctly (no address bar gap)
- Insight panel hidden by default on mobile, togglable via button
- Toolbar scrollable horizontally without layout break
- Zoom controls accessible on mobile
- No regressions on desktop layout

## Risk Assessment

- **Low risk:** CSS-only changes + one state variable
- **Tailwind `h-dvh`** requires Tailwind v3.4+ or v4 — project uses TailwindCSS v4, confirmed compatible
- **`scrollbar-none`** is a Tailwind plugin utility — verify it's available or use custom CSS `scrollbar-width: none`
