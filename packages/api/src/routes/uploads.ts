/** File upload routes — proxy through Worker to R2 */

import { Hono } from 'hono'
import { uploadFile, getFile, listUploads, deleteFile } from '../services/upload-service'
import { authGuard } from '../middleware/auth-guard'
import { optionalAuth } from '../middleware/auth-guard'
import { requirePermission } from '../middleware/require-permission'
import type { Env } from '../env'
import type { AuthContext } from '@agentwiki/shared'

type AuthEnv = { Bindings: Env; Variables: { auth: AuthContext } }

const uploadsRouter = new Hono<AuthEnv>()

// Upload file (multipart form data)
uploadsRouter.post('/', authGuard, requirePermission('doc:create'), async (c) => {
  const { tenantId, userId } = c.get('auth')
  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  const documentId = formData.get('documentId') as string | null

  if (!file) return c.json({ error: 'No file provided' }, 400)
  if (file.size > 10 * 1024 * 1024) return c.json({ error: 'File too large (max 10MB)' }, 400)

  const result = await uploadFile(
    c.env,
    tenantId,
    userId,
    file.name,
    file.type,
    await file.arrayBuffer(),
    documentId ?? undefined,
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

// Separate router for serving files (can be used with optional auth for shared docs)
export const filesRouter = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>()

filesRouter.get('/*', optionalAuth, async (c) => {
  const fileKey = c.req.path.replace('/api/files/', '')
  const auth = c.get('auth') as AuthContext | undefined
  const tenantId = auth?.tenantId

  // For authenticated users, verify tenant access
  if (tenantId) {
    const file = await getFile(c.env, fileKey, tenantId)
    if (!file) return c.json({ error: 'File not found' }, 404)

    return new Response(file.body, {
      headers: {
        'Content-Type': file.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  }

  // Public files: check if file key is for a public document
  // For now, serve if the file exists (share links will handle auth separately)
  const object = await c.env.R2.get(fileKey)
  if (!object) return c.json({ error: 'File not found' }, 404)

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
})
