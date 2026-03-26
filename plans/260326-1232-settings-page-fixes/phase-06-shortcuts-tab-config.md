---
phase: 6
title: Shortcuts Tab — Fix + Make Configurable
priority: medium
status: completed
effort: M
---

# Phase 6: Shortcuts Tab — Fix & Configurable

## Context Links
- [plan.md](./plan.md)
- [Issue #57](https://github.com/digitopvn/agentwiki/issues/57)
- Frontend: `packages/web/src/routes/settings.tsx` (ShortcutsTab, lines 222-257)
- Hook: `packages/web/src/hooks/use-keyboard-shortcuts.ts`
- Layout: `packages/web/src/components/layout/layout.tsx` (where shortcuts are wired)
- Command palette: `packages/web/src/components/command-palette/command-palette.tsx`

## Overview

Shortcuts tab shows a hardcoded read-only list. Issue says: "a lot of shortcuts are not working right now, these shortcuts must be configurable." Two sub-tasks:
1. **Fix**: Audit all listed shortcuts, ensure they work
2. **Configurable**: Let users rebind keys via the Settings UI

## Key Insights

- `useKeyboardShortcuts` hook already exists with `ShortcutDefinition[]` interface — well-designed
- Hook is used in `layout.tsx` — shortcuts defined there
- `layout.tsx` uses useMemo for shortcut definitions — these reference store actions
- ShortcutsTab displays hardcoded array — NOT derived from actual shortcuts
- **Discrepancy risk**: displayed shortcuts may not match wired shortcuts

### Current Wired Shortcuts (from layout.tsx)

Need to audit — the hook is called with an array built in layout.tsx. The displayed list in settings may differ from what's actually wired.

### Design Decision: localStorage vs DB

- Shortcuts are per-user, per-device (different keyboard layouts)
- localStorage is sufficient — no need for server persistence
- Default shortcuts as constants, user overrides in localStorage
- `useKeyboardShortcuts` hook already takes dynamic definitions — just feed it merged config

## Requirements

**Functional:**
- All displayed shortcuts actually work
- Display shows real shortcut definitions (derived from same source)
- Each shortcut row has "Edit" button to rebind
- Rebinding: capture next key combo, validate (no conflicts), save
- "Reset to defaults" button per shortcut and global
- Custom bindings persist in localStorage

**Non-functional:**
- Detect OS (Mac vs Windows) and show correct modifier key (Cmd vs Ctrl)
- Prevent binding reserved browser shortcuts (Ctrl+T, Ctrl+W, etc.)
- Visual feedback during key capture (listening state)

## Architecture

```
[Default Shortcuts]  ←merge→  [localStorage overrides]  →  [Merged Config]
                                                              ↓
                                                    useKeyboardShortcuts(merged)
                                                              ↓
                                                    ShortcutsTab (display + edit)
```

### Data Model

```ts
interface ShortcutConfig {
  id: string              // e.g., 'command-palette', 'new-document'
  label: string           // Human-readable action name
  defaultKeys: string     // Default key combo: 'ctrl+k'
  customKeys?: string     // User override (stored in localStorage)
}

const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  { id: 'command-palette', label: 'Open command palette', defaultKeys: 'ctrl+k' },
  { id: 'new-document', label: 'New document', defaultKeys: 'ctrl+n' },
  // ...
]
```

localStorage key: `agentwiki:shortcuts` → `Record<string, string>` (id → customKeys)

## Related Code Files

**Modify:**
- `packages/web/src/routes/settings.tsx` — extract ShortcutsTab
- `packages/web/src/hooks/use-keyboard-shortcuts.ts` — add config merging
- `packages/web/src/components/layout/layout.tsx` — use centralized shortcut config

**Create:**
- `packages/web/src/components/settings/shortcuts-tab.tsx` — extracted + editable
- `packages/web/src/lib/shortcut-defaults.ts` — centralized default definitions

## Implementation Steps

### Step 1: Centralize Shortcut Definitions

1. Create `packages/web/src/lib/shortcut-defaults.ts`
2. Define `DEFAULT_SHORTCUTS: ShortcutConfig[]` with all shortcuts
3. Include: id, label, defaultKeys, description
4. Export helper: `getActiveShortcuts()` — merges defaults with localStorage overrides

### Step 2: Audit & Fix Wired Shortcuts

1. Read `layout.tsx` to find all actually-wired shortcuts
2. Compare with displayed list in ShortcutsTab
3. Ensure each shortcut's action handler works:
   - Command palette open
   - New document create
   - Save version checkpoint
   - Toggle sidebar
   - Toggle metadata panel
   - Tab navigation (prev/next)
   - Close modals (escape)
4. Add any missing shortcut wiring
5. Update `layout.tsx` to use centralized `getActiveShortcuts()`

### Step 3: Extract ShortcutsTab Component

1. Create `packages/web/src/components/settings/shortcuts-tab.tsx`
2. Derive shortcut display from `DEFAULT_SHORTCUTS` + localStorage
3. Show each shortcut: action label + current key binding + edit button + reset button

### Step 4: Key Capture UI

1. When "Edit" clicked: row enters capture mode
2. Show "Press new key combination..." prompt
3. Listen for next keydown event
4. Display captured combo
5. Validate:
   - No conflict with other shortcuts
   - Not a reserved browser shortcut
6. Save to localStorage on confirm
7. Cancel on Escape

### Step 5: Persistence

1. On save: write to `localStorage` key `agentwiki:shortcuts`
2. On load: merge localStorage with defaults
3. "Reset" per shortcut: remove from localStorage
4. "Reset All": clear localStorage key entirely

### Step 6: Update Layout Integration

1. `layout.tsx`: replace inline shortcut definitions with `getActiveShortcuts()`
2. Map `ShortcutConfig[]` → `ShortcutDefinition[]` with action callbacks
3. Shortcuts auto-update when localStorage changes (via storage event or state)

## Todo

- [x] Create shortcut-defaults.ts with centralized definitions
- [x] Audit all shortcuts in layout.tsx — fix broken ones
- [x] Extract ShortcutsTab to own component
- [x] Implement key capture/rebinding UI
- [x] Add localStorage persistence
- [x] Update layout.tsx to use centralized config
- [x] Add OS detection for Cmd vs Ctrl display
- [x] Add "Reset to defaults" functionality

## Success Criteria

- All listed shortcuts actually work
- Each shortcut editable via key capture
- Custom bindings persist across sessions (localStorage)
- No conflicts between shortcuts
- "Reset to defaults" works per-shortcut and globally
- `pnpm type-check` passes

## Risk Assessment

- **Medium**: Touches layout.tsx (core component) + hook + new component
- Key capture can conflict with browser shortcuts — need blocklist
- localStorage approach means different devices have different bindings (acceptable)
- Some shortcuts may be impossible to rebind (e.g., Escape for close modals is standard)
- Testing: manual testing required for keyboard events
