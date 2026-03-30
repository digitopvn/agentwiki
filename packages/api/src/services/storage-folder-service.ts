/** Storage folder tree management (separate from document folders) */

import { eq, and, asc, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { storageFolders, uploads } from '../db/schema'
import { generateId } from '../utils/crypto'
import { slugify } from '../utils/slug'
import type { Env } from '../env'

/** Create a storage folder */
export async function createStorageFolder(
  env: Env,
  tenantId: string,
  userId: string,
  name: string,
  parentId?: string | null,
) {
  const db = drizzle(env.DB)
  const now = new Date()
  const id = generateId()

  // Verify parent belongs to same tenant if provided
  if (parentId) {
    const parent = await db
      .select({ id: storageFolders.id })
      .from(storageFolders)
      .where(and(eq(storageFolders.id, parentId), eq(storageFolders.tenantId, tenantId)))
      .limit(1)
    if (!parent.length) return { error: 'Parent folder not found' }
  }

  await db.insert(storageFolders).values({
    id,
    tenantId,
    parentId: parentId ?? null,
    name,
    slug: slugify(name),
    position: 0,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  })

  return { id, name, slug: slugify(name), parentId: parentId ?? null }
}

/** Get storage folder tree for a tenant */
export async function getStorageFolderTree(env: Env, tenantId: string) {
  const db = drizzle(env.DB)

  const allFolders = await db
    .select()
    .from(storageFolders)
    .where(eq(storageFolders.tenantId, tenantId))
    .orderBy(asc(storageFolders.position), asc(storageFolders.name))

  // Build tree from flat list
  type FolderNode = (typeof allFolders)[0] & { children: FolderNode[] }
  const map = new Map<string, FolderNode>()
  const roots: FolderNode[] = []

  for (const f of allFolders) {
    map.set(f.id, { ...f, children: [] })
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

/** Check if moving folder would create a circular reference */
function wouldCreateCycle(
  allFolders: { id: string; parentId: string | null }[],
  folderId: string,
  newParentId: string | null,
): boolean {
  if (!newParentId) return false
  if (newParentId === folderId) return true

  const parentMap = new Map(allFolders.map((f) => [f.id, f.parentId]))
  let walk: string | null = newParentId
  while (walk) {
    if (walk === folderId) return true
    walk = parentMap.get(walk) ?? null
  }
  return false
}

/** Update storage folder (rename, move, reorder) */
export async function updateStorageFolder(
  env: Env,
  tenantId: string,
  folderId: string,
  updates: { name?: string; parentId?: string | null; position?: number },
) {
  const db = drizzle(env.DB)

  // Check circular nesting if parentId is being changed
  if (updates.parentId !== undefined) {
    const allFolders = await db
      .select({ id: storageFolders.id, parentId: storageFolders.parentId })
      .from(storageFolders)
      .where(eq(storageFolders.tenantId, tenantId))

    if (wouldCreateCycle(allFolders, folderId, updates.parentId)) {
      return { error: 'Cannot move folder into its own descendant' }
    }
  }

  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (updates.name !== undefined) {
    set.name = updates.name
    set.slug = slugify(updates.name)
  }
  if (updates.parentId !== undefined) set.parentId = updates.parentId
  if (updates.position !== undefined) set.position = updates.position

  await db
    .update(storageFolders)
    .set(set)
    .where(and(eq(storageFolders.id, folderId), eq(storageFolders.tenantId, tenantId)))

  return { id: folderId }
}

/** Collect all descendant folder IDs recursively */
function collectDescendantIds(
  allFolders: { id: string; parentId: string | null }[],
  folderId: string,
): string[] {
  const children = allFolders.filter((f) => f.parentId === folderId)
  const ids: string[] = []
  for (const child of children) {
    ids.push(child.id)
    ids.push(...collectDescendantIds(allFolders, child.id))
  }
  return ids
}

/** Delete storage folder: moves contained files to root, deletes descendants */
export async function deleteStorageFolder(env: Env, tenantId: string, folderId: string) {
  const db = drizzle(env.DB)

  // Verify folder exists and belongs to tenant
  const folder = await db
    .select({ id: storageFolders.id })
    .from(storageFolders)
    .where(and(eq(storageFolders.id, folderId), eq(storageFolders.tenantId, tenantId)))
    .limit(1)

  if (!folder.length) return { error: 'Folder not found' }

  // Get all descendant folder IDs
  const allFolders = await db
    .select({ id: storageFolders.id, parentId: storageFolders.parentId })
    .from(storageFolders)
    .where(eq(storageFolders.tenantId, tenantId))

  const descendantIds = collectDescendantIds(allFolders, folderId)
  const allFolderIds = [folderId, ...descendantIds]

  // Move all files in this folder and descendants to root (batch)
  await db
    .update(uploads)
    .set({ folderId: null })
    .where(and(inArray(uploads.folderId, allFolderIds), eq(uploads.tenantId, tenantId)))

  // Delete all descendant folders + the folder itself (batch)
  await db
    .delete(storageFolders)
    .where(and(inArray(storageFolders.id, allFolderIds), eq(storageFolders.tenantId, tenantId)))

  return { ok: true }
}
