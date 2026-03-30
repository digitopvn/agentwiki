/** AgentWiki MCP Server — Cloudflare Worker entry point */

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { authenticateRequest } from './auth/api-key-auth'
import { createMcpServer } from './server'
import type { Env } from './env'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization, Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
}

function addCors(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response('ok')
    }

    // Only serve /mcp endpoint
    if (url.pathname !== '/mcp') {
      return addCors(new Response('Not Found', { status: 404 }))
    }

    // Authenticate via API key
    const auth = await authenticateRequest(env, request)
    if (!auth) {
      return addCors(
        new Response(JSON.stringify({ error: 'Unauthorized — provide API key via x-api-key header, Authorization: Bearer, or ?api_key= query param' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }

    // Create per-request MCP server with auth context in closures
    const server = createMcpServer(env, auth, ctx)

    // Stateless Streamable HTTP transport for CF Workers
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await server.connect(transport)

    // Handle MCP request and add CORS headers
    const response = await transport.handleRequest(request)
    return addCors(response)
  },
}
