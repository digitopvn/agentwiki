/** Cloudflare Workers environment bindings */
export type Env = {
  DB: D1Database
  R2: R2Bucket
  KV: KVNamespace
  VECTORIZE: VectorizeIndex
  QUEUE: Queue
  AI: Ai
  APP_URL: string
  JWT_SECRET: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
}
