/** Member service — tenant membership queries and mutations */

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { tenantMemberships, users } from '../db/schema'
import type { Env } from '../env'

/** List all members for a tenant, joining user info */
export async function listMembers(env: Env, tenantId: string) {
  const db = drizzle(env.DB)
  const rows = await db
    .select({
      id: tenantMemberships.id,
      userId: tenantMemberships.userId,
      role: tenantMemberships.role,
      joinedAt: tenantMemberships.joinedAt,
      userName: users.name,
      userEmail: users.email,
      userAvatar: users.avatarUrl,
    })
    .from(tenantMemberships)
    .innerJoin(users, eq(tenantMemberships.userId, users.id))
    .where(eq(tenantMemberships.tenantId, tenantId))
  return rows
}

/** Update role for a specific membership record */
export async function updateMemberRole(env: Env, membershipId: string, role: string) {
  const db = drizzle(env.DB)
  await db.update(tenantMemberships).set({ role }).where(eq(tenantMemberships.id, membershipId))
  const result = await db
    .select()
    .from(tenantMemberships)
    .where(eq(tenantMemberships.id, membershipId))
    .limit(1)
  return result[0] ?? null
}

/** Remove a membership record */
export async function removeMember(env: Env, membershipId: string) {
  const db = drizzle(env.DB)
  await db.delete(tenantMemberships).where(eq(tenantMemberships.id, membershipId))
}
