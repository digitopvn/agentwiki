/** AI routes — generate, transform, suggest, settings, usage */

import { Hono } from 'hono'
import { authGuard } from '../middleware/auth-guard'
import { requireAdmin } from '../middleware/require-permission'
import { rateLimiter } from '../middleware/rate-limiter'
import {
  aiGenerateSchema,
  aiTransformSchema,
  aiSuggestSchema,
  aiSettingsUpdateSchema,
  AI_RATE_LIMIT,
} from '@agentwiki/shared'
import * as aiService from '../ai/ai-service'
import type { Env } from '../env'
import type { AuthContext } from '@agentwiki/shared'

type AIEnv = { Bindings: Env; Variables: { auth: AuthContext } }

export const aiRouter = new Hono<AIEnv>()

// All AI routes require authentication
aiRouter.use('/*', authGuard)

// AI-specific rate limit for generation endpoints
const aiRateLimit = rateLimiter({ limit: AI_RATE_LIMIT.maxRequests, windowSec: AI_RATE_LIMIT.intervalMs / 1000 })

/** POST /api/ai/generate — slash command generation (SSE stream) */
aiRouter.post('/generate', aiRateLimit, async (c) => {
  const auth = c.get('auth')
  const body = aiGenerateSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid request', details: body.error.issues }, 400)

  try {
    const stream = await aiService.generate(c.env, auth.tenantId, auth.userId, body.data)
    return wrapSSE(stream)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI generation failed'
    return c.json({ error: message }, 500)
  }
})

/** POST /api/ai/transform — selection text transformation (SSE stream) */
aiRouter.post('/transform', aiRateLimit, async (c) => {
  const auth = c.get('auth')
  const body = aiTransformSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid request', details: body.error.issues }, 400)

  try {
    const stream = await aiService.transform(c.env, auth.tenantId, auth.userId, body.data)
    return wrapSSE(stream)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI transformation failed'
    return c.json({ error: message }, 500)
  }
})

/** POST /api/ai/suggest — RAG smart suggestions (JSON) */
aiRouter.post('/suggest', aiRateLimit, async (c) => {
  const auth = c.get('auth')
  const body = aiSuggestSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid request', details: body.error.issues }, 400)

  try {
    const suggestions = await aiService.suggest(c.env, auth.tenantId, auth.userId, body.data)
    return c.json({ suggestions })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI suggestion failed'
    return c.json({ error: message }, 500)
  }
})

/** GET /api/ai/settings — list provider configs (admin only) */
aiRouter.get('/settings', requireAdmin, async (c) => {
  const auth = c.get('auth')
  const settings = await aiService.getSettings(c.env, auth.tenantId)
  return c.json({ settings })
})

/** PUT /api/ai/settings — upsert provider config (admin only) */
aiRouter.put('/settings', requireAdmin, async (c) => {
  const auth = c.get('auth')
  const body = aiSettingsUpdateSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid request', details: body.error.issues }, 400)

  try {
    await aiService.upsertSetting(c.env, auth.tenantId, body.data)
    return c.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save settings'
    return c.json({ error: message }, 500)
  }
})

/** PATCH /api/ai/settings/order — reorder provider priorities (admin only) */
aiRouter.patch('/settings/order', requireAdmin, async (c) => {
  const auth = c.get('auth')
  const body = await c.req.json()

  // Validate order array structure
  if (!body?.order || !Array.isArray(body.order) || body.order.length === 0) {
    return c.json({ error: 'order array required' }, 400)
  }
  for (const item of body.order) {
    if (typeof item.providerId !== 'string' || !item.providerId) {
      return c.json({ error: 'Each order item must have a non-empty providerId string' }, 400)
    }
    if (typeof item.priority !== 'number' || !Number.isInteger(item.priority) || item.priority < 0) {
      return c.json({ error: 'Each order item must have a non-negative integer priority' }, 400)
    }
  }

  await aiService.updatePriorities(c.env, auth.tenantId, body.order)
  return c.json({ success: true })
})

/** DELETE /api/ai/settings/:providerId — remove provider config (admin only) */
aiRouter.delete('/settings/:providerId', requireAdmin, async (c) => {
  const auth = c.get('auth')
  const providerId = c.req.param('providerId')
  await aiService.deleteSetting(c.env, auth.tenantId, providerId)
  return c.json({ success: true })
})

/** GET /api/ai/usage — usage statistics (admin only) */
aiRouter.get('/usage', requireAdmin, async (c) => {
  const auth = c.get('auth')
  const usage = await aiService.getUsage(c.env, auth.tenantId)
  return c.json({ usage })
})

/** Wrap a ReadableStream as SSE response with proper headers */
function wrapSSE(stream: ReadableStream<Uint8Array>): Response {
  const encoder = new TextEncoder()
  const wrappedStream = stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
      },
      flush(controller) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      },
    }),
  )

  return new Response(wrappedStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
