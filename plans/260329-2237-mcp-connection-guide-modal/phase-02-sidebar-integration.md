---
phase: 2
title: "Add MCP Icon + Wire Modal in Sidebar"
status: completed
priority: P2
---

# Phase 2: Add MCP Icon + Wire Modal in Sidebar

## Context
- Sidebar footer: `packages/web/src/components/layout/sidebar.tsx` lines 300-348
- Settings icon at line 322-331
- Existing modal pattern: `folderModalOpen` state + `CreateFolderModal` at bottom

## File to Modify
`packages/web/src/components/layout/sidebar.tsx`

## Changes

### 1. Add import
```typescript
import { Plug } from 'lucide-react'  // add to existing lucide import
import { McpGuideModal } from '../sidebar/mcp-guide-modal'
```

### 2. Add state
```typescript
const [mcpModalOpen, setMcpModalOpen] = useState(false)
```

### 3. Add Plug icon button
Insert between Settings button and the closing `</div>` of left icon group (after line ~331):

```tsx
<button
  onClick={() => setMcpModalOpen(true)}
  className={cn(
    'rounded-md p-2 md:p-1',
    isDark ? 'text-neutral-500 hover:bg-surface-3 hover:text-neutral-300 active:bg-surface-3'
          : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 active:bg-neutral-100',
  )}
  title="MCP Connection Guide"
>
  <Plug className="h-5 w-5 md:h-4 md:w-4" />
</button>
```

### 4. Add modal component
Insert next to `CreateFolderModal` at bottom of component:

```tsx
<McpGuideModal open={mcpModalOpen} onClose={() => setMcpModalOpen(false)} />
```

## Implementation Steps
1. Add `Plug` to lucide import line
2. Add `McpGuideModal` import
3. Add `mcpModalOpen` state
4. Insert Plug button after Settings button in footer
5. Add `<McpGuideModal>` at bottom
6. Verify build compiles

## Success Criteria
- [ ] Plug icon visible in sidebar footer next to Settings
- [ ] Click opens MCP guide modal
- [ ] Existing sidebar functionality unchanged
- [ ] Build passes with no errors
