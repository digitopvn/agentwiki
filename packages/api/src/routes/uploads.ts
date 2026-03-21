/** File upload routes — proxy through Worker to R2 */

import { Hono } from 'hono'
import { uploadFile, getFile, listUploads, deleteFile } from '../services/upload-service'
import { authGuard } from '../middleware/auth-guard'
import { optionalAuth } from '../middleware/auth-guard'
import { requirePermission } from '../middleware/require-permission'
import type { Env } from '../env'
import type { AuthContext } from '@agentwiki/shared'

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

type AuthEnv = { Bindings: Env; Variables: { auth: AuthContext } }

const uploadsRouter = new Hono<AuthEnv>()

// Upload file (multipart form data)
uploadsRouter.post('/', authGuard, requirePermission('doc:create'), async (c) => {
  const { tenantId, userId } = c.get('auth')
  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  const documentId = formData.get('documentId') as string | null

  if (!file) return c.json({ error: 'No file provided' }, 400)
  if (file.size > MAX_FILE_SIZE) return c.json({ error: 'File too large (max 100MB)' }, 400)

  const result = await uploadFile(
    c.env,
    tenantId,
    userId,
    file.name,
    file.type,
    await file.arrayBuffer(),
    documentId ?? undefined,
    c.executionCtx,
  )

  return c.json(result, 201)
})

// List uploads
uploadsRouter.get('/', authGuard, requirePermission('doc:read'), async (c) => {
  const { tenantId } = c.get('auth')
  const documentId = c.req.query('documentId')
  const files = await listUploads(c.env, tenantId, documentId)
  return c.json({ files })
})

// Delete upload
uploadsRouter.delete('/:id', authGuard, requirePermission('doc:delete'), async (c) => {
  const { tenantId } = c.get('auth')
  const ok = await deleteFile(c.env, c.req.param('id'), tenantId)
  if (!ok) return c.json({ error: 'File not found' }, 404)
  return c.json({ ok: true })
})

export { uploadsRouter }

// Separate router for serving files (supports auth, public, and download token access)
export const filesRouter = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>()

filesRouter.get('/*', optionalAuth, async (c) => {
  // Sanitize fileKey: strip path traversal attempts
  const rawKey = c.req.path.replace('/api/files/', '')
  const fileKey = rawKey.replace(/\.\./g, '').replace(/\/\//g, '/')
  const auth = c.get('auth') as AuthContext | undefined
  const tenantId = auth?.tenantId

  // Check for download token (used by VPS extraction service)
  const dlToken = c.req.query('dl_token')
  if (dlToken) {
    const storedKey = await c.env.KV.get(`dl:${dlToken}`)
    if (storedKey && storedKey === fileKey) {
      // Delete token BEFORE serving to prevent TOCTOU race (one-time use)
      await c.env.KV.delete(`dl:${dlToken}`)
      const object = await c.env.R2.get(fileKey)
      if (!object) return c.json({ error: 'File not found' }, 404)
      return new Response(object.body, {
        headers: {
          'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
          'Content-Disposition': 'attachment',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
        },
      })
    }
    return c.json({ error: 'Invalid or expired download token' }, 403)
  }

  // For authenticated users, verify tenant access
  if (tenantId) {
    const file = await getFile(c.env, fileKey, tenantId)
    if (!file) return c.json({ error: 'File not found' }, 404)

    // Serve images inline, everything else as attachment to prevent stored XSS
    const isImage = file.contentType.startsWith('image/')
    const disposition = isImage ? 'inline' : 'attachment'

    return new Response(file.body, {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': disposition,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  }

  // No auth and no download token — reject (prevent unauthenticated file access)
  return c.json({ error: 'Authentication required' }, 401)
})
