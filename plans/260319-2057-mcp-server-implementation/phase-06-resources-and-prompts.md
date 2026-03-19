---
phase: 6
title: Resources + Prompts
priority: medium
status: completed
effort: small
blockedBy: [phase-02, phase-03]
---

# Phase 6: Resources + Prompts

## Overview

Implement 6 MCP resources (read-only browseable data) and 4 MCP prompts (reusable message templates). Resources let AI tools browse AgentWiki's knowledge base. Prompts provide optimized workflows.

## MCP Resources (6)

### Files to create
- `packages/mcp/src/resources/wiki-resources.ts`

### Resource List

| URI | Name | MIME | Handler |
|-----|------|------|---------|
| `agentwiki://documents` | All Documents | `application/json` | `listDocuments(env, tenantId, {limit:100,offset:0})` |
| `agentwiki://documents/{id}` | Document Content | `text/markdown` | `getDocument(env, tenantId, id)` → return `.content` |
| `agentwiki://documents/{id}/meta` | Document Metadata | `application/json` | `getDocument()` → return metadata (tags, dates, author) |
| `agentwiki://folders` | Folder Tree | `application/json` | `getFolderTree(env, tenantId)` |
| `agentwiki://tags` | All Tags | `application/json` | Tag list with counts |
| `agentwiki://graph` | Knowledge Graph | `application/json` | Graph nodes + edges |

### Dynamic URI Templates

`agentwiki://documents/{id}` and `agentwiki://documents/{id}/meta` use URI templates with `listHandler` returning all document IDs + titles for auto-completion:

```typescript
server.registerResource({
  uriTemplate: "agentwiki://documents/{id}",
  name: "Document Content",
  mimeType: "text/markdown",
  listHandler: async () => {
    const { data } = await listDocuments(env, auth.tenantId, { limit: 100, offset: 0 });
    return data.map(d => ({ uri: `agentwiki://documents/${d.id}`, name: d.title }));
  },
  handler: async (uri, { id }) => {
    const doc = await getDocument(env, auth.tenantId, id);
    return { text: doc?.content ?? "Document not found" };
  },
});
```

## MCP Prompts (4)

### Files to create
- `packages/mcp/src/prompts/wiki-prompts.ts`

### Prompt List

| Name | Description | Arguments |
|------|-------------|-----------|
| `search_and_summarize` | Search knowledge base and summarize findings | `{ query: string, maxResults?: number }` |
| `create_from_template` | Create document from category template | `{ category: string, title: string }` |
| `explore_connections` | Explore document connections via knowledge graph | `{ documentId: string, depth?: number }` |
| `review_document` | Review document for quality and completeness | `{ documentId: string }` |

### Prompt Example

```typescript
server.registerPrompt({
  name: "search_and_summarize",
  description: "Search the AgentWiki knowledge base and summarize key findings",
  arguments: [
    { name: "query", description: "What to search for", required: true },
    { name: "maxResults", description: "Max results to consider (default 5)", required: false },
  ],
  handler: async (args) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Search the AgentWiki knowledge base for "${args.query}" using the search tool. Analyze the top ${args.maxResults ?? 5} results and provide a concise summary of the key findings, citing specific documents by title.`
      }
    }]
  }),
});
```

## Todo List

- [ ] Create `packages/mcp/src/resources/wiki-resources.ts` (6 resources)
- [ ] Implement static resources (documents list, folders, tags, graph)
- [ ] Implement dynamic URI templates (document by ID, document metadata)
- [ ] Add listHandler for auto-completion
- [ ] Create `packages/mcp/src/prompts/wiki-prompts.ts` (4 prompts)
- [ ] Register all resources + prompts in `server.ts`

## Success Criteria

- Resources browseable via MCP client
- Document content returned as markdown
- URI template auto-completion works (lists doc IDs + titles)
- All 4 prompts available and generate correct messages
- Resources respect tenant isolation (only show user's docs)

## Next Steps

→ Phase 7: Testing + Deploy
