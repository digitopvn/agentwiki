---
title: "AI-Assisted Features"
description: "Multi-provider AI writing assistant with slash commands, selection toolbar, auto-summarize, and RAG suggestions"
status: in-progress
priority: P1
effort: 40h
issue: 23
branch: feat/ai-assisted-features
tags: [feature, frontend, backend, database, ai]
blockedBy: []
blocks: []
created: 2026-03-19
---

# AI-Assisted Features (#23)

## Overview

Full custom AI writing assistant for AgentWiki. 6 provider adapters (OpenAI, Anthropic, Gemini, OpenRouter, MiniMax, Alibaba), slash commands in BlockNote editor, selection toolbar for text transformation, tenant-level settings, auto-summarize upgrade, and RAG smart suggestions.

## Key Decisions

| Decision | Choice |
|----------|--------|
| Runtime | Cloudflare Workers (Paid plan, 30s CPU) |
| API Keys | Platform keys (admin per tenant, encrypted in D1) |
| Frontend | Full custom — no Vercel AI SDK, no @blocknote/xl-ai |
| Backend | Custom provider adapters (~60 LOC each) |
| Streaming | SSE via Workers ReadableStream |

## Cross-Plan Dependencies

None. Previous plans (initial platform, GitHub issues) are effectively complete.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Shared Types & Database Schema](./phase-01-shared-types-database.md) | Complete |
| 2 | [Provider Adapters](./phase-02-provider-adapters.md) | Complete |
| 3 | [AI API Routes & Service Layer](./phase-03-ai-api-routes-service.md) | Complete |
| 4 | [Editor AI Features](./phase-04-editor-ai-features.md) | Complete |
| 5 | [Settings & Usage Dashboard](./phase-05-settings-usage-dashboard.md) | Complete |
| 6 | [Auto-Summarize & RAG Suggestions](./phase-06-auto-summarize-rag.md) | Complete |

## Dependencies

- Phase 1 → unlocks Phase 2, 3
- Phase 2 → unlocks Phase 3
- Phase 3 → unlocks Phase 4, 5, 6
- Phase 4, 5 can run in parallel after Phase 3
- Phase 6 depends on Phase 3

## References

- Brainstorm report: `plans/reports/brainstorm-260319-2048-ai-assisted-features.md`
- Provider research: `plans/reports/researcher-260319-2047-ai-providers-sdk-comparison.md`
- ClaudeKit-Web reference: `D:/www/digitop/claudekit/claudekit-web/` (AI generation/transform endpoints, AISelectionToolbar)
