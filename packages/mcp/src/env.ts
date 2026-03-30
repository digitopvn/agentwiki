/** Cloudflare Workers environment bindings for MCP server.
 * Matches @agentwiki/api Env type — MCP only uses a subset of bindings at runtime.
 */
export type Env = {
  DB: D1Database
  R2: R2Bucket
  KV: KVNamespace
  VECTORIZE: VectorizeIndex
  QUEUE: Queue
  AI: Ai
  APP_URL: string
  API_URL?: string
  USE_FTS5?: string
}

/** Auth context derived from API key validation */
export interface McpAuthContext {
  userId: string
  tenantId: string
  scopes: string[]
  apiKeyId: string
}
