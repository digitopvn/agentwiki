/** API key management — create, validate, rotate, revoke */

import { eq, and, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { apiKeys } from '../db/schema'
import { hashApiKey, generateRandomToken, generateId } from '../utils/crypto'
import { API_KEY_PREFIX } from '@agentwiki/shared'
import type { Env } from '../env'

/** Create a new API key — returns plaintext key (shown once) */
export async function createApiKey(
  env: Env,
  tenantId: string,
  name: string,
  scopes: string[],
  createdBy: string,
  expiresAt?: Date,
) {
  const db = drizzle(env.DB)
  const rawKey = generateRandomToken(48)
  const fullKey = `${API_KEY_PREFIX}${rawKey}`
  const keyPrefix = fullKey.substring(0, 11) // "aw_" + 8 chars
  const salt = generateRandomToken(16)
  const keyHash = await hashApiKey(fullKey, salt)

  const id = generateId()
  await db.insert(apiKeys).values({
    id,
    tenantId,
    name,
    keyPrefix,
    keyHash,
    keySalt: salt,
    scopes,
    createdBy,
    expiresAt,
    createdAt: new Date(),
  })

  // Cache in KV for fast lookups
  await env.KV.put(
    `apikey:${keyPrefix}`,
    JSON.stringify({ id, tenantId, scopes, keyHash, keySalt: salt, createdBy }),
    { expirationTtl: 3600 },
  )

  return { id, key: fullKey, keyPrefix, name, scopes }
}

/** Validate an API key — returns tenant/scopes or null */
export async function validateApiKey(env: Env, key: string) {
  if (!key.startsWith(API_KEY_PREFIX)) return null

  const prefix = key.substring(0, 11)

  // Try KV cache first
  const cached = await env.KV.get(`apikey:${prefix}`, 'json') as {
    id: string; tenantId: string; scopes: string[]; keyHash: string; keySalt: string; createdBy?: string
  } | null

  if (cached) {
    const computedHash = await hashApiKey(key, cached.keySalt)
    if (computedHash !== cached.keyHash) return null

    // Stale cache without createdBy — delete and fall through to DB for fresh entry
    if (!cached.createdBy) {
      await env.KV.delete(`apikey:${prefix}`)
    } else {
      // lastUsedAt updated on cache miss (DB path) — skip on cache hit to avoid
      // unawaited promises being dropped by Cloudflare Workers runtime
      return { id: cached.id, tenantId: cached.tenantId, scopes: cached.scopes, createdBy: cached.createdBy }
    }
  }

  // Fallback to DB
  const db = drizzle(env.DB)
  const results = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyPrefix, prefix), isNull(apiKeys.revokedAt)))
    .limit(1)

  if (!results.length) return null
  const record = results[0]

  // Check expiry
  if (record.expiresAt && record.expiresAt < new Date()) return null

  const computedHash = await hashApiKey(key, record.keySalt)
  if (computedHash !== record.keyHash) return null

  // Cache for next time
  await env.KV.put(
    `apikey:${prefix}`,
    JSON.stringify({ id: record.id, tenantId: record.tenantId, scopes: record.scopes, keyHash: record.keyHash, keySalt: record.keySalt, createdBy: record.createdBy }),
    { expirationTtl: 3600 },
  )

  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, record.id))

  return { id: record.id, tenantId: record.tenantId, scopes: record.scopes as string[], createdBy: record.createdBy }
}

/** Revoke an API key */
export async function revokeApiKey(env: Env, keyId: string, tenantId: string) {
  const db = drizzle(env.DB)
  const result = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.tenantId, tenantId)))

  // Invalidate KV cache
  const record = await db.select({ keyPrefix: apiKeys.keyPrefix }).from(apiKeys).where(eq(apiKeys.id, keyId)).limit(1)
  if (record.length) {
    await env.KV.delete(`apikey:${record[0].keyPrefix}`)
  }

  return result
}

/** List active (non-revoked) API keys for a tenant (no secrets exposed) */
export async function listApiKeys(env: Env, tenantId: string) {
  const db = drizzle(env.DB)
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.tenantId, tenantId), isNull(apiKeys.revokedAt)))
}
