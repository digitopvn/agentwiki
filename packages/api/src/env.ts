/** Cloudflare Workers environment bindings */
export type Env = {
  DB: D1Database
  R2: R2Bucket
  KV: KVNamespace
  VECTORIZE: VectorizeIndex
  QUEUE: Queue
  AI: Ai
  APP_URL: string
  API_URL?: string // separate API URL for dev (localhost:8787); in prod, same as APP_URL
  JWT_SECRET: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  RESEND_API_KEY: string
  RESEND_FROM_EMAIL: string
  AI_ENCRYPTION_KEY: string
  EXTRACTION_INTERNAL_SECRET: string
  EXTRACTION_SERVICE_URL: string
  USE_FTS5?: string
}
