# Code Review: Mobile UX Support (`improve-mobile-ux-Bg9nT`)

**Reviewer:** code-reviewer | **Date:** 2026-03-19
**Branch:** `improve-mobile-ux-Bg9nT` (3 commits, 20 files, +407/-126)
**Build:** Passes (tsc + vite)

---

## Overall Assessment

Solid mobile adaptation with good architectural decisions: reactive hook via `useSyncExternalStore`, zustand state with mutual exclusion, overlay drawers, iOS zoom prevention, and responsive touch targets. The implementation is clean, consistent, and covers the main mobile pain points. A few issues need attention before merge.

---

## Critical Issues

### C1. `user-scalable=no` blocks pinch-to-zoom (WCAG 1.4.4 violation)
**File:** `packages/web/index.html:6`
**Severity:** Critical (Accessibility)

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
```

This violates WCAG 2.1 SC 1.4.4 (Resize Text) and SC 1.4.10 (Reflow). Users with low vision rely on pinch-to-zoom. Some app stores reject apps with this setting. The iOS auto-zoom problem is already solved by the `text-base` (16px) input sizing in commit `45d3c9e`.

**Fix:** Remove `maximum-scale=1.0, user-scalable=no`:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

---

## Important Issues

### I1. `useIsMobile` subscribe creates new MediaQueryList per call
**File:** `packages/web/src/hooks/use-is-mobile.ts:7-10`
**Severity:** Important (Performance)

`subscribe` creates a new `window.matchMedia(MOBILE_QUERY)` object each invocation. While browsers typically return the same underlying MQL, this is not guaranteed and creates unnecessary GC pressure. The `getSnapshot` also calls `matchMedia` each time.

**Fix:** Hoist the MQL instance:
```ts
const mql = typeof window !== 'undefined'
  ? window.matchMedia(MOBILE_QUERY)
  : null

function subscribe(callback: () => void) {
  mql?.addEventListener('change', callback)
  return () => mql?.removeEventListener('change', callback)
}

function getSnapshot() {
  return mql?.matches ?? false
}
```

### I2. No exit animations on drawers
**File:** `packages/web/src/components/layout/layout.tsx:103-126`
**Severity:** Important (UX)

Drawers slide in with `animate-slide-in-left/right` but disappear instantly on close (conditional render removes DOM). This creates a jarring user experience on mobile.

**Options:**
- Use CSS `animationend` event with a closing state to delay unmount
- Use `framer-motion`'s `AnimatePresence` (already common in React mobile patterns)
- Use a `data-closing` attribute + reverse animation + `onAnimationEnd` to unmount

### I3. Backdrop overlay has no scroll lock
**File:** `packages/web/src/components/layout/layout.tsx:103-126`
**Severity:** Important (UX)

When a drawer is open, background content can still scroll on iOS (body scroll bleeds through the overlay). Need `overflow: hidden` on `<body>` while a drawer is open.

**Fix:** Add effect in layout:
```ts
useEffect(() => {
  if (mobileSidebarOpen || mobileMetadataOpen) {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }
}, [mobileSidebarOpen, mobileMetadataOpen])
```

### I4. Context menu bottom sheet outside sidebar z-index layer
**File:** `packages/web/src/components/sidebar/document-context-menu.tsx:87`
**Severity:** Important (UI)

Bottom sheet uses `z-[60]` and sidebar overlay uses `z-50`. If the bottom sheet is opened from within the sidebar drawer, the bottom sheet renders on top correctly -- but if sidebar closes while bottom sheet is visible (e.g. user taps overlay edge), the bottom sheet orphans itself on screen with no way to dismiss except clicking backdrop. The `mousedown` listener on line 33 only fires for `mousedown`, not `touchstart`.

**Fix:** Add `touchstart` listener alongside `mousedown`, or use `pointerdown` instead:
```ts
document.addEventListener('pointerdown', handleClick)
return () => document.removeEventListener('pointerdown', handleClick)
```

### I5. Search button dispatches synthetic KeyboardEvent
**File:** `packages/web/src/components/layout/main-panel.tsx:51`
**Severity:** Important (Fragility)

```ts
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
```

This is fragile: if the command palette shortcut key changes, this breaks silently. Also, synthetic `KeyboardEvent` may not set `isTrusted` correctly, potentially failing event handler checks.

**Fix:** Expose a `toggleCommandPalette()` method from the command palette (via store or context) and call it directly.

---

## Minor Issues

### M1. Sidebar file exceeds 300 lines
**File:** `packages/web/src/components/layout/sidebar.tsx` (301 lines)
**Severity:** Minor (Maintainability)

Per project rules (200-line limit), consider extracting the sidebar header, search bar, and footer into sub-components.

### M2. `setActiveTab` name collision across contexts
**File:** `packages/web/src/routes/settings.tsx:23`
**Severity:** Minor (Readability)

Settings page has `const [activeTab, setActiveTab] = useState<TabId>('members')` while the app store also exports `setActiveTab`. No actual bug (different scopes, store version not imported here), but could confuse readers. Consider renaming to `activeSettingsTab` / `setActiveSettingsTab`.

### M3. No landscape/tablet breakpoint consideration
**Severity:** Minor (UX)

The `767px` breakpoint is binary: mobile vs desktop. Tablets in portrait (768-1024px) get the full desktop layout with cramped sidebar + metadata. Landscape phones (667px wide) get mobile layout but have plenty of horizontal space.

Not blocking, but consider a tablet breakpoint (`md:` to `lg:`) in a follow-up.

### M4. Drag-and-drop on mobile may conflict with scroll
**File:** `packages/web/src/components/sidebar/folder-tree.tsx:34`
**Severity:** Minor (UX)

`PointerSensor` with `distance: 8` activates drag after 8px of movement. On mobile, this can accidentally trigger when the user tries to scroll the folder tree. Consider using `TouchSensor` with `delay` constraint for touch devices:
```ts
const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
```

---

## Nits

### N1. `touch-action: manipulation` on `html` is redundant
**File:** `packages/web/src/index.css:79`

Modern browsers (Chrome 32+, Safari 9.3+) no longer have 300ms tap delay when `<meta viewport>` is present. The rule is harmless but unnecessary.

### N2. Settings tab labels hidden on small mobile
**File:** `packages/web/src/routes/settings.tsx` -- `<span className="hidden sm:inline">{label}</span>`

Tab labels disappear below `640px`, leaving icon-only tabs with no tooltip or `aria-label`. Add `aria-label={label}` to the button.

### N3. Mobile header branding could be a link
**File:** `packages/web/src/components/layout/main-panel.tsx:39-46`

The centered "AgentWiki" branding is static. Making it a `<Link to="/">` would be a standard mobile pattern for navigation home.

---

## Positive Observations

1. **`useSyncExternalStore` choice** -- correct API for external subscription (matchMedia), handles SSR with `getServerSnapshot`
2. **Mutual exclusion** in store (`setMobileSidebarOpen` closes metadata and vice versa) -- prevents impossible double-drawer state
3. **iOS zoom prevention** via 16px input font is the right approach (commit 3)
4. **`prefers-reduced-motion`** respected with animation-duration override
5. **partialize excludes mobile state** from persistence -- correct; drawer state should not survive refresh
6. **Consistent touch target sizing** -- buttons use `p-2` (40px), close to 44px minimum
7. **Welcome screen responsive** -- `flex-col gap-3 sm:flex-row` button stack and hidden keyboard shortcuts tip on mobile

---

## Recommended Actions (Priority Order)

1. **[Critical]** Remove `user-scalable=no` and `maximum-scale=1.0` from viewport meta
2. **[Important]** Add body scroll lock when drawers are open
3. **[Important]** Hoist MediaQueryList instance in `use-is-mobile.ts`
4. **[Important]** Replace `mousedown` with `pointerdown` in context menu outside-click handler
5. **[Important]** Replace synthetic KeyboardEvent with direct store/context method for command palette
6. **[Nice-to-have]** Add exit animations for drawers
7. **[Nice-to-have]** Add `TouchSensor` for drag-and-drop on mobile

---

## Metrics

| Metric | Value |
|--------|-------|
| Files changed | 20 |
| Lines added/removed | +407 / -126 |
| New hooks | 1 (`useIsMobile`) |
| Store additions | 4 (2 state + 2 setters) |
| Accessibility issues | 1 critical (viewport), 1 nit (aria-label) |
| Security issues | 0 |
| Performance issues | 1 (MQL allocation) |

---

**Status:** DONE
**Summary:** Branch is well-implemented with consistent patterns. One critical accessibility fix (viewport meta) required before merge. Four important issues recommended. No security concerns.
