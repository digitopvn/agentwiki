# Phase 2: CLI + MCP Integration

## Context
- [SP3 Plan](./plan.md)
- [Phase 1](./phase-01-api-search-extension.md) — API search with source param
- CLI: `packages/cli/src/index.ts`
- MCP search tools: `packages/mcp/src/tools/search-and-graph-tools.ts`
- MCP upload tools: `packages/mcp/src/tools/upload-tools.ts`

## Overview
- **Priority:** P2
- **Status:** Completed
- **Description:** Add --source flag to CLI search, add source param to MCP search tool, update upload_list to show extraction_status.

## Requirements

### Functional
- CLI: `agentwiki doc search "query" --source storage|docs|all`
- CLI: `agentwiki upload list [--status pending|completed|failed]`
- MCP search tool: add `source` input param
- MCP upload_list: return extraction_status + summary in results

### Non-functional
- CLI default source=docs (backward compatible)
- MCP default source=docs (backward compatible)

## Related Code Files

### Modify
- `packages/cli/src/index.ts` — add --source to search, add upload commands
- `packages/mcp/src/tools/search-and-graph-tools.ts` — add source param to search tool
- `packages/mcp/src/tools/upload-tools.ts` — update upload_list response

## Implementation Steps

1. **CLI: Add --source to search**
   ```typescript
   doc.command('search <query>')
     .option('--source <source>', 'Search source: docs|storage|all', 'docs')
     // Existing options...
     .action(async (query, opts) => {
       const params = new URLSearchParams({
         q: query, type: opts.type, limit: opts.limit, source: opts.source,
       })
       // Existing fetch + display logic
       // Add resultType indicator in output
     })
   ```

2. **CLI: Add upload list command**
   ```typescript
   const upload = program.command('upload').description('Manage uploads')

   upload.command('list')
     .option('--status <status>', 'Filter by extraction status')
     .option('--json', 'Output as JSON')
     .action(async (opts) => {
       const params = new URLSearchParams()
       if (opts.status) params.set('status', opts.status)
       const result = await apiFetch(`/uploads?${params}`)
       // Display with extraction_status column
     })
   ```

3. **MCP: Add source param to search tool**
   ```typescript
   server.registerTool('search', {
     inputSchema: {
       // ... existing params ...
       source: z.enum(['docs', 'storage', 'all']).default('docs')
         .describe('Search source: docs (wiki documents), storage (uploaded files), all (both)'),
     },
   }, async (args) => {
     return safeToolCall(() =>
       searchDocuments(env, {
         tenantId: auth.tenantId,
         query: args.query,
         type: args.type,
         limit: args.limit,
         source: args.source,
       }),
     )
   })
   ```

4. **MCP: Update upload_list response**
   - Modify listUploads call to include extraction_status and summary
   - Already handled in SP1 Phase 1 (listUploads returns new fields)

5. **API: Add status filter to uploads list endpoint**
   - `GET /api/uploads?status=completed` — filter by extraction_status
   - Modify uploads route to parse status param
   - Modify listUploads service to accept status filter

6. **Run type-check + build for all packages**
   ```bash
   pnpm type-check && pnpm build
   ```

## Todo List

- [x] CLI: add --source to search command
- [x] CLI: add upload list command with --status filter
- [x] CLI: display resultType in search output
- [x] MCP: add source param to search tool
- [x] MCP: verify upload_list returns extraction_status
- [x] API: add status filter to uploads list endpoint
- [x] Run type-check + build (api, cli, mcp)
- [x] Test CLI search with --source storage
- [x] Test MCP search with source=storage

## Success Criteria

- `agentwiki doc search "test" --source storage` returns file extraction matches
- `agentwiki upload list --status completed` shows indexed files
- MCP search tool accepts source param
- Backward compatible: existing searches unchanged
- All packages type-check and build
