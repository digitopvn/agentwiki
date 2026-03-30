---
phase: 1
title: "Schema + Edge Types + Wikilink Enhancement"
status: completed
priority: P0
effort: 12h
---

# Phase 1: Schema + Edge Types + Wikilink Enhancement

Foundation phase — all subsequent phases depend on this.

## Context Links
- [Brainstorm Report](../reports/brainstorm-260322-1647-knowledge-graph-dual-layer.md)
- [plan.md](plan.md)
- Schema: `packages/api/src/db/schema.ts`
- Wikilink extractor: `packages/api/src/utils/wikilink-extractor.ts`
- Document service: `packages/api/src/services/document-service.ts`
- Shared types: `packages/shared/src/types/`

## Overview

Add typed edges to `document_links`, create `document_similarities` table, enhance wikilink syntax to support optional type annotations, and update `syncWikilinks()`.

## Key Insights
- Current `document_links` has: id, sourceDocId, targetDocId, context, createdAt
- Wikilink regex: `/\[\[([^\]]+)\]\]/g` — parses `[[target]]` and `[[display|target]]`
- `syncWikilinks()` deletes all outbound links then re-inserts on every doc update
- Queue handler already has `embed` job type — we'll add `infer-edge-type` later (Phase 6)

## Requirements

### Functional
- Add `type`, `weight`, `inferred` columns to `document_links`
- Create `document_similarities` table for cached implicit edges
- Define `EdgeType` enum in shared types
- Parse `[[target|type:depends-on]]` syntax in wikilink extractor
- Store edge type during `syncWikilinks()` (default: `relates-to`)
- Backward compatible — existing links become `relates-to`

### Non-functional
- Zero downtime migration (additive columns only)
- No breaking changes to existing API responses

## Architecture

```
User writes [[target|type:extends]] in editor
  → extractWikilinks() parses target + type
  → syncWikilinks() stores link with type='extends'
  → Existing [[target]] links default to type='relates-to'
```

## Related Code Files

### Modify
- `packages/api/src/db/schema.ts` — Add columns to `documentLinks`, add `documentSimilarities` table
- `packages/api/src/utils/wikilink-extractor.ts` — Parse type annotation in wikilinks
- `packages/api/src/services/document-service.ts` — Update `syncWikilinks()` to store type
- `packages/shared/src/index.ts` — Re-export new graph types

### Create
- `packages/shared/src/types/graph.ts` — EdgeType enum, GraphNode, GraphEdge, GraphResponse interfaces
- `packages/api/src/db/migrations/0005_*.sql` — Migration (auto-generated via drizzle-kit)

## Implementation Steps

### Step 1: Shared Graph Types
Create `packages/shared/src/types/graph.ts`:
```typescript
/** Edge relationship types for knowledge graph */
export const EDGE_TYPES = [
  'relates-to',
  'depends-on',
  'extends',
  'references',
  'contradicts',
  'implements',
] as const
export type EdgeType = (typeof EDGE_TYPES)[number]

/** Inference status: 0=user-explicit, 1=ai-inferred, 2=user-confirmed */
export type InferredStatus = 0 | 1 | 2

export interface GraphNode {
  id: string
  label: string
  category: string | null
  tags: string[]
  summary?: string | null
  degree?: number
  folderId?: string | null
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  type: EdgeType
  weight: number
  implicit: boolean
  context?: string | null
  score?: number // similarity score for implicit edges
}

export interface GraphResponse {
  nodes: Array<{ data: GraphNode }>
  edges: Array<{ data: GraphEdge }>
  stats: {
    nodeCount: number
    edgeCount: number
    explicitEdges: number
    implicitEdges: number
  }
}
```

Export from `packages/shared/src/index.ts`.

### Step 2: Schema Update
In `packages/api/src/db/schema.ts`, update `documentLinks`:
```typescript
export const documentLinks = sqliteTable('document_links', {
  id: text('id').primaryKey(),
  sourceDocId: text('source_doc_id').notNull().references(() => documents.id),
  targetDocId: text('target_doc_id').notNull().references(() => documents.id),
  context: text('context'),
  type: text('type').notNull().default('relates-to'), // EdgeType
  weight: real('weight').default(1.0),
  inferred: integer('inferred').default(0), // 0=explicit, 1=ai-inferred, 2=user-confirmed
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})
```

Add `documentSimilarities`:
```typescript
export const documentSimilarities = sqliteTable('document_similarities', {
  id: text('id').primaryKey(),
  sourceDocId: text('source_doc_id').notNull().references(() => documents.id),
  targetDocId: text('target_doc_id').notNull().references(() => documents.id),
  score: real('score').notNull(),
  computedAt: integer('computed_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('idx_similarities_source').on(table.sourceDocId),
  uniqueIndex('idx_similarities_pair').on(table.sourceDocId, table.targetDocId),
])
```

### Step 3: Generate Migration
```bash
pnpm -F @agentwiki/api db:generate
```
Verify migration SQL adds columns with defaults (no data loss).

### Step 4: Enhance Wikilink Extractor
Update `packages/api/src/utils/wikilink-extractor.ts`:

```typescript
export interface ExtractedLink {
  target: string
  displayText: string | null
  context: string
  type: EdgeType | null // null = use default 'relates-to'
}

// Matches: [[target]], [[display|target]], [[target|type:depends-on]], [[display|target|type:extends]]
const WIKILINK_REGEX = /\[\[([^\]]+)\]\]/g
const TYPE_ANNOTATION = /\|type:([a-z-]+)$/

export function extractWikilinks(content: string): ExtractedLink[] {
  const links: ExtractedLink[] = []
  let match: RegExpExecArray | null

  while ((match = WIKILINK_REGEX.exec(content)) !== null) {
    let inner = match[1]
    let type: EdgeType | null = null

    // Check for type annotation at end
    const typeMatch = inner.match(TYPE_ANNOTATION)
    if (typeMatch && EDGE_TYPES.includes(typeMatch[1] as EdgeType)) {
      type = typeMatch[1] as EdgeType
      inner = inner.slice(0, inner.lastIndexOf('|type:'))
    }

    const pipeIndex = inner.indexOf('|')
    const target = pipeIndex >= 0 ? inner.slice(pipeIndex + 1).trim() : inner.trim()
    const displayText = pipeIndex >= 0 ? inner.slice(0, pipeIndex).trim() : null

    const start = Math.max(0, match.index - 40)
    const end = Math.min(content.length, match.index + match[0].length + 40)
    const context = content.slice(start, end).replace(/\n/g, ' ').trim()

    links.push({ target, displayText, context, type })
  }

  return links
}
```

### Step 5: Update syncWikilinks()
In `packages/api/src/services/document-service.ts`, update the insert to include `type`:

```typescript
async function syncWikilinks(db, docId, content, tenantId) {
  await db.delete(documentLinks).where(eq(documentLinks.sourceDocId, docId))

  const links = extractWikilinks(content)
  if (!links.length) return

  for (const link of links) {
    const target = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(
        eq(documents.tenantId, tenantId),
        isNull(documents.deletedAt),
        sql`(${documents.slug} = ${link.target.toLowerCase()} OR ${documents.title} = ${link.target})`,
      ))
      .limit(1)

    if (target.length) {
      await db.insert(documentLinks).values({
        id: generateId(),
        sourceDocId: docId,
        targetDocId: target[0].id,
        context: link.context,
        type: link.type ?? 'relates-to',
        weight: 1.0,
        inferred: link.type ? 0 : 0, // explicit if user typed, later AI sets to 1
        createdAt: new Date(),
      })
    }
  }
}
```

### Step 6: Update getDocumentLinks()
Add `type` and `weight` to the select in `getDocumentLinks()`:
```typescript
const forward = await db
  .select({
    targetId: documentLinks.targetDocId,
    context: documentLinks.context,
    type: documentLinks.type,
    weight: documentLinks.weight,
    title: documents.title,
    slug: documents.slug,
  })
  // ... rest same
```

### Step 7: Type-check + Test
```bash
pnpm type-check
pnpm -F @agentwiki/api test
```

## Todo List
- [x] Create `packages/shared/src/types/graph.ts` with EdgeType and interfaces
- [x] Export graph types from `packages/shared/src/index.ts`
- [x] Add `type`, `weight`, `inferred` columns to `documentLinks` schema
- [x] Add `documentSimilarities` table to schema
- [x] Generate Drizzle migration
- [x] Update `extractWikilinks()` to parse `|type:X` annotation
- [x] Update `syncWikilinks()` to store edge type
- [x] Update `getDocumentLinks()` to return type + weight
- [x] Type-check all packages
- [x] Run tests

## Success Criteria
- Migration applies cleanly (local + remote D1)
- Existing wikilinks default to `relates-to`
- New `[[target|type:depends-on]]` syntax parsed correctly
- `getDocumentLinks()` returns typed edges
- All existing tests pass
- Type-check passes across monorepo

## Risk Assessment
- **Column defaults**: SQLite `ALTER TABLE ADD COLUMN` with defaults is safe — existing rows get default value
- **Regex change**: New regex must handle all existing formats — test extensively

## Security Considerations
- Edge type values validated against `EDGE_TYPES` enum (no injection risk)
- No new auth/permission changes needed
