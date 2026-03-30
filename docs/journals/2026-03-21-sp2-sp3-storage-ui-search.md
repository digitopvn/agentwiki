# Storage UI/UX and CLI/MCP Search Integration Complete

**Date**: 2026-03-21 14:48
**Severity**: Medium
**Component**: Frontend Storage Drawer, Search Pipeline, CLI/MCP
**Status**: Resolved

## What Happened

Completed SP2 (Storage UI/UX drawer interface) and SP3 (CLI/MCP storage search) for Issue #22. Two parallel tracks merged cleanly into the extraction pipeline: users can now upload files through the web UI with real-time progress tracking, and search queries can source from both docs and uploaded storage seamlessly.

## Technical Achievements

**SP2 – Storage Drawer Implementation**
- Zustand store manages `storageDrawerOpen` state and `uploadQueue` with `UploadQueueItem` progress tracking
- 400px right-side drawer with file grid, extraction status badges, search filter
- HardDrive icon in sidebar toggles drawer; global drag zone distinguishes external file drops from internal folder-tree DnD via `dataTransfer.types` inspection
- XHR progress events drive upload bar (fetch API lacks native upload progress)
- Auto-removes completed uploads after 3s; extraction status polls every 5s while processing
- 100MB per-file validation enforced client-side

**SP3 – Storage Search Pipeline**
- `SearchSource` type added: 'docs' | 'storage' | 'all' (backward-compatible default: 'docs')
- New `storage-search-service.ts` handles: keyword search via LIKE on `file_extractions`, semantic search via Vectorize with `source_type=upload` filter
- RRF fusion merges doc + storage results seamlessly; single unified result set returned
- CLI: `--source` flag on search command; new `upload list` command for visibility
- MCP: `source` parameter on search tool

## Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| XHR over fetch | Fetch lacks upload progress event support; XHR provides progress callback |
| dragCounter pattern | Reliable tracking across nested drag events; prevents false dragleave triggers |
| Separate storage-search-service | Keeps search-service.ts focused; storage-specific logic isolated |
| RRF fusion | Combines keyword + semantic without duplication; preserves doc-centric defaults |

## Integration Points

- Extraction pipeline feeds results into Vectorize for semantic indexing
- Upload progress triggers extraction polling via API
- Search results route to either docs or storage handler based on `source_type`
- CLI/MCP surfaces new source parameter without breaking existing queries

## Lessons Learned

Splitting UI + search logic into separate PRs paid off—SP2 focused on user interaction, SP3 focused on backend query logic. Minimal merge conflicts, clear responsibility boundaries. XHR choice felt outdated initially but proved necessary; fetch roadmap improvements won't help us retroactively.

## Next Steps

- Monitor extraction latency at scale (batch processing timing)
- Test RRF ranking quality with mixed doc+storage queries
- Performance benchmark: 10K+ files in storage drawer (pagination may be needed)
