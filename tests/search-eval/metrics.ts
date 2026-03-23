/**
 * Search quality metrics — MRR@K, Precision@K, NDCG@K
 *
 * References:
 *  - Weaviate: https://weaviate.io/blog/retrieval-evaluation-metrics
 *  - Pinecone: https://www.pinecone.io/learn/offline-evaluation/
 */

/** Mean Reciprocal Rank — position of first relevant result in top K */
export function mrr(resultIds: string[], expectedIds: string[], k = 5): number {
  const topK = resultIds.slice(0, k)
  for (let i = 0; i < topK.length; i++) {
    if (expectedIds.includes(topK[i])) {
      return 1 / (i + 1)
    }
  }
  return 0
}

/** Precision@K — fraction of top-K results that are relevant */
export function precisionAtK(resultIds: string[], expectedIds: string[], k = 3): number {
  const topK = resultIds.slice(0, k)
  if (topK.length === 0) return 0
  const relevant = topK.filter((id) => expectedIds.includes(id))
  return relevant.length / k
}

/** Recall@K — fraction of expected docs found in top-K results */
export function recallAtK(resultIds: string[], expectedIds: string[], k = 10): number {
  if (expectedIds.length === 0) return 1 // no expected = trivially recalled
  const topK = resultIds.slice(0, k)
  const found = expectedIds.filter((id) => topK.includes(id))
  return found.length / expectedIds.length
}

/**
 * NDCG@K — Normalized Discounted Cumulative Gain
 * Uses graded relevance (0=irrelevant, 1=partial, 2=relevant, 3=perfect)
 */
export function ndcg(
  resultIds: string[],
  expectedIds: string[],
  relevanceGrades?: number[],
  k = 10,
): number {
  // If no explicit grades, use binary: expected=1, not expected=0
  const gradeMap = new Map<string, number>()
  if (relevanceGrades && relevanceGrades.length === expectedIds.length) {
    expectedIds.forEach((id, i) => gradeMap.set(id, relevanceGrades[i]))
  } else {
    expectedIds.forEach((id) => gradeMap.set(id, 1))
  }

  // DCG of actual results
  const topK = resultIds.slice(0, k)
  const dcgVal = topK.reduce((sum, id, i) => {
    const grade = gradeMap.get(id) ?? 0
    return sum + (Math.pow(2, grade) - 1) / Math.log2(i + 2)
  }, 0)

  // Ideal DCG — sort grades descending
  const idealGrades = Array.from(gradeMap.values())
    .sort((a, b) => b - a)
    .slice(0, k)
  const idcgVal = idealGrades.reduce((sum, g, i) => {
    return sum + (Math.pow(2, g) - 1) / Math.log2(i + 2)
  }, 0)

  return idcgVal === 0 ? 0 : dcgVal / idcgVal
}

/** Compute percentile from sorted array */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}
