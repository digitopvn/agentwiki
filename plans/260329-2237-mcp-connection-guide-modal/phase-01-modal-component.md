---
phase: 1
title: "Create MCP Guide Modal Component"
status: completed
priority: P2
---

# Phase 1: Create MCP Guide Modal Component

## Context
- Sidebar: `packages/web/src/components/layout/sidebar.tsx`
- Existing modal pattern: `packages/web/src/components/sidebar/create-folder-modal.tsx`
- MCP server: `packages/mcp/wrangler.toml` → `mcp.agentwiki.cc`
- Theme pattern: `isDark` prop, `cn()` utility, Tailwind classes

## Overview
Create self-contained modal component showing MCP connection configs for 3 tools.

## File to Create
`packages/web/src/components/sidebar/mcp-guide-modal.tsx`

## Requirements

### Props
```typescript
interface McpGuideModalProps {
  open: boolean
  onClose: () => void
}
```

### Structure
- Modal overlay with backdrop click to close
- Header: "Connect MCP Server" + close button
- 3 tabs: Claude Desktop | Claude Code | Cursor
- Each tab content:
  - Brief 3-step instruction
  - JSON config code block with syntax highlighting (pre/code)
  - Copy button (copies JSON to clipboard)
  - Link to "Create API Key" → `/settings?tab=api-keys`

### JSON Snippets

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "agentwiki": {
      "url": "https://mcp.agentwiki.cc/sse",
      "headers": {
        "Authorization": "Bearer <YOUR_API_KEY>"
      }
    }
  }
}
```

**Claude Code** (`.mcp.json` in project root):
```json
{
  "mcpServers": {
    "agentwiki": {
      "url": "https://mcp.agentwiki.cc/sse",
      "headers": {
        "Authorization": "Bearer <YOUR_API_KEY>"
      }
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "agentwiki": {
      "url": "https://mcp.agentwiki.cc/sse",
      "headers": {
        "Authorization": "Bearer <YOUR_API_KEY>"
      }
    }
  }
}
```

### Styling
- Follow existing dark/light theme pattern with `useAppStore().theme`
- Use `cn()` from `../../lib/utils`
- Lucide icons: `X` for close, `Copy`/`Check` for copy button, `ExternalLink` for API key link
- Tab active state: `bg-brand-600 text-white`
- Code block: monospace font, `bg-surface-2` dark / `bg-neutral-100` light
- Responsive: full-width on mobile, max-w-lg on desktop

### Copy Button Behavior
- Click → copy JSON to clipboard via `navigator.clipboard.writeText()`
- Show checkmark icon for 2s, then revert to copy icon
- Use `useState` for copy feedback state

## Implementation Steps
1. Create file with imports (React, lucide icons, cn, useAppStore)
2. Define tab data array with id, label, steps[], jsonSnippet
3. Build modal with overlay + centered card
4. Implement tab switching with useState
5. Render active tab content with code block + copy button
6. Add "Create API Key" link using `useNavigate`

## Success Criteria
- [ ] Modal renders with 3 tabs
- [ ] Each tab shows correct JSON snippet
- [ ] Copy button copies to clipboard and shows feedback
- [ ] Dark/light theme works
- [ ] Close on backdrop click and X button
- [ ] Mobile responsive
