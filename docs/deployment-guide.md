# AgentWiki: Deployment Guide

Complete instructions for setting up AgentWiki on Cloudflare infrastructure and deploying to production.

## Prerequisites

- Cloudflare account (free or paid)
- Node.js 20+ and pnpm 9.15+
- Git repository access
- Google OAuth app credentials
- GitHub OAuth app credentials

## Cloudflare Account Setup

### 1. Create Cloudflare Account
1. Sign up at [cloudflare.com](https://cloudflare.com)
2. Add domain (agentwiki.cc) or use nameservers from Cloudflare
3. Upgrade to Paid plan (required for Workers, D1, R2, Vectorize)

### 2. Enable Required Services

#### Workers
1. Go to **Workers & Pages** → **Overview**
2. Click **Create application** → **Create a Worker**
3. Name: `agentwiki-api`
4. Deploy (placeholder worker)

#### D1 Database
```bash
# Install Wrangler (if not already installed)
npm install -g wrangler

# Create D1 database
wrangler d1 create agentwiki-main

# Copy database_id from output
# Update packages/api/wrangler.toml:
# [[d1_databases]]
# database_id = "xxxxx-xxxxx-xxxxx"
```

#### R2 Bucket
1. Go to **R2** → **Create bucket**
2. Name: `agentwiki-files`
3. Default region: auto
4. Block public access: Leave checked (we'll use presigned URLs)
5. Create bucket

#### KV Namespace
```bash
# Create KV namespace
wrangler kv:namespace create agentwiki-kv

# Copy namespace_id from output
# Update packages/api/wrangler.toml:
# [[kv_namespaces]]
# id = "xxxxx-xxxxx-xxxxx"
```

#### Vectorize Index
1. Go to **Vectorize** (in Workers dashboard)
2. Click **Create index**
3. Name: `agentwiki-vectors`
4. Dimensions: `768` (bge-base-en output size)
5. Metric: `cosine`
6. Create index

#### Queues
1. Go to **Queues** (in Workers dashboard)
2. Click **Create queue**
3. Name: `agentwiki-jobs`
4. Create queue

### 3. OAuth Configuration

#### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project: `AgentWiki`
3. Enable OAuth 2.0:
   - **API & Services** → **Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Add authorized redirect URIs:
     - `https://api.agentwiki.cc/api/auth/google/callback`
     - `http://localhost:8787/api/auth/google/callback` (local dev)
4. Save **Client ID** and **Client Secret**

#### GitHub OAuth
1. Go to GitHub Settings → **Developer settings** → **OAuth Apps**
2. Click **New OAuth App**
3. Application name: `AgentWiki`
4. Homepage URL: `https://app.agentwiki.cc`
5. Authorization callback URL: `https://api.agentwiki.cc/api/auth/github/callback`
6. Save **Client ID** and **Client Secret**

## Local Development Setup

### 1. Clone Repository
```bash
git clone https://github.com/your-org/agentwiki.git
cd agentwiki
```

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Configure Environment Variables

Create `packages/api/.env.local`:
```env
# OAuth Credentials
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
GITHUB_CLIENT_ID=xxxxx
GITHUB_CLIENT_SECRET=xxxxx

# App URL (for OAuth redirects)
APP_URL=http://localhost:8787
```

Create `packages/web/.env.local`:
```env
VITE_API_URL=http://localhost:8787
```

### 4. Initialize Database

```bash
# Generate Drizzle ORM from schema
pnpm -F @agentwiki/api db:generate

# Apply migrations to local D1
pnpm -F @agentwiki/api db:migrate
```

### 5. Start Development Servers

Terminal 1 (API):
```bash
cd packages/api
pnpm dev
# Runs on http://localhost:8787
```

Terminal 2 (Web):
```bash
cd packages/web
pnpm dev
# Runs on http://localhost:5173
# Proxies /api to http://localhost:8787
```

Terminal 3 (Optional: Watch mode):
```bash
pnpm type-check --watch
```

### 6. Test Setup
1. Visit http://localhost:5173
2. Click "Sign in with Google"
3. Complete OAuth flow
4. Should create user + default tenant

## Production Deployment

### 1. Update wrangler.toml

Edit `packages/api/wrangler.toml`:

```toml
name = "agentwiki-api"
main = "src/index.ts"
compatibility_date = "2026-03-01"

[vars]
APP_URL = "https://api.agentwiki.cc"

[[d1_databases]]
binding = "DB"
database_name = "agentwiki-main"
database_id = "xxxxx-xxxxx"  # From step 2 above

[[r2_buckets]]
binding = "R2"
bucket_name = "agentwiki-files"

[[kv_namespaces]]
binding = "KV"
id = "xxxxx-xxxxx"  # From step 2 above

[[vectorize]]
binding = "VECTORIZE"
index_name = "agentwiki-vectors"

[[queues.producers]]
binding = "QUEUE"
queue = "agentwiki-jobs"

[[queues.consumers]]
queue = "agentwiki-jobs"
max_batch_size = 10
max_batch_timeout = 30

[ai]
binding = "AI"
```

### 2. Set Secrets in Cloudflare

```bash
# Set OAuth credentials (won't be committed to repo)
wrangler secret put GOOGLE_CLIENT_ID
# Paste: your Google Client ID

wrangler secret put GOOGLE_CLIENT_SECRET
# Paste: your Google Client Secret

wrangler secret put GITHUB_CLIENT_ID
# Paste: your GitHub Client ID

wrangler secret put GITHUB_CLIENT_SECRET
# Paste: your GitHub Client Secret
```

### 3. Apply Database Migrations to Production

```bash
# This runs migrations on the production D1 database
pnpm -F @agentwiki/api db:migrate:remote
```

### 4. Deploy API Worker

```bash
cd packages/api

# Dry run (preview changes)
wrangler deploy --dry-run

# Deploy to production
wrangler deploy
```

### 5. Deploy Frontend

#### Option A: Cloudflare Pages (Recommended)

1. Connect GitHub repo to Cloudflare Pages:
   - Go to **Pages** → **Connect to Git**
   - Select repository
   - Configure build:
     - **Build command**: `pnpm build`
     - **Build output directory**: `packages/web/dist`
     - **Root directory**: `.`

2. Add environment variables:
   - **VITE_API_URL**: `https://api.agentwiki.cc`

3. Push to main branch to trigger deploy

#### Option B: Manual Deploy

```bash
cd packages/web
pnpm build

# Deploy dist folder to Pages
wrangler pages deploy dist
```

### 6. Domain Configuration

#### Point Domain to Cloudflare
1. Update domain nameservers to Cloudflare:
   ```
   isaac.ns.cloudflare.com
   nora.ns.cloudflare.com
   ```

2. Configure DNS records:
   ```
   @ (root)       CNAME   agentwiki-pages.pages.dev    (Frontend)
   api            CNAME   agentwiki-api.workers.dev     (API)
   www            CNAME   @                              (Redirect)
   ```

3. SSL/TLS: Set to "Full (strict)" in SSL/TLS settings

#### Update OAuth Callbacks
Update Google and GitHub OAuth apps with production URLs:
- Google: `https://api.agentwiki.cc/api/auth/google/callback`
- GitHub: `https://api.agentwiki.cc/api/auth/github/callback`

## CI/CD Pipeline

### GitHub Actions Setup

`.github/workflows/ci.yml` automatically:
1. Runs on push to main
2. Type checks, lints, builds
3. On success: Wrangler deploy (API)
4. Pages automatically deploys frontend

```bash
# To trigger manually:
git push origin main
```

### Manual Deployment Check

```bash
# Type check
pnpm type-check

# Lint
pnpm lint

# Build
pnpm build

# Test
pnpm test
```

## Database Management

### Schema Changes

When modifying `packages/api/src/db/schema.ts`:

```bash
# 1. Generate migration SQL
pnpm -F @agentwiki/api db:generate

# 2. Review generated SQL (packages/api/src/db/migrations/*.sql)

# 3. Test locally
pnpm -F @agentwiki/api db:migrate

# 4. Commit changes
git add packages/api/src/db
git commit -m "feat: add new_field to documents table"

# 5. On production:
pnpm -F @agentwiki/api db:migrate:remote
```

### Backup Database

```bash
# Export full database
wrangler d1 execute agentwiki-main --file=backup.sql --remote

# This outputs SQL; save to file for backup
```

## Monitoring & Troubleshooting

### Check Worker Status
```bash
# View logs
wrangler tail agentwiki-api

# View status
wrangler status
```

### Database Queries
```bash
# Connect to D1 CLI
wrangler d1 shell agentwiki-main

# Run SQL
SELECT COUNT(*) FROM documents WHERE tenant_id = 'tenant_123';
```

### Common Issues

#### OAuth Redirect Mismatch
```
Error: The redirect_uri does not match
```
**Fix**: Update OAuth app callback URLs to match production domain

#### CORS Errors
```
Access to XMLHttpRequest blocked by CORS policy
```
**Fix**: Check `api/src/index.ts` CORS config includes frontend domain

#### D1 Migration Fails
```
Error: Table already exists
```
**Fix**: Migration was already applied; check journal in migrations/meta/_journal.json

#### Rate Limiting Too Strict
```
Error: 429 Too Many Requests
```
**Fix**: Adjust limits in `RATE_LIMITS` constant in `shared/src/constants.ts`

## Performance Optimization

### Frontend
```bash
# Measure bundle size
pnpm build
# Review dist/ folder size

# Analyze chunks
# Check if any single chunk >100KB (should be split)
```

### Backend
```bash
# Monitor API latency
# Via Cloudflare Analytics dashboard

# Check slow queries
# Enable query logging in Drizzle config
```

### Database
```bash
# Analyze slow queries
wrangler d1 shell agentwiki-main
EXPLAIN QUERY PLAN SELECT * FROM documents WHERE tenant_id = 'x';

# Add indexes if needed
```

### R2
```bash
# Monitor storage usage
# Via Cloudflare dashboard R2 section

# Cleanup old uploads
# Implement scheduled worker to delete orphaned files
```

## Scaling Considerations

### Multi-Tenant Sharding

When a single tenant exceeds 10GB:

1. Create new D1 database:
   ```bash
   wrangler d1 create agentwiki-shard-02
   ```

2. Update tenant routing logic in `api/src/middleware/auth-guard.ts` or new middleware:
   ```typescript
   function getTenantDatabase(tenantId: string, env: Env): D1Database {
     const shardNum = calculateShard(tenantId) // hash(tenantId) % num_shards
     return env[`DB_SHARD_${shardNum}`]
   }
   ```

3. Update `wrangler.toml` to bind multiple D1 databases:
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_id = "shard-0-id"

   [[d1_databases]]
   binding = "DB_SHARD_02"
   database_id = "shard-1-id"
   ```

### Load Testing

Before launch, verify capacity:

```bash
# Using Apache Bench (example)
ab -n 1000 -c 100 https://api.agentwiki.cc/api/health

# Expected: <500ms response time, <1% errors
```

## Rollback Procedure

### API Rollback
```bash
# List deployments
wrangler deployments list

# Rollback to previous version
wrangler rollback --name agentwiki-api
```

### Database Rollback
```bash
# If migration fails:
# 1. Identify problematic migration file
# 2. Remove it from migrations/meta/_journal.json
# 3. Fix SQL in migration file
# 4. Re-run: pnpm db:migrate:remote
```

### Frontend Rollback
1. In Cloudflare Pages dashboard
2. Select previous deployment
3. Click **Rollback to this deployment**

## Security Hardening

### Pre-Launch Checklist

- [ ] Set strong Cloudflare API token
- [ ] Enable 2FA on Cloudflare account
- [ ] Rotate OAuth secrets monthly
- [ ] Set WAF rules (DDoS protection, Bot Management)
- [ ] Enable rate limiting on all endpoints
- [ ] Review and enforce CORS headers
- [ ] Set Content-Security-Policy headers
- [ ] Enable HSTS on domain
- [ ] Rotate JWT signing key (if needed)
- [ ] Review audit logs access permissions
- [ ] Document incident response procedure
- [ ] Setup monitoring/alerting for errors

### SSL/TLS Configuration
1. Go to **SSL/TLS** settings
2. Set to **Full (strict)**
3. Enable **HSTS** (1 year min-age)
4. Enable **Always HTTPS** redirect

## Maintenance

### Regular Tasks

**Weekly**:
- Monitor error rates in Cloudflare Analytics
- Check D1 storage usage
- Review recent deployments

**Monthly**:
- Rotate OAuth credentials (if using rotation policy)
- Review audit logs for suspicious activity
- Run full backup export

**Quarterly**:
- Performance review & optimization
- Security audit
- Load test with new workloads

## Support & Resources

- **Cloudflare Docs**: https://developers.cloudflare.com
- **Workers**: https://developers.cloudflare.com/workers
- **D1**: https://developers.cloudflare.com/d1
- **Drizzle ORM**: https://orm.drizzle.team
- **Hono**: https://hono.dev
- **GitHub Actions**: https://docs.github.com/actions

## Deployment Checklist

Before deploying to production:

- [ ] All tests passing locally
- [ ] Type checking passes
- [ ] Linting passes
- [ ] Environment variables set in Cloudflare
- [ ] Database migrations tested locally
- [ ] OAuth credentials configured
- [ ] Domain DNS records pointing to CF
- [ ] SSL/TLS set to "Full (strict)"
- [ ] CORS headers configured correctly
- [ ] Rate limits set appropriately
- [ ] Monitoring/alerts configured
- [ ] Backup procedure documented
- [ ] Rollback procedure tested
- [ ] Security checklist completed
- [ ] Post-deployment smoke tests run

## Troubleshooting Deployment

### Issue: Worker won't deploy
```
Error: Failed to upload script
```
**Solution**: Check file size (<25MB), verify auth with `wrangler login`

### Issue: D1 migration hangs
```
Error: Migration timeout after 30s
```
**Solution**: Large migrations timeout; break into smaller files or increase timeout

### Issue: Pages build fails
```
Error: Build command exited with code 1
```
**Solution**: Check build logs in Pages dashboard; ensure Node 20+ selected

### Issue: R2 bucket not accessible
```
Error: AccessDenied when uploading
```
**Solution**: Verify bucket permissions; ensure presigned URLs are being generated correctly

## Next Steps

After deployment:

1. Create test user account
2. Create sample documents
3. Test search functionality
4. Verify file uploads work
5. Test sharing/publishing
6. Check API with CLI (`agentwiki whoami`)
7. Monitor logs for errors
8. Gather user feedback
