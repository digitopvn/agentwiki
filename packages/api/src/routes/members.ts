/** Member management routes — list, update role, remove */

import { Hono } from 'hono'
import { authGuard } from '../middleware/auth-guard'
import { requirePermission } from '../middleware/require-permission'
import { listMembers, updateMemberRole, removeMember } from '../services/member-service'
import type { Env } from '../env'
import type { AuthContext } from '@agentwiki/shared'

type AuthEnv = { Bindings: Env; Variables: { auth: AuthContext } }

const memberRoutes = new Hono<AuthEnv>()
memberRoutes.use('*', authGuard)

// List all members in the tenant
memberRoutes.get('/', requirePermission('tenant:manage'), async (c) => {
  const { tenantId } = c.get('auth')
  const members = await listMembers(c.env, tenantId)
  return c.json({ members })
})

// Update a member's role
memberRoutes.patch('/:id', requirePermission('tenant:manage'), async (c) => {
  const { tenantId } = c.get('auth')
  const membershipId = c.req.param('id')
  const body = await c.req.json() as { role?: string }

  if (!body.role) return c.json({ error: 'role is required' }, 400)

  // Verify membership belongs to this tenant before mutating
  const members = await listMembers(c.env, tenantId)
  const match = members.find((m) => m.id === membershipId)
  if (!match) return c.json({ error: 'Member not found' }, 404)

  const updated = await updateMemberRole(c.env, membershipId, body.role)
  return c.json({ member: updated })
})

// Remove a member from the tenant
memberRoutes.delete('/:id', requirePermission('tenant:manage'), async (c) => {
  const { tenantId } = c.get('auth')
  const membershipId = c.req.param('id')

  // Verify membership belongs to this tenant before deleting
  const members = await listMembers(c.env, tenantId)
  const match = members.find((m) => m.id === membershipId)
  if (!match) return c.json({ error: 'Member not found' }, 404)

  await removeMember(c.env, membershipId)
  return c.json({ ok: true })
})

export { memberRoutes }
