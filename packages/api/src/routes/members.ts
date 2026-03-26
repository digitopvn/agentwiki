/** Member management routes — list, invite, update role, remove */

import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { authGuard } from '../middleware/auth-guard'
import { requirePermission } from '../middleware/require-permission'
import { listMembers, updateMemberRole, removeMember } from '../services/member-service'
import { users, tenantMemberships } from '../db/schema'
import { generateId } from '../utils/crypto'
import { inviteUserSchema, updateMemberRoleSchema } from '@agentwiki/shared'
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

// Invite a user by email to the tenant
memberRoutes.post('/invite', requirePermission('tenant:manage'), async (c) => {
  const auth = c.get('auth')
  const { tenantId } = auth
  const body = inviteUserSchema.parse(await c.req.json())
  const db = drizzle(c.env.DB)

  // Look up user by email
  const userRows = await db.select().from(users).where(eq(users.email, body.email)).limit(1)
  if (!userRows.length) {
    return c.json({ error: 'User not found. They must sign up first.' }, 404)
  }
  const user = userRows[0]

  // Check existing membership
  const existing = await db
    .select()
    .from(tenantMemberships)
    .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.userId, user.id)))
    .limit(1)
  if (existing.length) {
    return c.json({ error: 'User is already a member of this workspace' }, 409)
  }

  // Create membership
  const id = generateId()
  await db.insert(tenantMemberships).values({
    id,
    tenantId,
    userId: user.id,
    role: body.role,
    invitedBy: auth.userId,
    joinedAt: new Date(),
  })

  // Return member data joined with user info
  const member = {
    id,
    userId: user.id,
    role: body.role,
    joinedAt: new Date().toISOString(),
    userName: user.name,
    userEmail: user.email,
    userAvatar: user.avatarUrl,
  }
  return c.json({ member }, 201)
})

// Update a member's role
memberRoutes.patch('/:id', requirePermission('tenant:manage'), async (c) => {
  const { tenantId } = c.get('auth')
  const membershipId = c.req.param('id')
  const parsed = updateMemberRoleSchema.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'Valid role is required' }, 400)
  const body = parsed.data

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
