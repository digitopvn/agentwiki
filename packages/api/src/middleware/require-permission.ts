/** RBAC permission check middleware */

import { createMiddleware } from 'hono/factory'
import { PERMISSIONS } from '@agentwiki/shared'
import type { Env } from '../env'
import type { AuthContext, Role } from '@agentwiki/shared'

type AuthEnv = { Bindings: Env; Variables: { auth: AuthContext } }

/** Check if role has a specific permission (supports wildcard) */
function hasPermission(role: Role, permission: string): boolean {
  const perms = PERMISSIONS[role] ?? []
  const [resource, action] = permission.split(':')
  return perms.some((p) => {
    const [r, a] = p.split(':')
    return (r === resource || r === '*') && (a === action || a === '*')
  })
}

/** Middleware factory — require specific permission */
export function requirePermission(permission: string) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const auth = c.get('auth')
    if (!auth) return c.json({ error: 'Authentication required' }, 401)

    if (!hasPermission(auth.role, permission)) {
      return c.json({ error: 'Insufficient permissions' }, 403)
    }

    return next()
  })
}

/** Require admin role */
export const requireAdmin = requirePermission('tenant:manage')
