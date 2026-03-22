/** Folder tree management */

import { eq, and, isNull, asc, desc, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { generateKeyBetween } from 'fractional-indexing'
import { folders, documents } from '../db/schema'
import { generateId } from '../utils/crypto'
import { slugify } from '../utils/slug'
import type { Env } from '../env'

/** Create a folder (appended at end of siblings) */
export async function createFolder(
  env: Env,
  tenantId: string,
  userId: string,
  name: string,
  parentId?: string | null,
) {
  const db = drizzle(env.DB)
  const now = new Date()
  const id = generateId()

  // Compute position: append after last sibling
  const parentCondition = parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId)
  const lastSibling = await db
    .select({ positionIndex: folders.positionIndex })
    .from(folders)
    .where(and(eq(folders.tenantId, tenantId), parentCondition))
    .orderBy(desc(folders.positionIndex))
    .limit(1)

  const newPosition = generateKeyBetween(lastSibling[0]?.positionIndex ?? null, null)

  await db.insert(folders).values({
    id,
    tenantId,
    parentId: parentId ?? null,
    name,
    slug: slugify(name),
    positionIndex: newPosition,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  })

  return { id, name }
}

/** Get folder tree for a tenant */
export async function getFolderTree(env: Env, tenantId: string) {
  const db = drizzle(env.DB)

  const allFolders = await db
    .select()
    .from(folders)
    .where(eq(folders.tenantId, tenantId))
    .orderBy(asc(folders.positionIndex), asc(folders.name))

  // Count docs per folder in a single query
  const docCounts = await db
    .select({ folderId: documents.folderId, count: sql<number>`count(*)` })
    .from(documents)
    .where(and(eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))
    .groupBy(documents.folderId)
  const countMap = new Map(docCounts.filter((r) => r.folderId).map((r) => [r.folderId, r.count]))

  // Build tree from flat list
  type FolderNode = (typeof allFolders)[0] & { children: FolderNode[]; docCount: number }
  const map = new Map<string, FolderNode>()
  const roots: FolderNode[] = []

  for (const f of allFolders) {
    map.set(f.id, { ...f, children: [], docCount: countMap.get(f.id) ?? 0 })
  }

  for (const f of allFolders) {
    const node = map.get(f.id)!
    if (f.parentId && map.has(f.parentId)) {
      map.get(f.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

/** Update folder (rename, move, reorder) */
export async function updateFolder(
  env: Env,
  tenantId: string,
  folderId: string,
  updates: { name?: string; parentId?: string | null; position?: number; positionIndex?: string },
) {
  const db = drizzle(env.DB)
  const set: Record<string, unknown> = { updatedAt: new Date() }

  if (updates.name !== undefined) {
    set.name = updates.name
    set.slug = slugify(updates.name)
  }
  if (updates.parentId !== undefined) set.parentId = updates.parentId
  if (updates.position !== undefined) set.position = updates.position
  if (updates.positionIndex !== undefined) set.positionIndex = updates.positionIndex

  await db
    .update(folders)
    .set(set)
    .where(and(eq(folders.id, folderId), eq(folders.tenantId, tenantId)))

  return { id: folderId }
}

/** Delete folder (must be empty) */
export async function deleteFolder(env: Env, tenantId: string, folderId: string) {
  const db = drizzle(env.DB)

  // Check for child documents
  const docs = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.folderId, folderId), isNull(documents.deletedAt)))
    .limit(1)

  if (docs.length) {
    return { error: 'Folder is not empty — move or delete documents first' }
  }

  // Check for child folders
  const children = await db
    .select({ id: folders.id })
    .from(folders)
    .where(eq(folders.parentId, folderId))
    .limit(1)

  if (children.length) {
    return { error: 'Folder has subfolders — move or delete them first' }
  }

  await db.delete(folders).where(and(eq(folders.id, folderId), eq(folders.tenantId, tenantId)))
  return { ok: true }
}
