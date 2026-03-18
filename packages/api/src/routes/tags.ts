/** Tag routes */

import { Hono } from 'hono'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { documentTags, documents } from '../db/schema'
import { authGuard } from '../middleware/auth-guard'
import { requirePermission } from '../middleware/require-permission'
import type { Env } from '../env'
import type { AuthContext } from '@agentwiki/shared'

type AuthEnv = { Bindings: Env; Variables: { auth: AuthContext } }

const tagsRouter = new Hono<AuthEnv>()
tagsRouter.use('*', authGuard)

// List all tags with counts for tenant
tagsRouter.get('/', requirePermission('doc:read'), async (c) => {
  const { tenantId } = c.get('auth')
  const db = drizzle(c.env.DB)

  const tags = await db
    .select({
      tag: documentTags.tag,
      count: sql<number>`count(*)`,
    })
    .from(documentTags)
    .innerJoin(documents, eq(documentTags.documentId, documents.id))
    .where(eq(documents.tenantId, tenantId))
    .groupBy(documentTags.tag)
    .orderBy(sql`count(*) desc`)

  return c.json({ tags })
})

export { tagsRouter }
