/** Share + publish routes */

import { Hono } from 'hono'
import { createShareLink, getDocumentByShareToken, listShareLinks, deleteShareLink } from '../services/share-service'
import { publishDocument } from '../services/publish-service'
import { authGuard } from '../middleware/auth-guard'
import { requirePermission } from '../middleware/require-permission'
import { logAudit } from '../utils/audit'
import type { Env } from '../env'
import type { AuthContext } from '@agentwiki/shared'

type AuthEnv = { Bindings: Env; Variables: { auth: AuthContext } }

const shareRouter = new Hono<AuthEnv>()

// --- Public: get shared document (no auth) ---

shareRouter.get('/public/:token', async (c) => {
  const result = await getDocumentByShareToken(c.env, c.req.param('token'))
  if (!result) return c.json({ error: 'Share link not found or expired' }, 404)
  return c.json(result)
})

// --- Authenticated: manage shares ---

shareRouter.post('/links', authGuard, requirePermission('doc:share'), async (c) => {
  const { userId } = c.get('auth')
  const body = await c.req.json() as { documentId: string; expiresInDays?: number }

  if (!body.documentId) return c.json({ error: 'documentId required' }, 400)

  const result = await createShareLink(c.env, body.documentId, userId, body.expiresInDays)
  logAudit(c as never, 'share.create', 'document', body.documentId)

  return c.json(result, 201)
})

shareRouter.get('/links/:documentId', authGuard, requirePermission('doc:read'), async (c) => {
  const links = await listShareLinks(c.env, c.req.param('documentId'))
  return c.json({ links })
})

shareRouter.delete('/links/:id', authGuard, requirePermission('doc:share'), async (c) => {
  await deleteShareLink(c.env, c.req.param('id'))
  return c.json({ ok: true })
})

// --- Publish ---

shareRouter.post('/publish/:documentId', authGuard, requirePermission('doc:update'), async (c) => {
  const { tenantId } = c.get('auth')
  const result = await publishDocument(c.env, c.req.param('documentId'), tenantId)
  if (!result) return c.json({ error: 'Document not found' }, 404)

  logAudit(c as never, 'doc.publish', 'document', c.req.param('documentId'))
  return c.json(result)
})

export { shareRouter }
