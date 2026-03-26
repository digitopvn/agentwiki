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
    return c.json({ error: 'Could not invite this user. They may need to sign up first.' }, 422)
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

  // Direct targeted query — avoids loading full member list
  const db = drizzle(c.env.DB)
  const match = await db
    .select({ id: tenantMemberships.id, role: tenantMemberships.role })
    .from(tenantMemberships)
    .where(and(eq(tenantMemberships.id, membershipId), eq(tenantMemberships.tenantId, tenantId)))
    .limit(1)
  if (!match.length) return c.json({ error: 'Member not found' }, 404)

  // Prevent demoting the last admin
  if (match[0].role === 'admin' && body.role !== 'admin') {
    const adminCount = await db
      .select({ id: tenantMemberships.id })
      .from(tenantMemberships)
      .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.role, 'admin')))
    if (adminCount.length <= 1) {
      return c.json({ error: 'Cannot change role — this is the only admin' }, 409)
    }
  }

  const updated = await updateMemberRole(c.env, membershipId, body.role)
  return c.json({ member: updated })
})

// Remove a member from the tenant
memberRoutes.delete('/:id', requirePermission('tenant:manage'), async (c) => {
  const { tenantId } = c.get('auth')
  const membershipId = c.req.param('id')

  // Direct targeted query — avoids loading full member list
  const db = drizzle(c.env.DB)
  const match = await db
    .select({ id: tenantMemberships.id, role: tenantMemberships.role })
    .from(tenantMemberships)
    .where(and(eq(tenantMemberships.id, membershipId), eq(tenantMemberships.tenantId, tenantId)))
    .limit(1)
  if (!match.length) return c.json({ error: 'Member not found' }, 404)

  // Prevent removing the last admin
  if (match[0].role === 'admin') {
    const adminCount = await db
      .select({ id: tenantMemberships.id })
      .from(tenantMemberships)
      .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.role, 'admin')))
    if (adminCount.length <= 1) {
      return c.json({ error: 'Cannot remove the only admin from the workspace' }, 409)
    }
  }

  await removeMember(c.env, membershipId)
  return c.json({ ok: true })
})

export { memberRoutes }
