/** Import routes — upload ZIP, trigger Lark import, SSE progress, history */

import { Hono } from 'hono'
import { eq, and, desc } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { importJobs } from '../db/schema'
import { authGuard } from '../middleware/auth-guard'
import { requirePermission } from '../middleware/require-permission'
import { generateId } from '../utils/crypto'
import { logAudit } from '../utils/audit'
import { startImportSchema, startLarkImportSchema } from '@agentwiki/shared'
import type { Env } from '../env'

export const importRouter = new Hono<{ Bindings: Env }>()

/** Max concurrent import jobs per tenant */
const MAX_CONCURRENT_IMPORTS = 3

/** Check if tenant has too many in-flight import jobs */
async function checkConcurrentLimit(env: Env, tenantId: string): Promise<boolean> {
  const db = drizzle(env.DB)
  const active = await db.select({ id: importJobs.id })
    .from(importJobs)
    .where(and(
      eq(importJobs.tenantId, tenantId),
      eq(importJobs.status, 'processing'),
    ))
    .limit(MAX_CONCURRENT_IMPORTS + 1)
  return active.length >= MAX_CONCURRENT_IMPORTS
}

/** Upload ZIP and start Obsidian/Notion import */
importRouter.post('/', authGuard, requirePermission('doc:create'), async (c) => {
  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  const source = formData.get('source') as string
  const targetFolderId = (formData.get('targetFolderId') as string) || null

  if (!file) return c.json({ error: 'File required' }, 400)

  // Validate source using shared schema
  const parsed = startImportSchema.safeParse({ source, targetFolderId })
  if (!parsed.success) return c.json({ error: 'Source must be obsidian or notion' }, 400)

  if (file.size > 50 * 1024 * 1024) return c.json({ error: 'Max file size is 50MB' }, 400)
  if (!file.name.endsWith('.zip')) return c.json({ error: 'ZIP file required' }, 400)

  const { tenantId, userId } = c.get('auth')

  // Rate limit: prevent too many concurrent import jobs
  if (await checkConcurrentLimit(c.env, tenantId)) {
    return c.json({ error: `Max ${MAX_CONCURRENT_IMPORTS} concurrent imports allowed. Please wait for current imports to finish.` }, 429)
  }

  const jobId = generateId()
  const safeName = file.name.replace(/[^\w.\-]/g, '_')
  const fileKey = `${tenantId}/imports/${jobId}/${safeName}`

  // Upload ZIP to R2 temp storage
  await c.env.R2.put(fileKey, await file.arrayBuffer(), {
    customMetadata: { tenantId, uploadedBy: userId },
  })

  // Create import job record
  const db = drizzle(c.env.DB)
  await db.insert(importJobs).values({
    id: jobId,
    tenantId,
    userId,
    source,
    status: 'pending',
    targetFolderId,
    fileKey,
    createdAt: new Date(),
  })

  // Enqueue processing job
  await c.env.QUEUE.send({ type: 'import-job', jobId, tenantId })

  logAudit(c as never, 'import.start', 'import_job', jobId)
  return c.json({ jobId, status: 'pending' }, 201)
})

/** Start Lark API-based import */
importRouter.post('/lark', authGuard, requirePermission('doc:create'), async (c) => {
  const body = startLarkImportSchema.parse(await c.req.json())
  const { tenantId, userId } = c.get('auth')

  // Rate limit: prevent too many concurrent import jobs
  if (await checkConcurrentLimit(c.env, tenantId)) {
    return c.json({ error: `Max ${MAX_CONCURRENT_IMPORTS} concurrent imports allowed. Please wait for current imports to finish.` }, 429)
  }

  const jobId = generateId()

  const db = drizzle(c.env.DB)
  await db.insert(importJobs).values({
    id: jobId,
    tenantId,
    userId,
    source: 'lark',
    status: 'pending',
    targetFolderId: body.targetFolderId ?? null,
    larkConfig: { token: body.token, spaceId: body.spaceId },
    createdAt: new Date(),
  })

  await c.env.QUEUE.send({ type: 'import-job', jobId, tenantId })

  logAudit(c as never, 'import.start', 'import_job', jobId)
  return c.json({ jobId, status: 'pending' }, 201)
})

/** SSE progress stream for an import job */
importRouter.get('/:id/progress', authGuard, async (c) => {
  const { tenantId } = c.get('auth')
  const jobId = c.req.param('id')

  // Verify job belongs to tenant
  const db = drizzle(c.env.DB)
  const job = await db.select({ id: importJobs.id })
    .from(importJobs)
    .where(and(eq(importJobs.id, jobId), eq(importJobs.tenantId, tenantId)))
    .limit(1)
  if (!job.length) return c.json({ error: 'Import job not found' }, 404)

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let lastSeq = 0
      let closed = false

      const send = (data: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        } catch {
          closed = true
        }
      }

      // Poll KV for progress every 500ms, using sequence counter to detect new events
      const poll = async () => {
        if (closed) return
        try {
          const progress = await c.env.KV.get(`import:${jobId}`)
          if (progress) {
            const parsed = JSON.parse(progress)
            const seq = parsed.seq ?? 0
            if (seq > lastSeq) {
              lastSeq = seq
              send(progress)

              if (parsed.type === 'complete' || parsed.type === 'error') {
                closed = true
                controller.close()
                return
              }
            }
          }
        } catch {
          closed = true
          controller.close()
          return
        }

        if (!closed) setTimeout(poll, 500)
      }

      // Start polling
      poll()

      // Timeout after 15 minutes
      setTimeout(() => {
        if (!closed) {
          closed = true
          controller.close()
        }
      }, 15 * 60 * 1000)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
})

/** Max processing time before a job is considered stuck (30 minutes) */
const STUCK_JOB_TIMEOUT_MS = 30 * 60 * 1000

/** Get import job status — auto-marks stuck jobs as failed */
importRouter.get('/:id', authGuard, async (c) => {
  const { tenantId } = c.get('auth')
  const jobId = c.req.param('id')

  const db = drizzle(c.env.DB)
  const job = await db.select()
    .from(importJobs)
    .where(and(eq(importJobs.id, jobId), eq(importJobs.tenantId, tenantId)))
    .limit(1)

  if (!job.length) return c.json({ error: 'Import job not found' }, 404)

  // Auto-recover stuck jobs: if processing for > 30 min, mark as failed
  const record = job[0]
  const processingStart = record.startedAt ?? record.createdAt
  if (record.status === 'processing' && processingStart) {
    const elapsed = Date.now() - new Date(processingStart).getTime()
    if (elapsed > STUCK_JOB_TIMEOUT_MS) {
      await db.update(importJobs).set({
        status: 'failed',
        errors: [{ path: '', message: 'Import job timed out after 30 minutes' }],
        errorCount: 1,
        larkConfig: null,
        completedAt: new Date(),
      }).where(eq(importJobs.id, jobId))
      record.status = 'failed'
    }
  }

  // Strip sensitive larkConfig from response
  const { larkConfig: _, ...safe } = record
  return c.json(safe)
})

/** List import history — filtered to current user's imports */
importRouter.get('/', authGuard, async (c) => {
  const { tenantId, userId } = c.get('auth')
  const db = drizzle(c.env.DB)

  const jobs = await db.select({
    id: importJobs.id,
    source: importJobs.source,
    status: importJobs.status,
    totalDocs: importJobs.totalDocs,
    processedDocs: importJobs.processedDocs,
    totalAttachments: importJobs.totalAttachments,
    processedAttachments: importJobs.processedAttachments,
    errorCount: importJobs.errorCount,
    createdAt: importJobs.createdAt,
    completedAt: importJobs.completedAt,
  })
    .from(importJobs)
    .where(and(eq(importJobs.tenantId, tenantId), eq(importJobs.userId, userId)))
    .orderBy(desc(importJobs.createdAt))
    .limit(20)

  return c.json(jobs)
})
