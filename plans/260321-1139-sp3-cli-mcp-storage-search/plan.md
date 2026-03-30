---
title: "SP3: CLI/MCP Storage Search"
description: "Extend search API with source param to search uploaded file content, add CLI --source flag and MCP storage_search tool"
status: in_progress
priority: P2
effort: 12h
branch: feat/storage-search
tags: [storage, search, cli, mcp, vectorize, api]
created: 2026-03-21
issue: https://github.com/digitopvn/agentwiki/issues/22
brainstorm: plans/reports/brainstorm-260321-1139-storage-cloudflare-r2.md
blockedBy: [260321-1139-sp1-text-extraction-pipeline]
blocks: []
relatedPlans: [260319-1428-enhanced-search-system]
---

# SP3: CLI/MCP Storage Search

Extend search to include uploaded file content. Add `source` parameter to API, CLI `--source` flag, and MCP `storage_search` tool.

## Current State

- Search API: GET /api/search?q=...&type=hybrid (documents only)
- CLI: `agentwiki doc search <query>` (documents only)
- MCP: `search` tool with query/type/limit/category params
- No way to search within uploaded file content

## Architecture

```
GET /api/search?q=query&source=all|docs|storage
                    ↓
SearchService.searchDocuments()
  ├─ source=docs (default): existing flow
  ├─ source=storage: search file_extractions only
  └─ source=all: search both, RRF merge
                    ↓
Keyword: LIKE query on file_extractions.extracted_text
Semantic: Vectorize query with source_type=upload filter
                    ↓
RRF fusion → combined results
```

## Phases

| # | Phase | Effort | Status | File |
|---|-------|--------|--------|------|
| 1 | API Search Extension | 6h | Completed | [phase-01](./phase-01-api-search-extension.md) |
| 2 | CLI + MCP Integration | 6h | Completed | [phase-02](./phase-02-cli-mcp-integration.md) |

## Key Dependencies

- SP1 completed: file_extractions table populated, Vectorize indexed
- Enhanced Search System plan (260319-1428): may need coordination on search service changes
- Existing search infrastructure: trigram, semantic, RRF fusion

## Related Plan: Enhanced Search System

The enhanced-search plan (260319-1428) modifies the same search service. Coordination needed:
- SP3 adds `source` param to searchDocuments()
- Enhanced-search adds trigram fuzzy, faceted filtering
- Both can coexist — `source` is an orthogonal filter dimension

## Success Criteria

- `GET /api/search?q=test&source=storage` returns file extraction matches
- `GET /api/search?q=test&source=all` merges doc + storage results
- CLI: `agentwiki search "report" --source storage` works
- MCP: `search` tool accepts source param
- Upload list shows extraction_status in CLI/MCP
