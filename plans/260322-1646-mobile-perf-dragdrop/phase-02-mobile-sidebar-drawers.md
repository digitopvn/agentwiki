---
phase: 02
title: "Mobile UI/UX — Fixed Position Sidebar Drawers"
issue: 37
status: completed
priority: P1
effort: 4h
---

# Phase 02: Mobile Sidebar Drawers with Fixed Position

**Issue:** [#37](https://github.com/digitopvn/agentwiki/issues/37) — "enhance: Mobile UI/UX - Sidebars should use fixed position"
**Request:** Both sidebars should be drawers (collapsed by default), leave the main layout for the editor.

## Context Links
- Layout: `packages/web/src/components/layout/layout.tsx`
- Sidebar: `packages/web/src/components/layout/sidebar.tsx`
- MetadataPanel: `packages/web/src/components/layout/metadata-panel.tsx`
- MainPanel: `packages/web/src/components/layout/main-panel.tsx`
- CSS: `packages/web/src/index.css`
- App store: `packages/web/src/stores/app-store.ts`

## Key Insights

1. Current mobile implementation already uses overlay drawers, but they use `absolute` within a `fixed` container. Better to use `position: fixed` directly on the drawer panel for smoother animations.
2. Slide animations use CSS keyframes (`slide-in-left/right`). GPU-accelerated `transform: translateX()` with `will-change: transform` is smoother.
3. No touch gesture support (swipe to open/close) — common UX expectation on mobile.
4. Backdrop click dismisses, but edge-swipe to reveal is missing.

## Architecture

```
Mobile layout (improved):
┌──────────────────────────────┐
│        MainPanel (100vw)     │  ← Always visible
│   ┌──────────┐               │
│   │  Mobile  │               │
│   │  Header  │               │
│   ├──────────┤               │
│   │  TabBar  │               │
│   ├──────────┤               │
│   │  Editor  │               │
│   └──────────┘               │
└──────────────────────────────┘

Drawer overlay (on toggle):
┌─────────┬────────────────────┐
│ Sidebar │   Backdrop (dim)   │  ← fixed, z-50, translateX animation
│  280px  │                    │
│ (fixed) │                    │
└─────────┴────────────────────┘
```

## Related Code Files

**Modify:**
- `packages/web/src/components/layout/layout.tsx` — Refactor mobile drawer rendering
- `packages/web/src/index.css` — Replace keyframe animations with transform-based transitions
- `packages/web/src/hooks/use-swipe-gesture.ts` — **NEW**: Touch swipe gesture hook

## Implementation Steps

1. **Refactor mobile drawer in `layout.tsx`:**
   - Replace conditional rendering (`{mobileSidebarOpen && ...}`) with always-rendered drawers using CSS `transform: translateX(-100%)`/`translateX(100%)` + transition
   - Use `position: fixed` directly on drawer panels
   - Toggle by adding/removing `translate-x-0` class
   - Add `will-change: transform` for GPU acceleration
   - Keep backdrop with opacity transition (0 → 0.6)

2. **Update CSS animations in `index.css`:**
   - Remove `@keyframes slide-in-left` and `@keyframes slide-in-right`
   - Add utility classes for drawer transitions:
     ```css
     .drawer-left { transform: translateX(-100%); transition: transform 200ms ease-out; }
     .drawer-left.open { transform: translateX(0); }
     .drawer-right { transform: translateX(100%); transition: transform 200ms ease-out; }
     .drawer-right.open { transform: translateX(0); }
     ```

3. **Create swipe gesture hook** (`use-swipe-gesture.ts`):
   - Listen for `touchstart`, `touchmove`, `touchend` on window
   - Detect edge swipes (within 20px of screen edge)
   - Left edge swipe → open sidebar; Right edge swipe → open metadata
   - Swipe in opposite direction while open → close
   - Threshold: 50px horizontal movement, <30deg angle

4. **Integrate swipe gestures in Layout:**
   - Call `useSwipeGesture` with callbacks for open/close
   - Respect `prefers-reduced-motion` media query

## Todo List

- [x] Always-render drawers with CSS transform (not conditional mount)
- [x] Replace keyframe animations with transform transitions
- [x] Add `will-change: transform` for GPU acceleration
- [x] Create `use-swipe-gesture.ts` hook
- [x] Integrate swipe gestures in Layout
- [x] Add `pointer-events-none` on hidden drawers to prevent interaction
- [x] Test on mobile viewport (Chrome DevTools device emulation)
- [x] Verify `prefers-reduced-motion` support
- [x] Verify body scroll lock still works

## Success Criteria

- Sidebars slide in/out smoothly (60fps) on mobile devices
- Edge swipe (left/right) opens corresponding sidebar
- Backdrop appears with smooth opacity transition
- No layout shift when drawers open/close
- Body scroll locked when drawer open
- Works correctly in both dark and light themes

## Risk Assessment

- **Touch gesture conflicts**: Edge swipe zone (20px) is narrow enough to not conflict with horizontal scroll or swipe-back browser navigation
- **Reduced motion**: Fall back to instant show/hide without transition
- **Performance**: CSS-only transforms = no JS layout thrashing

## Security Considerations
- No security impact — purely UI/UX enhancement
