/** AI-powered graph enrichment — edge type inference, link suggestions */

import { eq, and, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { documents, documentLinks } from '../db/schema'
import { EDGE_TYPES, type EdgeType } from '@agentwiki/shared'
import type { Env } from '../env'

const VALID_TYPES = EDGE_TYPES as readonly string[]

const TYPE_INFERENCE_PROMPT = `Classify the relationship between two wiki documents based on the context where a link appears.
Choose exactly one type from this list:
- relates-to: general relationship
- depends-on: source requires/needs target to work
- extends: source builds upon or expands target
- references: source cites or mentions target
- contradicts: source conflicts with target
- implements: source implements a concept from target

Context around the link: "{context}"
Source document title: "{sourceTitle}"
Target document title: "{targetTitle}"

Respond with only the relationship type, nothing else.`

/** Infer edge type using Workers AI (Llama 3.1 8B) */
export async function inferEdgeType(
  env: Env,
  context: string,
  sourceTitle: string,
  targetTitle: string,
): Promise<EdgeType> {
  try {
    const prompt = TYPE_INFERENCE_PROMPT
      .replace('{context}', context.slice(0, 200))
      .replace('{sourceTitle}', sourceTitle)
      .replace('{targetTitle}', targetTitle)

    const result = await (env.AI as Ai).run('@cf/meta/llama-3.1-8b-instruct' as never, {
      messages: [
        { role: 'system', content: 'You are a document relationship classifier. Return only the relationship type name.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 20,
    } as never) as { response: string }

    const type = result.response?.trim().toLowerCase()
    return VALID_TYPES.includes(type) ? (type as EdgeType) : 'relates-to'
  } catch {
    return 'relates-to'
  }
}

/** Infer edge types for all untyped links from a document (max 10 per batch) */
export async function inferEdgeTypesForDoc(env: Env, docId: string, tenantId: string) {
  const db = drizzle(env.DB)

  // Get untyped links (type='relates-to' AND inferred=0)
  const links = await db.select({
    id: documentLinks.id,
    context: documentLinks.context,
    targetId: documentLinks.targetDocId,
  }).from(documentLinks).where(and(
    eq(documentLinks.sourceDocId, docId),
    eq(documentLinks.type, 'relates-to'),
    eq(documentLinks.inferred, 0),
  ))

  if (!links.length) return

  // Get source doc title
  const source = await db.select({ title: documents.title })
    .from(documents).where(eq(documents.id, docId)).limit(1)
  if (!source.length) return

  // Batch-fetch all target titles (fix N+1 query)
  const batch = links.slice(0, 10)
  const targetIds = batch.map((l) => l.targetId)
  const targets = await db.select({ id: documents.id, title: documents.title })
    .from(documents).where(inArray(documents.id, targetIds))
  const titleMap = new Map(targets.map((t) => [t.id, t.title]))

  // Process max 10 links per batch to stay within Workers AI quota
  for (const link of batch) {
    const targetTitle = titleMap.get(link.targetId)
    if (!targetTitle) continue

    const type = await inferEdgeType(env, link.context ?? '', source[0].title, targetTitle)

    // Always mark as inferred so it won't be re-processed (fix infinite re-queue)
    await db.update(documentLinks)
      .set({ type, inferred: 1 })
      .where(eq(documentLinks.id, link.id))
  }
}
