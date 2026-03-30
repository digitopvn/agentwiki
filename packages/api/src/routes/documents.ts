/** Document CRUD routes */

import { Hono } from 'hono'
import { createDocumentSchema, updateDocumentSchema } from '@agentwiki/shared'
import {
  createDocument,
  getDocument,
  getDocumentBySlug,
  listDocuments,
  updateDocument,
  deleteDocument,
  getVersionHistory,
  getDocumentLinks,
  createVersionCheckpoint,
} from '../services/document-service'
import { authGuard } from '../middleware/auth-guard'
import { requirePermission } from '../middleware/require-permission'
import { parsePagination, paginate } from '../utils/pagination'
import { logAudit } from '../utils/audit'
import type { Env } from '../env'
import type { AuthContext } from '@agentwiki/shared'

type AuthEnv = { Bindings: Env; Variables: { auth: AuthContext } }

const docs = new Hono<AuthEnv>()
docs.use('*', authGuard)

// Create document
docs.post('/', requirePermission('doc:create'), async (c) => {
  const body = createDocumentSchema.parse(await c.req.json())
  const { tenantId, userId } = c.get('auth')

  const result = await createDocument(c.env, tenantId, userId, body)
  logAudit(c as never, 'doc.create', 'document', result.id)

  return c.json(result, 201)
})

// List documents (paginated + filterable)
docs.get('/', requirePermission('doc:read'), async (c) => {
  const { tenantId } = c.get('auth')
  const params = parsePagination(c.req.query())
  const filters = {
    folderId: c.req.query('folderId'),
    category: c.req.query('category'),
    tag: c.req.query('tag'),
    search: c.req.query('search'),
    sort: c.req.query('sort'),
    order: c.req.query('order'),
  }

  const { data, total } = await listDocuments(c.env, tenantId, params, filters)
  return c.json(paginate(data, total, params))
})

// Get document by slug
docs.get('/by-slug/:slug', requirePermission('doc:read'), async (c) => {
  const { tenantId } = c.get('auth')
  const doc = await getDocumentBySlug(c.env, tenantId, c.req.param('slug'))
  if (!doc) return c.json({ error: 'Document not found' }, 404)
  return c.json(doc)
})

// Get single document
docs.get('/:id', requirePermission('doc:read'), async (c) => {
  const { tenantId } = c.get('auth')
  const doc = await getDocument(c.env, tenantId, c.req.param('id'))
  if (!doc) return c.json({ error: 'Document not found' }, 404)
  return c.json(doc)
})

// Update document
docs.put('/:id', requirePermission('doc:update'), async (c) => {
  const body = updateDocumentSchema.parse(await c.req.json())
  const { tenantId, userId } = c.get('auth')

  const result = await updateDocument(c.env, tenantId, c.req.param('id'), userId, body)
  if (!result) return c.json({ error: 'Document not found' }, 404)

  logAudit(c as never, 'doc.update', 'document', c.req.param('id'))
  return c.json(result)
})

// Soft-delete document
docs.delete('/:id', requirePermission('doc:delete'), async (c) => {
  const { tenantId } = c.get('auth')
  await deleteDocument(c.env, tenantId, c.req.param('id'))
  logAudit(c as never, 'doc.delete', 'document', c.req.param('id'))
  return c.json({ ok: true })
})

// Version history
docs.get('/:id/versions', requirePermission('doc:read'), async (c) => {
  const versions = await getVersionHistory(c.env, c.req.param('id'))
  return c.json({ versions })
})

// Force create a version checkpoint
docs.post('/:id/versions', requirePermission('doc:update'), async (c) => {
  const { tenantId, userId } = c.get('auth')
  const result = await createVersionCheckpoint(c.env, tenantId, c.req.param('id'), userId)
  if (!result) return c.json({ error: 'Document not found' }, 404)
  return c.json(result, 201)
})

// Document links (forward + backlinks)
docs.get('/:id/links', requirePermission('doc:read'), async (c) => {
  const links = await getDocumentLinks(c.env, c.req.param('id'))
  return c.json(links)
})

export { docs as documentRoutes }
