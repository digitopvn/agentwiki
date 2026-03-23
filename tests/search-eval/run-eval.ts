#!/usr/bin/env tsx
/**
 * Search evaluation harness — runs eval queries against a live AgentWiki instance.
 *
 * Usage:
 *   npx tsx tests/search-eval/run-eval.ts [options]
 *
 * Options:
 *   --url=<base-url>    API base URL (default: http://localhost:8787)
 *   --token=<api-key>   API key for authentication (default: $AGENTWIKI_API_KEY)
 *   --label=<name>      Label for this eval run (default: "baseline")
 *   --output=<path>     Output file path (default: tests/search-eval/results/<label>.json)
 *   --bootstrap         Run queries and save results as golden set (populates expectedSlugs)
 *   --compare=<path>    Compare results against a previous run
 *   --keyword-source=<trigram|fts5>  Force keyword search source (for Phase 0.5 benchmark)
 *   --type=<type>       Only run queries of this type (exact, semantic, fuzzy, multi-concept, negative)
 *   --verbose           Print per-query results
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { mrr, precisionAtK, recallAtK, ndcg, percentile } from './metrics'
import type { EvalQuery, EvalQueryResult, EvalReport, QueryType } from './types'

const EVAL_DIR = dirname(new URL(import.meta.url).pathname)
const RESULTS_DIR = resolve(EVAL_DIR, 'results')

// ── CLI args ──
function parseArgs(): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {}
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--')) {
      const [key, ...rest] = arg.slice(2).split('=')
      args[key] = rest.length ? rest.join('=') : true
    }
  }
  return args
}

interface SearchResult {
  id: string
  title: string
  slug: string
  snippet: string
  score?: number
}

interface SearchResponse {
  results: SearchResult[]
  query: string
  type: string
  searchId: string
}

// ── Search API client ──
async function searchAPI(
  baseUrl: string,
  token: string,
  query: string,
  params: Record<string, string> = {},
): Promise<{ results: SearchResult[]; latencyMs: number }> {
  const url = new URL('/api/search', baseUrl)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '10')
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }

  const t0 = performance.now()
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  const latencyMs = Math.round(performance.now() - t0)

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Search API ${res.status}: ${text}`)
  }

  const data = (await res.json()) as SearchResponse
  return { results: data.results, latencyMs }
}

// ── Eval runner ──
async function runEval(
  baseUrl: string,
  token: string,
  queries: EvalQuery[],
  params: Record<string, string> = {},
  verbose = false,
): Promise<EvalQueryResult[]> {
  const results: EvalQueryResult[] = []

  for (const q of queries) {
    try {
      const { results: searchResults, latencyMs } = await searchAPI(baseUrl, token, q.query, params)
      const resultSlugs = searchResults.map((r) => r.slug).filter(Boolean)

      const result: EvalQueryResult = {
        queryId: q.id,
        type: q.type,
        query: q.query,
        mrr5: mrr(resultSlugs, q.expectedSlugs, 5),
        precision3: precisionAtK(resultSlugs, q.expectedSlugs, 3),
        recall10: recallAtK(resultSlugs, q.expectedSlugs, 10),
        ndcg10: ndcg(resultSlugs, q.expectedSlugs, q.relevanceGrades, 10),
        latencyMs,
        resultSlugs: resultSlugs.slice(0, 5),
        expectedSlugs: q.expectedSlugs,
        hit: resultSlugs.slice(0, 5).some((s) => q.expectedSlugs.includes(s)),
      }

      results.push(result)

      if (verbose) {
        const status = q.expectedSlugs.length === 0 ? '⬜' : result.hit ? '✅' : '❌'
        console.log(`  ${status} ${q.id}: MRR=${result.mrr5.toFixed(2)} P@3=${result.precision3.toFixed(2)} ${latencyMs}ms`)
      }
    } catch (err) {
      console.error(`  ⚠️  ${q.id}: ${(err as Error).message}`)
      results.push({
        queryId: q.id,
        type: q.type,
        query: q.query,
        mrr5: 0,
        precision3: 0,
        recall10: 0,
        ndcg10: 0,
        latencyMs: 0,
        resultSlugs: [],
        expectedSlugs: q.expectedSlugs,
        hit: false,
      })
    }
  }

  return results
}

// ── Aggregate metrics ──
function aggregate(results: EvalQueryResult[], label: string, env: string): EvalReport {
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b)

  // Per-type breakdown
  const types: QueryType[] = ['exact', 'semantic', 'fuzzy', 'multi-concept', 'negative']
  const byType = {} as EvalReport['byType']
  for (const t of types) {
    const tResults = results.filter((r) => r.type === t)
    byType[t] = {
      count: tResults.length,
      avgMrr5: tResults.length ? tResults.reduce((s, r) => s + r.mrr5, 0) / tResults.length : 0,
      avgPrecision3: tResults.length ? tResults.reduce((s, r) => s + r.precision3, 0) / tResults.length : 0,
    }
  }

  // Only count queries with expected results for relevance metrics
  const scorable = results.filter((r) => r.expectedSlugs.length > 0)
  const scorableCount = scorable.length || 1

  return {
    timestamp: new Date().toISOString(),
    label,
    environment: env,
    queryCount: results.length,
    results,
    aggregate: {
      avgMrr5: scorable.reduce((s, r) => s + r.mrr5, 0) / scorableCount,
      avgPrecision3: scorable.reduce((s, r) => s + r.precision3, 0) / scorableCount,
      avgRecall10: scorable.reduce((s, r) => s + r.recall10, 0) / scorableCount,
      avgNdcg10: scorable.reduce((s, r) => s + r.ndcg10, 0) / scorableCount,
      hitRate5: scorable.filter((r) => r.hit).length / scorableCount,
      latencyP50: percentile(latencies, 50),
      latencyP95: percentile(latencies, 95),
    },
    byType,
  }
}

// ── Bootstrap golden set ──
async function bootstrap(baseUrl: string, token: string, queriesPath: string) {
  console.log('🔄 Bootstrap mode: running queries to populate golden set...\n')
  const raw = JSON.parse(readFileSync(queriesPath, 'utf-8'))
  const queries: EvalQuery[] = raw.queries

  for (const q of queries) {
    try {
      const { results } = await searchAPI(baseUrl, token, q.query)
      const slugs = results.map((r) => r.slug).filter(Boolean).slice(0, 5)
      q.expectedSlugs = slugs
      // Default binary relevance for top results
      q.relevanceGrades = slugs.map((_, i) => Math.max(1, 3 - i))
      console.log(`  ✅ ${q.id}: ${slugs.length} results → ${slugs.join(', ')}`)
    } catch (err) {
      console.log(`  ⚠️  ${q.id}: ${(err as Error).message}`)
    }
  }

  writeFileSync(queriesPath, JSON.stringify(raw, null, 2) + '\n')
  console.log(`\n✅ Golden set saved to ${queriesPath}`)
  console.log('Review and adjust expectedSlugs + relevanceGrades manually for accuracy.')
}

// ── Compare two runs ──
function compareReports(current: EvalReport, previous: EvalReport) {
  const c = current.aggregate
  const p = previous.aggregate
  const delta = (curr: number, prev: number) => {
    const d = curr - prev
    return d > 0 ? `+${d.toFixed(3)}` : d.toFixed(3)
  }

  console.log('\n## Comparison: ' + current.label + ' vs ' + previous.label)
  console.log('')
  console.log('| Metric | Previous | Current | Delta |')
  console.log('|--------|----------|---------|-------|')
  console.log(`| MRR@5 | ${p.avgMrr5.toFixed(3)} | ${c.avgMrr5.toFixed(3)} | ${delta(c.avgMrr5, p.avgMrr5)} |`)
  console.log(`| Precision@3 | ${p.avgPrecision3.toFixed(3)} | ${c.avgPrecision3.toFixed(3)} | ${delta(c.avgPrecision3, p.avgPrecision3)} |`)
  console.log(`| Recall@10 | ${p.avgRecall10.toFixed(3)} | ${c.avgRecall10.toFixed(3)} | ${delta(c.avgRecall10, p.avgRecall10)} |`)
  console.log(`| NDCG@10 | ${p.avgNdcg10.toFixed(3)} | ${c.avgNdcg10.toFixed(3)} | ${delta(c.avgNdcg10, p.avgNdcg10)} |`)
  console.log(`| Hit Rate@5 | ${(p.hitRate5 * 100).toFixed(0)}% | ${(c.hitRate5 * 100).toFixed(0)}% | ${delta(c.hitRate5 * 100, p.hitRate5 * 100)}% |`)
  console.log(`| Latency p50 | ${p.latencyP50}ms | ${c.latencyP50}ms | ${delta(c.latencyP50, p.latencyP50)}ms |`)
  console.log(`| Latency p95 | ${p.latencyP95}ms | ${c.latencyP95}ms | ${delta(c.latencyP95, p.latencyP95)}ms |`)
}

// ── Print markdown report ──
function printReport(report: EvalReport) {
  const a = report.aggregate
  console.log(`\n## Search Eval: ${report.label}`)
  console.log(`**${report.timestamp}** | ${report.queryCount} queries | ${report.environment}\n`)
  console.log('| Metric | Value |')
  console.log('|--------|-------|')
  console.log(`| Avg MRR@5 | ${a.avgMrr5.toFixed(3)} |`)
  console.log(`| Avg Precision@3 | ${a.avgPrecision3.toFixed(3)} |`)
  console.log(`| Avg Recall@10 | ${a.avgRecall10.toFixed(3)} |`)
  console.log(`| Avg NDCG@10 | ${a.avgNdcg10.toFixed(3)} |`)
  console.log(`| Hit Rate@5 | ${(a.hitRate5 * 100).toFixed(0)}% |`)
  console.log(`| Latency p50 | ${a.latencyP50}ms |`)
  console.log(`| Latency p95 | ${a.latencyP95}ms |`)

  console.log('\n### By Query Type\n')
  console.log('| Type | Count | Avg MRR@5 | Avg P@3 |')
  console.log('|------|-------|-----------|---------|')
  for (const [type, data] of Object.entries(report.byType)) {
    if (data.count > 0) {
      console.log(`| ${type} | ${data.count} | ${data.avgMrr5.toFixed(3)} | ${data.avgPrecision3.toFixed(3)} |`)
    }
  }
}

// ── Main ──
async function main() {
  const args = parseArgs()
  const baseUrl = (args.url as string) || 'http://localhost:8787'
  const token = (args.token as string) || process.env.AGENTWIKI_API_KEY || ''
  const label = (args.label as string) || 'baseline'
  const verbose = !!args.verbose
  const queryType = args.type as QueryType | undefined

  if (!token) {
    console.error('❌ No API key. Set --token=<key> or AGENTWIKI_API_KEY env var.')
    process.exit(1)
  }

  const queriesPath = resolve(EVAL_DIR, 'eval-queries.json')
  if (!existsSync(queriesPath)) {
    console.error(`❌ Queries file not found: ${queriesPath}`)
    process.exit(1)
  }

  // Bootstrap mode — populate golden set
  if (args.bootstrap) {
    await bootstrap(baseUrl, token, queriesPath)
    return
  }

  // Load queries
  const raw = JSON.parse(readFileSync(queriesPath, 'utf-8'))
  let queries: EvalQuery[] = raw.queries

  // Filter by type if specified
  if (queryType) {
    queries = queries.filter((q) => q.type === queryType)
  }

  console.log(`🔍 Running ${queries.length} eval queries against ${baseUrl}...\n`)

  // Search params (for Phase 0.5 keyword source benchmarking)
  const searchParams: Record<string, string> = {}
  if (args['keyword-source']) {
    searchParams['keyword-source'] = args['keyword-source'] as string
  }

  const results = await runEval(baseUrl, token, queries, searchParams, verbose)
  const report = aggregate(results, label, baseUrl)

  // Print report
  printReport(report)

  // Save results
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true })
  const outputPath = (args.output as string) || resolve(RESULTS_DIR, `${label}.json`)
  writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n')
  console.log(`\n💾 Results saved to ${outputPath}`)

  // Compare if requested
  if (args.compare) {
    const prevPath = resolve(args.compare as string)
    if (existsSync(prevPath)) {
      const previous = JSON.parse(readFileSync(prevPath, 'utf-8')) as EvalReport
      compareReports(report, previous)
    } else {
      console.error(`⚠️  Comparison file not found: ${prevPath}`)
    }
  }
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
