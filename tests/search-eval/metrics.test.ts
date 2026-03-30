import { describe, it, expect } from 'vitest'
import { mrr, precisionAtK, recallAtK, ndcg, percentile } from './metrics'

describe('mrr', () => {
  it('returns 1.0 when first result is relevant', () => {
    expect(mrr(['a', 'b', 'c'], ['a'])).toBe(1)
  })

  it('returns 0.5 when relevant result is at rank 2', () => {
    expect(mrr(['x', 'a', 'b'], ['a'])).toBe(0.5)
  })

  it('returns 0.333 when relevant result is at rank 3', () => {
    expect(mrr(['x', 'y', 'a'], ['a'])).toBeCloseTo(1 / 3)
  })

  it('returns 0 when no relevant result in top K', () => {
    expect(mrr(['x', 'y', 'z'], ['a'], 3)).toBe(0)
  })

  it('finds first match among multiple expected', () => {
    expect(mrr(['x', 'b', 'a'], ['a', 'b'])).toBe(0.5) // b at rank 2
  })

  it('respects K limit', () => {
    expect(mrr(['x', 'y', 'z', 'a'], ['a'], 3)).toBe(0) // a at rank 4, K=3
  })
})

describe('precisionAtK', () => {
  it('returns 1.0 when all top-K are relevant', () => {
    expect(precisionAtK(['a', 'b', 'c'], ['a', 'b', 'c'], 3)).toBe(1)
  })

  it('returns 0.667 when 2/3 top results are relevant', () => {
    expect(precisionAtK(['a', 'x', 'b'], ['a', 'b'], 3)).toBeCloseTo(2 / 3)
  })

  it('returns 0 when no top-K results are relevant', () => {
    expect(precisionAtK(['x', 'y', 'z'], ['a', 'b'], 3)).toBe(0)
  })

  it('handles empty results', () => {
    expect(precisionAtK([], ['a'], 3)).toBe(0)
  })
})

describe('recallAtK', () => {
  it('returns 1.0 when all expected found', () => {
    expect(recallAtK(['a', 'b', 'c', 'x'], ['a', 'b'], 10)).toBe(1)
  })

  it('returns 0.5 when half of expected found', () => {
    expect(recallAtK(['a', 'x', 'y'], ['a', 'b'], 10)).toBe(0.5)
  })

  it('returns 1.0 for empty expected set', () => {
    expect(recallAtK(['x', 'y'], [], 10)).toBe(1)
  })
})

describe('ndcg', () => {
  it('returns 1.0 for perfect ranking', () => {
    const result = ndcg(['a', 'b', 'c'], ['a', 'b', 'c'], [3, 2, 1], 3)
    expect(result).toBeCloseTo(1)
  })

  it('returns <1 for imperfect ranking', () => {
    const result = ndcg(['c', 'a', 'b'], ['a', 'b', 'c'], [3, 2, 1], 3)
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThan(1)
  })

  it('returns 0 when no relevant results', () => {
    expect(ndcg(['x', 'y', 'z'], ['a', 'b'], undefined, 3)).toBe(0)
  })

  it('uses binary relevance when grades not provided', () => {
    const result = ndcg(['a', 'x', 'b'], ['a', 'b'], undefined, 3)
    expect(result).toBeGreaterThan(0)
  })
})

describe('percentile', () => {
  it('computes p50 (median)', () => {
    expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30)
  })

  it('computes p95', () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1)
    expect(percentile(sorted, 95)).toBe(95)
  })

  it('handles empty array', () => {
    expect(percentile([], 50)).toBe(0)
  })

  it('handles single element', () => {
    expect(percentile([42], 50)).toBe(42)
  })
})
