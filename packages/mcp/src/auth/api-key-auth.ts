/** API key extraction, validation, and RBAC for MCP server */

import { validateApiKey } from '../../../api/src/services/api-key-service'
import { API_KEY_PREFIX } from '@agentwiki/shared'
import type { Env, McpAuthContext } from '../env'

/** Extract API key from request — priority: x-api-key header → Bearer → query param */
export function extractApiKey(request: Request): string | null {
  // 1. x-api-key header
  const headerKey = request.headers.get('x-api-key')
  if (headerKey?.startsWith(API_KEY_PREFIX)) return headerKey

  // 2. Authorization: Bearer aw_...
  const authHeader = request.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    if (token.startsWith(API_KEY_PREFIX)) return token
  }

  // 3. Query param ?api_key=aw_...
  const url = new URL(request.url)
  const queryKey = url.searchParams.get('api_key')
  if (queryKey?.startsWith(API_KEY_PREFIX)) return queryKey

  return null
}

/** Authenticate request via API key — returns auth context or null */
export async function authenticateRequest(
  env: Env,
  request: Request,
): Promise<McpAuthContext | null> {
  const apiKey = extractApiKey(request)
  if (!apiKey) return null

  // validateApiKey expects full Env but only uses DB + KV
  const result = await validateApiKey(env as never, apiKey)
  if (!result) return null

  return {
    userId: result.id,
    tenantId: result.tenantId,
    scopes: result.scopes,
    apiKeyId: result.id,
  }
}

/** Check if scopes include the required permission (supports wildcards) */
export function checkPermission(scopes: string[], permission: string): boolean {
  const [reqResource, reqAction] = permission.split(':')
  return scopes.some((s) => {
    const [r, a] = s.split(':')
    return (r === reqResource || r === '*') && (a === reqAction || a === '*')
  })
}
