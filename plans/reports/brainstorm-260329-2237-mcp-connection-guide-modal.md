# Brainstorm: MCP Connection Guide Modal

**Date:** 2026-03-29
**Status:** Approved

## Problem
Users need quick access to MCP server connection configs from sidebar without leaving current page or reading external docs.

## Chosen Approach: Icon + Standalone Modal

Icon `Plug` in sidebar footer (next to Settings) → click opens modal with tabbed guide for 3 tools.

### Modal Structure
- **Tabs**: Claude Desktop | Claude Code | Cursor
- Each tab: JSON config snippet + copy button + brief step-by-step
- MCP URL: `https://mcp.agentwiki.cc/sse`
- API key: placeholder `<YOUR_API_KEY>` with link to Settings > API Keys

### Files
| Action | File |
|--------|------|
| Create | `packages/web/src/components/sidebar/mcp-guide-modal.tsx` |
| Modify | `packages/web/src/components/layout/sidebar.tsx` |

### Risks
- Low. Pure frontend, no backend changes.

### Success Criteria
- Icon visible in sidebar footer next to Settings
- Modal opens with 3 tabs, each showing correct JSON snippet
- Copy button works
- Dark/light theme support
- Mobile responsive
