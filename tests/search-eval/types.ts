/** Search evaluation types */

export type QueryType = 'exact' | 'semantic' | 'fuzzy' | 'multi-concept' | 'negative'

/** A single eval query with expected results */
export interface EvalQuery {
  /** Unique query ID, e.g. "exact-01" */
  id: string
  /** Query classification */
  type: QueryType
  /** The search query text */
  query: string
  /**
   * Expected document IDs or slugs, ordered by relevance (most relevant first).
   * Use slugs for portability across environments.
   */
  expectedSlugs: string[]
  /**
   * Graded relevance per expected doc (0=irrelevant, 1=partial, 2=relevant, 3=perfect).
   * Must match length of expectedSlugs. If omitted, binary relevance is used.
   */
  relevanceGrades?: number[]
  /** Why this query matters */
  notes?: string
}

/** Result of running a single eval query */
export interface EvalQueryResult {
  queryId: string
  type: QueryType
  query: string
  mrr5: number
  precision3: number
  recall10: number
  ndcg10: number
  latencyMs: number
  resultSlugs: string[]
  expectedSlugs: string[]
  /** Whether any expected doc was found in top 5 */
  hit: boolean
}

/** Aggregated eval report */
export interface EvalReport {
  timestamp: string
  label: string
  environment: string
  queryCount: number
  results: EvalQueryResult[]
  aggregate: {
    avgMrr5: number
    avgPrecision3: number
    avgRecall10: number
    avgNdcg10: number
    hitRate5: number
    latencyP50: number
    latencyP95: number
  }
  byType: Record<QueryType, {
    count: number
    avgMrr5: number
    avgPrecision3: number
  }>
}
