/** Search routes — hybrid trigram + semantic, faceted filtering, autocomplete suggestions */

import { Hono } from 'hono'
import { searchDocuments, getFacetCounts, type SearchSource } from '../services/search-service'
import { getSuggestions, recordSearchHistory } from '../services/suggest-service'
import { recordSearch, recordClick } from '../services/analytics-service'
import { authGuard } from '../middleware/auth-guard'
import { rateLimiter } from '../middleware/rate-limiter'
import { RATE_LIMITS } from '@agentwiki/shared'
import type { Env } from '../env'
import type { AuthContext, SearchFilters, SearchClickEvent } from '@agentwiki/shared'

type AuthEnv = { Bindings: Env; Variables: { auth: AuthContext } }

const searchRouter = new Hono<AuthEnv>()
searchRouter.use('*', authGuard)

// Search documents with optional faceted filtering
searchRouter.get(
  '/',
  rateLimiter(RATE_LIMITS.search),
  async (c) => {
    const { tenantId } = c.get('auth')
    const query = c.req.query('q')
    if (!query) return c.json({ error: 'Query parameter "q" is required' }, 400)

    const type = (c.req.query('type') ?? 'hybrid') as 'hybrid' | 'keyword' | 'semantic'
    const limit = Math.min(50, parseInt(c.req.query('limit') ?? '10', 10))
    const rawSource = c.req.query('source') ?? 'docs'
    const source: SearchSource = ['docs', 'storage', 'all'].includes(rawSource) ? rawSource as SearchSource : 'docs'
    const includeFacets = c.req.query('facets') === 'true'

    // Parse filter params
    const filters: SearchFilters = {
      category: c.req.query('category') || undefined,
      tags: c.req.queries('tags[]')?.filter(Boolean) || undefined,
      dateFrom: c.req.query('dateFrom') || undefined,
      dateTo: c.req.query('dateTo') || undefined,
    }

    // Run search + facets in parallel when requested
    const [results, facets] = await Promise.all([
      searchDocuments(c.env, { tenantId, query, type, limit, filters, source }),
      includeFacets ? getFacetCounts(c.env, tenantId) : undefined,
    ])

    // Record search history + analytics async (fire-and-forget)
    const searchId = crypto.randomUUID()
    c.executionCtx.waitUntil(
      Promise.all([
        recordSearchHistory(c.env, tenantId, query, results.length),
        recordSearch(c.env, searchId, tenantId, query, type, results.length),
      ]),
    )

    return c.json({ results, facets, query, type, searchId })
  },
)

// Autocomplete suggestions
searchRouter.get(
  '/suggest',
  rateLimiter(RATE_LIMITS.suggest),
  async (c) => {
    const { tenantId } = c.get('auth')
    const query = c.req.query('q')
    if (!query || query.length < 1) {
      return c.json({ suggestions: [], query: '' })
    }

    const limit = Math.min(10, parseInt(c.req.query('limit') ?? '7', 10))
    const suggestions = await getSuggestions(c.env, tenantId, query, limit)

    return c.json({ suggestions, query })
  },
)

// Record search result click
searchRouter.post(
  '/track',
  rateLimiter(RATE_LIMITS.api),
  async (c) => {
    const { tenantId } = c.get('auth')
    const body = await c.req.json<SearchClickEvent>()
    if (!body.searchId || !body.documentId) {
      return c.json({ error: 'searchId and documentId required' }, 400)
    }

    c.executionCtx.waitUntil(
      recordClick(c.env, tenantId, body.searchId, body.documentId, body.position),
    )

    return c.json({ ok: true })
  },
)

export { searchRouter }
