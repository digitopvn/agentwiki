/** Trigram extraction utilities for fuzzy search indexing */

import { STOP_WORDS } from './stop-words'

/** Tokenize text into lowercase words, remove punctuation, stop words, and short words */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
}

/** Generate character trigrams from a single word */
export function wordTrigrams(word: string): string[] {
  if (word.length < 3) return [word]
  const trigrams: string[] = []
  for (let i = 0; i <= word.length - 3; i++) {
    trigrams.push(word.slice(i, i + 3))
  }
  return trigrams
}

/** Extract unique trigrams from text with frequency counts */
export function extractTrigrams(text: string): Map<string, number> {
  const words = tokenize(text)
  const freqMap = new Map<string, number>()
  for (const word of words) {
    for (const tri of wordTrigrams(word)) {
      freqMap.set(tri, (freqMap.get(tri) ?? 0) + 1)
    }
  }
  return freqMap
}
