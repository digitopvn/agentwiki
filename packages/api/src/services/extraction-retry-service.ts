/** Retry stuck extraction jobs — called by cron trigger every 5 minutes */

import { eq, and, lt, or, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { uploads } from '../db/schema'
import { dispatchExtractionJob } from './extraction-job-dispatcher'
import type { Env } from '../env'

const PENDING_TIMEOUT_MS = 15 * 60 * 1000  // 15 min: pending too long
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000 // 10 min: processing stuck
const MAX_RETRY_AGE_MS = 2 * 60 * 60 * 1000 // 2 hours: stop retrying after this

/** Find and retry stuck extraction jobs. Marks as failed after 2 hours. */
export async function retryStuckExtractions(env: Env) {
  const db = drizzle(env.DB)
  const now = Date.now()
  const pendingCutoff = new Date(now - PENDING_TIMEOUT_MS)
  const processingCutoff = new Date(now - PROCESSING_TIMEOUT_MS)
  const maxRetryCutoff = new Date(now - MAX_RETRY_AGE_MS)

  // Mark uploads older than 2 hours as permanently failed (prevent infinite retry)
  // Use lastDispatchedAt if set, otherwise fall back to createdAt
  await db.update(uploads).set({ extractionStatus: 'failed' }).where(
    and(
      or(
        eq(uploads.extractionStatus, 'pending'),
        eq(uploads.extractionStatus, 'processing'),
      ),
      lt(uploads.createdAt, maxRetryCutoff),
    ),
  )

  // Find uploads stuck in pending — use lastDispatchedAt (set by dispatchExtractionJob) to avoid
  // re-dispatching recently dispatched jobs. Fall back to createdAt for uploads never dispatched.
  const stuckPending = await db
    .select({
      id: uploads.id,
      tenantId: uploads.tenantId,
      fileKey: uploads.fileKey,
      contentType: uploads.contentType,
      filename: uploads.filename,
    })
    .from(uploads)
    .where(
      and(
        eq(uploads.extractionStatus, 'pending'),
        sql`COALESCE(${uploads.lastDispatchedAt}, ${uploads.createdAt}) < ${pendingCutoff.getTime()}`,
      ),
    )
    .limit(10)

  // Find uploads stuck in processing — use lastDispatchedAt for accurate timeout
  const stuckProcessing = await db
    .select({
      id: uploads.id,
      tenantId: uploads.tenantId,
      fileKey: uploads.fileKey,
      contentType: uploads.contentType,
      filename: uploads.filename,
    })
    .from(uploads)
    .where(
      and(
        eq(uploads.extractionStatus, 'processing'),
        sql`COALESCE(${uploads.lastDispatchedAt}, ${uploads.createdAt}) < ${processingCutoff.getTime()}`,
      ),
    )
    .limit(10)

  const stuckUploads = [...stuckPending, ...stuckProcessing]
  if (!stuckUploads.length) return { retried: 0 }

  let retried = 0
  for (const upload of stuckUploads) {
    try {
      await dispatchExtractionJob(env, upload)
      retried++
    } catch (err) {
      console.error(`Retry failed for upload ${upload.id}:`, err)
    }
  }

  console.log(`Extraction retry: ${retried}/${stuckUploads.length} jobs re-dispatched`)
  return { retried, total: stuckUploads.length }
}
