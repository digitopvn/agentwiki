---
title: "MCP Connection Guide Modal"
description: "Add MCP icon to sidebar footer, click opens modal with connection configs for Claude Desktop, Claude Code, Cursor"
status: completed
priority: P2
branch: claude/feat-mcp-connection-guide-modal
blockedBy: []
blocks: []
---

# MCP Connection Guide Modal

## Overview
Add a `Plug` icon next to Settings in sidebar footer. Clicking opens a modal with tabbed guide showing JSON config snippets for connecting MCP server to Claude Desktop, Claude Code, and Cursor.

## Phases

| # | Phase | Status | Files |
|---|-------|--------|-------|
| 1 | Create MCP guide modal component | completed | `packages/web/src/components/sidebar/mcp-guide-modal.tsx` |
| 2 | Add icon + wire modal in sidebar | completed | `packages/web/src/components/layout/sidebar.tsx` |

## Context
- Brainstorm: `plans/reports/brainstorm-260329-2237-mcp-connection-guide-modal.md`
- MCP Server URL: `https://mcp.agentwiki.cc/sse`
- MCP Server package: `packages/mcp/`
- Sidebar: `packages/web/src/components/layout/sidebar.tsx`

## Cook Command
```
/ck:cook --auto plans/260329-2237-mcp-connection-guide-modal/plan.md
```
