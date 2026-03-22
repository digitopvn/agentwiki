/** Document CRUD + versioning + wikilink extraction */

import { eq, and, isNull, desc, asc, sql, like, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { generateKeyBetween } from 'fractional-indexing'
import { deleteDocumentTrigrams } from './trigram-service'
import {
  documents,
  documentVersions,
  documentTags,
  documentLinks,
  users,
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

  // Compute position: append after last sibling in same folder
  const folderCondition = input.folderId ? eq(documents.folderId, input.folderId) : isNull(documents.folderId)
  const lastSibling = await db
    .select({ position: documents.position })
    .from(documents)
    .where(and(eq(documents.tenantId, tenantId), folderCondition, isNull(documents.deletedAt)))
    .orderBy(desc(documents.position))
    .limit(1)

  const newPosition = generateKeyBetween(lastSibling[0]?.position ?? null, null)

  await db.insert(documents).values({
    id,
    tenantId,
    folderId: input.folderId ?? null,
    position: newPosition,
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

  // Enqueue AI summary generation
  try {
    await env.QUEUE.send({ type: 'generate-summary', documentId: id, tenantId })
  } catch {
    // Queue may not be available in dev
  }

  return { id, slug, title: input.title }
}

/** Get a single document by ID */
export async function getDocument(env: Env, tenantId: string, docId: string) {
  const db = drizzle(env.DB)

  const doc = await db
    .select({
      id: documents.id,
      tenantId: documents.tenantId,
      folderId: documents.folderId,
      title: documents.title,
      slug: documents.slug,
      content: documents.content,
      contentJson: documents.contentJson,
      summary: documents.summary,
      category: documents.category,
      accessLevel: documents.accessLevel,
      createdBy: documents.createdBy,
      updatedBy: documents.updatedBy,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      deletedAt: documents.deletedAt,
      authorName: users.name,
      authorAvatar: users.avatarUrl,
    })
    .from(documents)
    .leftJoin(users, eq(documents.createdBy, users.id))
    .where(and(eq(documents.id, docId), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))
    .limit(1)

  if (!doc.length) return null

  const tags = await db
    .select({ tag: documentTags.tag })
    .from(documentTags)
    .where(eq(documentTags.documentId, docId))

  return { ...doc[0], tags: tags.map((t) => t.tag) }
}

/** Get a single document by slug */
export async function getDocumentBySlug(env: Env, tenantId: string, slug: string) {
  const db = drizzle(env.DB)

  const doc = await db
    .select({
      id: documents.id,
      tenantId: documents.tenantId,
      folderId: documents.folderId,
      title: documents.title,
      slug: documents.slug,
      content: documents.content,
      contentJson: documents.contentJson,
      summary: documents.summary,
      category: documents.category,
      accessLevel: documents.accessLevel,
      createdBy: documents.createdBy,
      updatedBy: documents.updatedBy,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      deletedAt: documents.deletedAt,
      authorName: users.name,
      authorAvatar: users.avatarUrl,
    })
    .from(documents)
    .leftJoin(users, eq(documents.createdBy, users.id))
    .where(and(eq(documents.slug, slug), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))
    .limit(1)

  if (!doc.length) return null

  const tags = await db
    .select({ tag: documentTags.tag })
    .from(documentTags)
    .where(eq(documentTags.documentId, doc[0].id))

  return { ...doc[0], tags: tags.map((t) => t.tag) }
}

/** List documents with pagination + filters */
export async function listDocuments(
  env: Env,
  tenantId: string,
  params: PaginationParams,
  filters?: { folderId?: string; category?: string; tag?: string; search?: string; sort?: string; order?: string },
) {
  const db = drizzle(env.DB)
  const conditions = [eq(documents.tenantId, tenantId), isNull(documents.deletedAt)]

  if (filters?.folderId) conditions.push(eq(documents.folderId, filters.folderId))
  if (filters?.category) conditions.push(eq(documents.category, filters.category))
  if (filters?.search) conditions.push(like(documents.title, `%${filters.search}%`))

  // Determine sort order
  const sortField = filters?.sort === 'position' ? documents.position
    : filters?.sort === 'title' ? documents.title
    : documents.updatedAt
  const sortDir = filters?.order === 'asc' ? asc(sortField) : desc(sortField)

  let query = db
    .select({
      id: documents.id,
      title: documents.title,
      slug: documents.slug,
      summary: documents.summary,
      category: documents.category,
      accessLevel: documents.accessLevel,
      folderId: documents.folderId,
      position: documents.position,
      createdBy: documents.createdBy,
      updatedAt: documents.updatedAt,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(and(...conditions))
    .orderBy(sortDir)
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
        position: documents.position,
        createdBy: documents.createdBy,
        updatedAt: documents.updatedAt,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(and(...conditions, inArray(documents.id, taggedIds)))
      .orderBy(sortDir)
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

/** Hash content for version dedup comparison */
async function contentHash(content: string): Promise<string> {
  const data = new TextEncoder().encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Decide if a new version should be created (content-hash + 5-min time-gate) */
async function shouldCreateVersion(
  currentContent: string,
  newContent: string | undefined,
  lastVersionCreatedAt: Date | number | undefined,
): Promise<boolean> {
  if (newContent === undefined) return false

  const currentH = await contentHash(currentContent)
  const newH = await contentHash(newContent)
  if (currentH === newH) return false

  // Time gate: at least 5 minutes since last version
  if (lastVersionCreatedAt) {
    const MIN_INTERVAL = 5 * 60 * 1000
    const elapsed = Date.now() - new Date(lastVersionCreatedAt).getTime()
    if (elapsed < MIN_INTERVAL) return false
  }

  return true
}

/** Update a document — conditionally creates a version (hash+time-gate) */
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

  // Get last version for dedup check
  const lastVersion = await db
    .select({ version: documentVersions.version, createdAt: documentVersions.createdAt })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, docId))
    .orderBy(desc(documentVersions.version))
    .limit(1)

  // Only create version if content genuinely changed + time-gate passed
  const shouldVersion = await shouldCreateVersion(
    current[0].content,
    input.content,
    lastVersion[0]?.createdAt,
  )

  if (shouldVersion) {
    const nextVersion = (lastVersion[0]?.version ?? 0) + 1
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
  }

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

  // Enqueue summary regeneration
  try {
    await env.QUEUE.send({ type: 'generate-summary', documentId: docId, tenantId })
  } catch {
    // Queue may not be available in dev
  }

  return { id: docId }
}

/** Force create a version checkpoint (manual save) */
export async function createVersionCheckpoint(env: Env, tenantId: string, docId: string, userId: string) {
  const db = drizzle(env.DB)
  const current = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))
    .limit(1)

  if (!current.length) return null

  const lastVersion = await db
    .select({ version: documentVersions.version })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, docId))
    .orderBy(desc(documentVersions.version))
    .limit(1)

  const nextVersion = (lastVersion[0]?.version ?? 0) + 1

  await db.insert(documentVersions).values({
    id: generateId(),
    documentId: docId,
    version: nextVersion,
    content: current[0].content,
    contentJson: current[0].contentJson,
    changeSummary: 'Manual checkpoint',
    createdBy: userId,
    createdAt: new Date(),
  })

  return { id: docId, version: nextVersion }
}

/** Soft-delete a document and clean up trigram index */
export async function deleteDocument(env: Env, tenantId: string, docId: string) {
  const db = drizzle(env.DB)
  const result = await db
    .update(documents)
    .set({ deletedAt: new Date() })
    .where(and(eq(documents.id, docId), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))

  // Clean up trigram index for deleted document
  await deleteDocumentTrigrams(env, docId).catch(() => {})

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
