/** Reciprocal Rank Fusion — combine multiple ranked result lists with signal-aware weighting */

export interface RankedResult {
  id: string
  title: string
  slug: string
  snippet: string
  score?: number
  category?: string
  context?: string | null // folder hierarchy context (Phase 3)
}

export type SignalType = 'keyword' | 'semantic' | 'default'

/** Labeled input for position-aware RRF */
export interface RRFListOptions {
  list: RankedResult[]
  signal: SignalType
}

/**
 * Position-aware RRF fusion.
 * Base formula: score(doc) = Σ 1/(k + rank_i)
 *
 * Signal weighting adjusts contribution by rank position:
 * - Top 3:   keyword 75% / semantic 25% (trust exact matches)
 * - Rank 4-10: keyword 60% / semantic 40% (balanced)
 * - Rank 11+:  keyword 40% / semantic 60% (trust semantic for tail)
 *
 * Backward compatible: bare RankedResult[] arrays treated as signal='default'.
 */
export function reciprocalRankFusion(
  ...inputs: (RankedResult[] | RRFListOptions)[]
): RankedResult[] {
  const k = 60
  const scores = new Map<string, { result: RankedResult; score: number }>()

  for (const input of inputs) {
    const { list, signal } = isRRFListOptions(input)
      ? input
      : { list: input, signal: 'default' as SignalType }

    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank]
      let rrfScore = 1 / (k + rank + 1)

      // Apply signal-aware weight multiplier
      rrfScore *= getSignalWeight(signal, rank)

      // Top-rank bonus for keyword matches (high exact-match confidence)
      if (signal === 'keyword') {
        if (rank === 0) rrfScore += 0.05
        else if (rank <= 2) rrfScore += 0.02
      }

      const existing = scores.get(item.id)
      if (existing) {
        existing.score += rrfScore
        // Keep the result with the better snippet
        if (item.snippet.length > existing.result.snippet.length) {
          existing.result = item
        }
      } else {
        scores.set(item.id, { result: item, score: rrfScore })
      }
    }
  }

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map(({ result, score }) => ({ ...result, score }))
}

/** Position-aware signal weight — adjusts keyword vs semantic contribution by rank */
function getSignalWeight(signal: SignalType, rank: number): number {
  if (signal === 'default') return 1.0
  if (signal === 'keyword') {
    if (rank < 3) return 0.75
    if (rank < 10) return 0.60
    return 0.40
  }
  // semantic
  if (rank < 3) return 0.25
  if (rank < 10) return 0.40
  return 0.60
}

function isRRFListOptions(input: RankedResult[] | RRFListOptions): input is RRFListOptions {
  return !Array.isArray(input) && 'list' in input && 'signal' in input
}
