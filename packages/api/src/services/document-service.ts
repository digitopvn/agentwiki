/** Document CRUD + versioning + wikilink extraction */

import { eq, and, isNull, desc, sql, like, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import {
  documents,
  documentVersions,
  documentTags,
  documentLinks,
} from '../db/schema'
import { generateId } from '../utils/crypto'
import { slugify, uniqueSlug } from '../utils/slug'
import { extractWikilinks } from '../utils/wikilink-extractor'
import type { Env } from '../env'
import type { PaginationParams } from '../utils/pagination'

interface CreateDocInput {
  title: string
  content?: string
  contentJson?: unknown
  folderId?: string
  category?: string
  tags?: string[]
  accessLevel?: string
}

interface UpdateDocInput {
  title?: string
  content?: string
  contentJson?: unknown
  folderId?: string | null
  category?: string | null
  tags?: string[]
  accessLevel?: string
}

/** Create a new document */
export async function createDocument(
  env: Env,
  tenantId: string,
  userId: string,
  input: CreateDocInput,
) {
  const db = drizzle(env.DB)
  const now = new Date()
  const id = generateId()
  const baseSlug = slugify(input.title)

  const slug = await uniqueSlug(baseSlug, async (s) => {
    const existing = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.tenantId, tenantId), eq(documents.slug, s)))
      .limit(1)
    return existing.length > 0
  })

  await db.insert(documents).values({
    id,
    tenantId,
    folderId: input.folderId ?? null,
    title: input.title,
    slug,
    content: input.content ?? '',
    contentJson: input.contentJson ?? null,
    summary: null,
    category: input.category ?? null,
    accessLevel: input.accessLevel ?? 'private',
    createdBy: userId,
    updatedBy: userId,
    createdAt: now,
    updatedAt: now,
  })

  // Insert tags
  if (input.tags?.length) {
    await db.insert(documentTags).values(
      input.tags.map((tag) => ({ id: generateId(), documentId: id, tag })),
    )
  }

  // Extract and store wikilinks
  if (input.content) {
    await syncWikilinks(db, id, input.content, tenantId)
  }

  // Enqueue AI summary generation + search indexing
  try {
    await env.QUEUE.send({ type: 'generate-summary', documentId: id, tenantId })
    await env.QUEUE.send({ type: 'index-fts5', documentId: id, tenantId })
    await env.QUEUE.send({ type: 'index-trigrams', documentId: id, tenantId })
  } catch {
    // Queue may not be available in dev
  }

  return { id, slug, title: input.title }
}

/** Get a single document by ID */
export async function getDocument(env: Env, tenantId: string, docId: string) {
  const db = drizzle(env.DB)

  const doc = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))
    .limit(1)

  if (!doc.length) return null

  const tags = await db
    .select({ tag: documentTags.tag })
    .from(documentTags)
    .where(eq(documentTags.documentId, docId))

  return { ...doc[0], tags: tags.map((t) => t.tag) }
}

/** List documents with pagination + filters */
export async function listDocuments(
  env: Env,
  tenantId: string,
  params: PaginationParams,
  filters?: { folderId?: string; category?: string; tag?: string; search?: string },
) {
  const db = drizzle(env.DB)
  const conditions = [eq(documents.tenantId, tenantId), isNull(documents.deletedAt)]

  if (filters?.folderId) conditions.push(eq(documents.folderId, filters.folderId))
  if (filters?.category) conditions.push(eq(documents.category, filters.category))
  if (filters?.search) conditions.push(like(documents.title, `%${filters.search}%`))

  let query = db
    .select({
      id: documents.id,
      title: documents.title,
      slug: documents.slug,
      summary: documents.summary,
      category: documents.category,
      accessLevel: documents.accessLevel,
      folderId: documents.folderId,
      createdBy: documents.createdBy,
      updatedAt: documents.updatedAt,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(and(...conditions))
    .orderBy(desc(documents.updatedAt))
    .limit(params.limit)
    .offset(params.offset)

  // Tag filter requires subquery
  if (filters?.tag) {
    const taggedIds = db
      .select({ documentId: documentTags.documentId })
      .from(documentTags)
      .where(eq(documentTags.tag, filters.tag))

    query = db
      .select({
        id: documents.id,
        title: documents.title,
        slug: documents.slug,
        summary: documents.summary,
        category: documents.category,
        accessLevel: documents.accessLevel,
        folderId: documents.folderId,
        createdBy: documents.createdBy,
        updatedAt: documents.updatedAt,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(and(...conditions, inArray(documents.id, taggedIds)))
      .orderBy(desc(documents.updatedAt))
      .limit(params.limit)
      .offset(params.offset)
  }

  const data = await query

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(documents)
    .where(and(...conditions))

  return { data, total: countResult[0]?.count ?? 0 }
}

/** Update a document — creates a version */
export async function updateDocument(
  env: Env,
  tenantId: string,
  docId: string,
  userId: string,
  input: UpdateDocInput,
) {
  const db = drizzle(env.DB)
  const now = new Date()

  // Get current document for versioning
  const current = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))
    .limit(1)

  if (!current.length) return null

  // Get current version number
  const lastVersion = await db
    .select({ version: documentVersions.version })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, docId))
    .orderBy(desc(documentVersions.version))
    .limit(1)

  const nextVersion = (lastVersion[0]?.version ?? 0) + 1

  // Save current as version
  await db.insert(documentVersions).values({
    id: generateId(),
    documentId: docId,
    version: nextVersion,
    content: current[0].content,
    contentJson: current[0].contentJson,
    changeSummary: null,
    createdBy: userId,
    createdAt: now,
  })

  // Build update object
  const updates: Record<string, unknown> = { updatedBy: userId, updatedAt: now }
  if (input.title !== undefined) {
    updates.title = input.title
    updates.slug = slugify(input.title)
  }
  if (input.content !== undefined) updates.content = input.content
  if (input.contentJson !== undefined) updates.contentJson = input.contentJson
  if (input.folderId !== undefined) updates.folderId = input.folderId
  if (input.category !== undefined) updates.category = input.category
  if (input.accessLevel !== undefined) updates.accessLevel = input.accessLevel

  await db.update(documents).set(updates).where(eq(documents.id, docId))

  // Sync tags
  if (input.tags !== undefined) {
    await db.delete(documentTags).where(eq(documentTags.documentId, docId))
    if (input.tags.length) {
      await db.insert(documentTags).values(
        input.tags.map((tag) => ({ id: generateId(), documentId: docId, tag })),
      )
    }
  }

  // Sync wikilinks
  if (input.content !== undefined) {
    await syncWikilinks(db, docId, input.content, tenantId)
  }

  // Enqueue summary regeneration + search indexing
  try {
    await env.QUEUE.send({ type: 'generate-summary', documentId: docId, tenantId })
    await env.QUEUE.send({ type: 'index-fts5', documentId: docId, tenantId })
    await env.QUEUE.send({ type: 'index-trigrams', documentId: docId, tenantId })
  } catch {
    // Queue may not be available in dev
  }

  return { id: docId, version: nextVersion }
}

/** Soft-delete a document */
export async function deleteDocument(env: Env, tenantId: string, docId: string) {
  const db = drizzle(env.DB)
  const result = await db
    .update(documents)
    .set({ deletedAt: new Date() })
    .where(and(eq(documents.id, docId), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))

  return result
}

/** Get document version history */
export async function getVersionHistory(env: Env, docId: string, limit = 20) {
  const db = drizzle(env.DB)
  return db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, docId))
    .orderBy(desc(documentVersions.version))
    .limit(limit)
}

/** Get forward + backlinks for a document */
export async function getDocumentLinks(env: Env, docId: string) {
  const db = drizzle(env.DB)

  const forward = await db
    .select({
      targetId: documentLinks.targetDocId,
      context: documentLinks.context,
      title: documents.title,
      slug: documents.slug,
    })
    .from(documentLinks)
    .innerJoin(documents, eq(documentLinks.targetDocId, documents.id))
    .where(eq(documentLinks.sourceDocId, docId))

  const backlinks = await db
    .select({
      sourceId: documentLinks.sourceDocId,
      context: documentLinks.context,
      title: documents.title,
      slug: documents.slug,
    })
    .from(documentLinks)
    .innerJoin(documents, eq(documentLinks.sourceDocId, documents.id))
    .where(eq(documentLinks.targetDocId, docId))

  return { forward, backlinks }
}

/** Sync wikilinks — delete old, insert new */
async function syncWikilinks(
  db: ReturnType<typeof drizzle>,
  docId: string,
  content: string,
  tenantId: string,
) {
  // Delete existing links from this source
  await db.delete(documentLinks).where(eq(documentLinks.sourceDocId, docId))

  const links = extractWikilinks(content)
  if (!links.length) return

  // Resolve targets by slug or title
  for (const link of links) {
    const target = await db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, tenantId),
          isNull(documents.deletedAt),
          sql`(${documents.slug} = ${link.target.toLowerCase()} OR ${documents.title} = ${link.target})`,
        ),
      )
      .limit(1)

    if (target.length) {
      await db.insert(documentLinks).values({
        id: generateId(),
        sourceDocId: docId,
        targetDocId: target[0].id,
        context: link.context,
        createdAt: new Date(),
      })
    }
  }
}
