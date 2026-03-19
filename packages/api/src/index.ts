import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { authRoutes } from './routes/auth'
import { apiKeysRouter } from './routes/api-keys'
import { documentRoutes } from './routes/documents'
import { foldersRouter } from './routes/folders'
import { memberRoutes } from './routes/members'
import { tagsRouter } from './routes/tags'
import { uploadsRouter, filesRouter } from './routes/uploads'
import { searchRouter } from './routes/search'
import { shareRouter } from './routes/share'
import { graphRouter } from './routes/graph'
import { aiRouter } from './routes/ai'
import { rateLimiter } from './middleware/rate-limiter'
import { handleQueueBatch } from './queue/handler'
import { RATE_LIMITS } from '@agentwiki/shared'
import type { Env } from './env'

const app = new Hono<{ Bindings: Env }>()

// Global middleware
app.use('*', logger())
app.use(
  '*',
  cors({
    origin: ['http://localhost:5173', 'https://agentwiki.cc'],
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
)

// Rate limiting on API routes
app.use('/api/*', rateLimiter(RATE_LIMITS.api))

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }))

// Public routes
app.route('/api/auth', authRoutes)
app.route('/api/files', filesRouter)

// Authenticated routes
app.route('/api/keys', apiKeysRouter)
app.route('/api/documents', documentRoutes)
app.route('/api/folders', foldersRouter)
app.route('/api/members', memberRoutes)
app.route('/api/tags', tagsRouter)
app.route('/api/uploads', uploadsRouter)
app.route('/api/search', searchRouter)
app.route('/api/share', shareRouter)
app.route('/api/graph', graphRouter)
app.route('/api/ai', aiRouter)

// Security headers
app.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('X-XSS-Protection', '1; mode=block')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
})

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json({ error: 'Internal server error' }, 500)
})

app.notFound((c) => c.json({ error: 'Not found' }, 404))

// Export for Cloudflare Workers
export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<unknown>, env: Env) {
    await handleQueueBatch(batch as MessageBatch<never>, env)
  },
}
