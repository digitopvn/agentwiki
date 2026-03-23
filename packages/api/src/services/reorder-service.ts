/** Reorder service — fractional indexing for folders and documents */

import { eq, and, isNull, asc } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { generateKeyBetween } from 'fractional-indexing'
import { folders, documents } from '../db/schema'
import type { Env } from '../env'

interface ReorderInput {
  type: 'folder' | 'document'
  id: string
  parentId: string | null
  afterId?: string
  beforeId?: string
}

/** Reorder an item by computing a new fractional position between neighbors */
export async function reorderItem(env: Env, tenantId: string, input: ReorderInput) {
  const db = drizzle(env.DB)

  let afterPosition: string | null = null
  let beforePosition: string | null = null

  if (input.type === 'folder') {
    if (input.afterId) {
      const after = await db
        .select({ positionIndex: folders.positionIndex })
        .from(folders)
        .where(and(eq(folders.id, input.afterId), eq(folders.tenantId, tenantId)))
        .limit(1)
      afterPosition = after[0]?.positionIndex ?? null
    }
    if (input.beforeId) {
      const before = await db
        .select({ positionIndex: folders.positionIndex })
        .from(folders)
        .where(and(eq(folders.id, input.beforeId), eq(folders.tenantId, tenantId)))
        .limit(1)
      beforePosition = before[0]?.positionIndex ?? null
    }

    // If no neighbors specified, compute position at start or end
    if (!input.afterId && !input.beforeId) {
      // Move to end of siblings
      const parentCondition = input.parentId ? eq(folders.parentId, input.parentId) : isNull(folders.parentId)
      const siblings = await db
        .select({ positionIndex: folders.positionIndex })
        .from(folders)
        .where(and(eq(folders.tenantId, tenantId), parentCondition))
        .orderBy(asc(folders.positionIndex))

      const filtered = siblings.filter((s) => s.positionIndex !== undefined)
      afterPosition = filtered.length > 0 ? filtered[filtered.length - 1].positionIndex : null
    }

    const newPosition = generateKeyBetween(afterPosition, beforePosition)

    // Verify folder belongs to the specified parent before reordering
    const parentCondCheck = input.parentId ? eq(folders.parentId, input.parentId) : isNull(folders.parentId)
    const existing = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, input.id), eq(folders.tenantId, tenantId), parentCondCheck))
      .limit(1)
    if (!existing.length) {
      throw new Error('Folder does not belong to the specified parent')
    }

    await db
      .update(folders)
      .set({ positionIndex: newPosition, parentId: input.parentId, updatedAt: new Date() })
      .where(and(eq(folders.id, input.id), eq(folders.tenantId, tenantId)))

    return { id: input.id, position: newPosition }
  }

  // Document reorder
  if (input.afterId) {
    const after = await db
      .select({ position: documents.position })
      .from(documents)
      .where(and(eq(documents.id, input.afterId), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))
      .limit(1)
    afterPosition = after[0]?.position ?? null
  }
  if (input.beforeId) {
    const before = await db
      .select({ position: documents.position })
      .from(documents)
      .where(and(eq(documents.id, input.beforeId), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))
      .limit(1)
    beforePosition = before[0]?.position ?? null
  }

  // If no neighbors specified, move to end
  if (!input.afterId && !input.beforeId) {
    const folderCondition = input.parentId ? eq(documents.folderId, input.parentId) : isNull(documents.folderId)
    const siblings = await db
      .select({ position: documents.position })
      .from(documents)
      .where(and(eq(documents.tenantId, tenantId), folderCondition, isNull(documents.deletedAt)))
      .orderBy(asc(documents.position))

    afterPosition = siblings.length > 0 ? siblings[siblings.length - 1].position : null
  }

  const newPosition = generateKeyBetween(afterPosition, beforePosition)

  // Verify document belongs to the specified folder before reordering
  const folderCondCheck = input.parentId ? eq(documents.folderId, input.parentId) : isNull(documents.folderId)
  const existingDoc = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, input.id), eq(documents.tenantId, tenantId), folderCondCheck, isNull(documents.deletedAt)))
    .limit(1)
  if (!existingDoc.length) {
    throw new Error('Document does not belong to the specified folder')
  }

  await db
    .update(documents)
    .set({ position: newPosition, folderId: input.parentId, updatedAt: new Date() })
    .where(and(eq(documents.id, input.id), eq(documents.tenantId, tenantId)))

  return { id: input.id, position: newPosition }
}
