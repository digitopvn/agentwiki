/** User preferences service — per-user per-tenant key-value store */

import { eq, and, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { userPreferences } from '../db/schema'
import { generateId } from '../utils/crypto'
import type { Env } from '../env'

/** Allowed preference keys (prevents arbitrary key storage) */
const ALLOWED_KEYS = new Set(['sidebar_sort', 'sidebar_collapsed', 'theme'])

/** Get all preferences for a user in a tenant */
export async function getPreferences(env: Env, userId: string, tenantId: string) {
  const db = drizzle(env.DB)

  const rows = await db
    .select({ key: userPreferences.key, value: userPreferences.value })
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.tenantId, tenantId)))

  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.key] = row.value
  }
  return result
}

/** Upsert a single preference using INSERT ... ON CONFLICT to avoid TOCTOU race */
export async function setPreference(
  env: Env,
  userId: string,
  tenantId: string,
  key: string,
  value: string,
) {
  // Validate key against allowlist
  if (!ALLOWED_KEYS.has(key)) {
    return { error: `Invalid preference key: ${key}` }
  }

  const db = drizzle(env.DB)
  const now = new Date()

  // Atomic upsert via raw SQL — Drizzle's onConflictDoUpdate requires SQLite 3.35+
  await db.run(sql`
    INSERT INTO user_preferences (id, user_id, tenant_id, key, value, updated_at)
    VALUES (${generateId()}, ${userId}, ${tenantId}, ${key}, ${value}, ${now.getTime()})
    ON CONFLICT (user_id, tenant_id, key)
    DO UPDATE SET value = ${value}, updated_at = ${now.getTime()}
  `)

  return { ok: true }
}
