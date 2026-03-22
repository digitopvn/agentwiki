/** Internal API routes — called by VPS extraction service and admin, not exposed to public */

import { Hono } from 'hono'
import { z } from 'zod'
import { eq, and, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { uploads } from '../db/schema'
import { internalAuth } from '../middleware/internal-auth'
import { handleExtractionResult } from '../services/extraction-service'
import { dispatchExtractionJob } from '../services/extraction-job-dispatcher'
import type { Env } from '../env'

const internalRouter = new Hono<{ Bindings: Env }>()

internalRouter.use('*', internalAuth)

const extractionResultSchema = z.object({
  uploadId: z.string().min(1),
  tenantId: z.string().min(1),
  extractedText: z.string().max(5_000_000), // 5MB text max to protect D1
  extractionMethod: z.enum(['docling', 'gemini', 'direct', 'unsupported']),
  error: z.string().max(2000).optional(),
})

/** Receive extraction result from VPS extraction service */
internalRouter.post('/extraction-result', async (c) => {
  const body = await c.req.json()
  const parsed = extractionResultSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400)
  }

  try {
    const result = await handleExtractionResult(c.env, parsed.data)
    return c.json(result)
  } catch (err) {
    console.error('Extraction result handling failed:', err)
    return c.json({ error: (err as Error).message }, 500)
  }
})

/** Get extraction pipeline status summary (counts by status) */
internalRouter.get('/extraction-status', async (c) => {
  const db = drizzle(c.env.DB)
  const rows = await db
    .select({
      status: uploads.extractionStatus,
      count: sql<number>`COUNT(*)`,
    })
    .from(uploads)
    .groupBy(uploads.extractionStatus)

  const counts: Record<string, number> = {}
  for (const row of rows) {
    counts[row.status ?? 'null'] = row.count
  }
  return c.json({ counts })
})

/** Manually retry extraction for a specific upload */
internalRouter.post('/extraction-retry/:id', async (c) => {
  const uploadId = c.req.param('id')
  const db = drizzle(c.env.DB)
  const upload = await db
    .select({
      id: uploads.id,
      tenantId: uploads.tenantId,
      fileKey: uploads.fileKey,
      contentType: uploads.contentType,
      filename: uploads.filename,
      extractionStatus: uploads.extractionStatus,
    })
    .from(uploads)
    .where(eq(uploads.id, uploadId))
    .limit(1)

  if (!upload.length) return c.json({ error: 'Upload not found' }, 404)

  // Reset status and re-dispatch
  await db.update(uploads).set({ extractionStatus: 'pending' }).where(eq(uploads.id, uploadId))
  await dispatchExtractionJob(c.env, upload[0])

  return c.json({ ok: true, status: 're-dispatched' })
})

export { internalRouter }
