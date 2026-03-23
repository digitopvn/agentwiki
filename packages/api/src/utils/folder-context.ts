/** Build folder hierarchy context for AI agent consumption */

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

  // Single recursive CTE instead of N+1 queries per ancestor level
  const result = await env.DB.prepare(`
    WITH RECURSIVE ancestors(id, name, description, parent_id, depth) AS (
      SELECT id, name, description, parent_id, 0 FROM folders WHERE id = ?
      UNION ALL
      SELECT f.id, f.name, f.description, f.parent_id, a.depth + 1
      FROM folders f INNER JOIN ancestors a ON f.id = a.parent_id
      WHERE a.depth < 10
    )
    SELECT name, description FROM ancestors ORDER BY depth DESC
  `).bind(folderId).all()

  const chain = (result.results ?? []).map((r) => ({
    name: r.name as string,
    description: (r.description as string) ?? null,
  }))

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

/**
 * Invalidate folder context cache for a folder AND all its descendants.
 * When a parent folder's name/description changes, all child context strings become stale
 * since each context includes the full ancestor chain.
 */
export async function invalidateFolderContext(env: Env, folderId: string): Promise<void> {
  try {
    // Find all descendant folders via recursive CTE (single D1 query)
    const descendants = await env.DB.prepare(`
      WITH RECURSIVE tree(id) AS (
        SELECT id FROM folders WHERE id = ?
        UNION ALL
        SELECT f.id FROM folders f INNER JOIN tree t ON f.parent_id = t.id
      )
      SELECT id FROM tree
    `).bind(folderId).all()

    const ids = (descendants.results ?? []).map((r) => r.id as string)

    // Batch-delete all KV entries (best effort)
    await Promise.all(ids.map((id) => env.KV.delete(`folder-ctx:${id}`).catch(() => {})))
  } catch { /* best effort — cache expires in 10 min anyway */ }
}
