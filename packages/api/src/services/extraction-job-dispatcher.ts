/** Dispatch extraction jobs to VPS extraction service via HTTP POST */

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { uploads } from '../db/schema'
import { generateRandomToken } from '../utils/crypto'
import { EXTRACTABLE_CONTENT_TYPES } from '@agentwiki/shared'
import type { Env } from '../env'

/** Dispatch an extraction job to the VPS service. Fire-and-forget via waitUntil. */
export async function dispatchExtractionJob(env: Env, upload: {
  id: string
  tenantId: string
  fileKey: string
  contentType: string
  filename: string
}) {
  const db = drizzle(env.DB)

  // Check if content type is extractable
  if (!EXTRACTABLE_CONTENT_TYPES.has(upload.contentType)) {
    await db.update(uploads).set({ extractionStatus: 'unsupported' }).where(eq(uploads.id, upload.id))
    return
  }

  // Generate a short-lived download token (15 min TTL) stored in KV
  const downloadToken = generateRandomToken(32)
  await env.KV.put(`dl:${downloadToken}`, upload.fileKey, { expirationTtl: 900 })

  // Build file download URL using internal token
  if (!env.API_URL) throw new Error('API_URL env var is required for extraction job dispatch')
  const fileUrl = `${env.API_URL}/api/files/${upload.fileKey}?dl_token=${downloadToken}`

  // POST job to VPS extraction service
  try {
    const response = await fetch(`${env.EXTRACTION_SERVICE_URL}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': env.EXTRACTION_INTERNAL_SECRET,
      },
      body: JSON.stringify({
        upload_id: upload.id,
        tenant_id: upload.tenantId,
        file_url: fileUrl,
        content_type: upload.contentType,
        filename: upload.filename,
      }),
    })

    if (response.ok) {
      await db.update(uploads).set({ extractionStatus: 'processing' }).where(eq(uploads.id, upload.id))
    } else {
      console.error(`Failed to dispatch extraction job: ${response.status} ${response.statusText}`)
      // Keep status=pending for retry later
    }
  } catch (err) {
    console.error('Extraction service unreachable:', err)
    // Keep status=pending for retry later
  }
}
