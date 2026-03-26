/** Storage configuration service — CRUD for custom R2 credentials */

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { storageSettings } from '../db/schema'
import { encrypt, decrypt } from '../utils/encryption'
import { generateId } from '../utils/crypto'
import type { Env } from '../env'

export interface StorageConfig {
  id: string
  accountId: string
  bucketName: string
  endpointUrl: string | null
  isVerified: boolean
  hasAccessKey: boolean
  hasSecretKey: boolean
}

/** Get storage config for a tenant (keys masked) */
export async function getStorageConfig(env: Env, tenantId: string): Promise<StorageConfig | null> {
  const db = drizzle(env.DB)
  const rows = await db.select().from(storageSettings).where(eq(storageSettings.tenantId, tenantId)).limit(1)
  if (!rows.length) return null
  const r = rows[0]
  return {
    id: r.id,
    accountId: r.accountId,
    bucketName: r.bucketName,
    endpointUrl: r.endpointUrl,
    isVerified: r.isVerified,
    hasAccessKey: !!r.encryptedAccessKey,
    hasSecretKey: !!r.encryptedSecretKey,
  }
}

/** Upsert storage configuration (encrypts credentials).
 *  Pass existingId to skip the extra DB lookup when the caller already checked. */
export async function upsertStorageConfig(
  env: Env,
  tenantId: string,
  data: { accountId: string; accessKey: string; secretKey: string; bucketName: string; endpointUrl?: string | null },
  existingId?: string | null,
) {
  const db = drizzle(env.DB)
  const now = new Date()

  // Reuse caller's knowledge when available, otherwise query
  const existing = existingId !== undefined
    ? (existingId ? [{ id: existingId }] : [])
    : await db.select({ id: storageSettings.id }).from(storageSettings).where(eq(storageSettings.tenantId, tenantId)).limit(1)

  if (existing.length) {
    const updateData: Record<string, unknown> = {
      accountId: data.accountId,
      bucketName: data.bucketName,
      endpointUrl: data.endpointUrl ?? null,
      isVerified: false,
      updatedAt: now,
    }
    if (data.accessKey !== '__unchanged__') {
      updateData.encryptedAccessKey = await encrypt(data.accessKey, env.AI_ENCRYPTION_KEY)
    }
    if (data.secretKey !== '__unchanged__') {
      updateData.encryptedSecretKey = await encrypt(data.secretKey, env.AI_ENCRYPTION_KEY)
    }
    await db.update(storageSettings).set(updateData).where(eq(storageSettings.id, existing[0].id))
  } else {
    const encAccessKey = await encrypt(data.accessKey, env.AI_ENCRYPTION_KEY)
    const encSecretKey = await encrypt(data.secretKey, env.AI_ENCRYPTION_KEY)
    await db.insert(storageSettings).values({
      id: generateId(),
      tenantId,
      accountId: data.accountId,
      encryptedAccessKey: encAccessKey,
      encryptedSecretKey: encSecretKey,
      bucketName: data.bucketName,
      endpointUrl: data.endpointUrl ?? null,
      isVerified: false,
      createdAt: now,
      updatedAt: now,
    })
  }
}

/** Delete storage config (revert to default R2 binding) */
export async function deleteStorageConfig(env: Env, tenantId: string) {
  const db = drizzle(env.DB)
  await db.delete(storageSettings).where(eq(storageSettings.tenantId, tenantId))
}

/** Test R2 connection using S3-compatible API */
export async function testStorageConnection(
  env: Env,
  tenantId: string,
): Promise<{ success: boolean; error?: string }> {
  const db = drizzle(env.DB)
  const rows = await db.select().from(storageSettings).where(eq(storageSettings.tenantId, tenantId)).limit(1)
  if (!rows.length) return { success: false, error: 'No storage configuration found' }

  const config = rows[0]
  const accessKey = await decrypt(config.encryptedAccessKey, env.AI_ENCRYPTION_KEY)
  const secretKey = await decrypt(config.encryptedSecretKey, env.AI_ENCRYPTION_KEY)

  try {
    // S3-compatible ListObjectsV2 request with AWS Signature V4 via aws4fetch
    const { AwsClient } = await import('aws4fetch')
    const aws = new AwsClient({ accessKeyId: accessKey, secretAccessKey: secretKey })
    const endpoint = config.endpointUrl ?? `https://${config.accountId}.r2.cloudflarestorage.com`

    // Use list-type=2&max-keys=1 as a lightweight connectivity check
    const response = await aws.fetch(`${endpoint}/${config.bucketName}?list-type=2&max-keys=1`, {
      method: 'GET',
    })

    if (response.ok) {
      await db
        .update(storageSettings)
        .set({ isVerified: true, updatedAt: new Date() })
        .where(eq(storageSettings.id, config.id))
      return { success: true }
    }
    return { success: false, error: `Connection failed: ${response.status} ${response.statusText}` }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Connection failed' }
  }
}
