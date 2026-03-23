/** Reciprocal Rank Fusion — combine multiple ranked result lists */

export interface RankedResult {
  id: string
  title: string
  slug: string
  snippet: string
  score?: number
  category?: string
}

/**
 * Fuse multiple ranked lists via RRF.
 * score(doc) = Σ 1/(k + rank_i)
 * Default k=60 per original paper.
 */
export function reciprocalRankFusion(
  ...lists: RankedResult[][]
): RankedResult[] {
  const k = 60
  const scores = new Map<string, { result: RankedResult; score: number }>()

  for (const list of lists) {
    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank]
      const rrfScore = 1 / (k + rank + 1) // rank is 0-indexed, formula uses 1-indexed

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
