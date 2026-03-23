/** Build folder hierarchy context for AI agent consumption */

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { folders } from '../db/schema'
import type { Env } from '../env'

/**
 * Build context string from folder hierarchy.
 * Returns: "Engineering: Technical docs > API Design: REST patterns > Rate Limiting: Throttling policies"
 * Cached in KV (10-min TTL) since folder hierarchy rarely changes.
 */
export async function buildFolderContext(
  env: Env,
  folderId: string | null,
): Promise<string | null> {
  if (!folderId) return null

  // KV cache check
  const cacheKey = `folder-ctx:${folderId}`
  try {
    const cached = await env.KV.get(cacheKey)
    if (cached) return cached
  } catch { /* cache miss */ }

  const db = drizzle(env.DB)
  const chain: Array<{ name: string; description: string | null }> = []

  let currentId: string | null = folderId
  let depth = 0
  const maxDepth = 10 // safety limit

  while (currentId && depth < maxDepth) {
    const [folder] = await db
      .select({
        name: folders.name,
        description: folders.description,
        parentId: folders.parentId,
      })
      .from(folders)
      .where(eq(folders.id, currentId))
      .limit(1)

    if (!folder) break
    chain.unshift({ name: folder.name, description: folder.description })
    currentId = folder.parentId
    depth++
  }

  if (!chain.length) return null

  // Format: "FolderA: desc > FolderB: desc > FolderC"
  const context = chain
    .map((f) => (f.description ? `${f.name}: ${f.description}` : f.name))
    .join(' > ')

  // Cache for 10 minutes
  try {
    await env.KV.put(cacheKey, context, { expirationTtl: 600 })
  } catch { /* cache write failure is non-critical */ }

  return context
}

/** Invalidate folder context cache for a folder and all descendants */
export async function invalidateFolderContext(env: Env, folderId: string): Promise<void> {
  try {
    await env.KV.delete(`folder-ctx:${folderId}`)
  } catch { /* best effort */ }
}
