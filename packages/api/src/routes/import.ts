/** Import routes — upload ZIP, trigger Lark import, SSE progress, history */

import { Hono } from 'hono'
import { eq, and, desc } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { importJobs } from '../db/schema'
import { authGuard } from '../middleware/auth-guard'
import { requirePermission } from '../middleware/require-permission'
import { generateId } from '../utils/crypto'
import { logAudit } from '../utils/audit'
import { startLarkImportSchema } from '@agentwiki/shared'
import type { Env } from '../env'

export const importRouter = new Hono<{ Bindings: Env }>()

/** Upload ZIP and start Obsidian/Notion import */
importRouter.post('/', authGuard, requirePermission('doc:create'), async (c) => {
  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  const source = formData.get('source') as string
  const targetFolderId = (formData.get('targetFolderId') as string) || null

  if (!file) return c.json({ error: 'File required' }, 400)
  if (!['obsidian', 'notion'].includes(source)) return c.json({ error: 'Source must be obsidian or notion' }, 400)
  if (file.size > 100 * 1024 * 1024) return c.json({ error: 'Max file size is 100MB' }, 400)
  if (!file.name.endsWith('.zip')) return c.json({ error: 'ZIP file required' }, 400)

  const { tenantId, userId } = c.get('auth')
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
      let lastEvent = ''
      let closed = false

      const send = (data: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        } catch {
          closed = true
        }
      }

      // Poll KV for progress every 500ms
      const poll = async () => {
        if (closed) return
        try {
          const progress = await c.env.KV.get(`import:${jobId}`)
          if (progress && progress !== lastEvent) {
            lastEvent = progress
            send(progress)

            const parsed = JSON.parse(progress)
            if (parsed.type === 'complete' || parsed.type === 'error') {
              closed = true
              controller.close()
              return
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

/** Get import job status */
importRouter.get('/:id', authGuard, async (c) => {
  const { tenantId } = c.get('auth')
  const jobId = c.req.param('id')

  const db = drizzle(c.env.DB)
  const job = await db.select()
    .from(importJobs)
    .where(and(eq(importJobs.id, jobId), eq(importJobs.tenantId, tenantId)))
    .limit(1)

  if (!job.length) return c.json({ error: 'Import job not found' }, 404)

  // Strip sensitive larkConfig from response
  const { larkConfig: _, ...safe } = job[0]
  return c.json(safe)
})

/** List import history */
importRouter.get('/', authGuard, async (c) => {
  const { tenantId } = c.get('auth')
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
    .where(eq(importJobs.tenantId, tenantId))
    .orderBy(desc(importJobs.createdAt))
    .limit(20)

  return c.json(jobs)
})
