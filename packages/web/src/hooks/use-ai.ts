/** Hook for AI generation and transformation with streaming support */

import { useState, useCallback } from 'react'
import { readAIStream } from '../lib/ai-stream-reader'
import type { AIGenerateBody, AITransformBody } from '@agentwiki/shared'

export function useAI() {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Call /api/ai/generate and stream text chunks to callback */
  const generate = useCallback(async (body: AIGenerateBody, onChunk: (text: string) => void) => {
    setIsGenerating(true)
    setError(null)
    await readAIStream(
      '/api/ai/generate',
      body,
      onChunk,
      () => setIsGenerating(false),
      (err) => {
        setError(err.message)
        setIsGenerating(false)
      },
    )
  }, [])

  /** Call /api/ai/transform and stream text chunks to callback */
  const transform = useCallback(async (body: AITransformBody, onChunk: (text: string) => void) => {
    setIsGenerating(true)
    setError(null)
    await readAIStream(
      '/api/ai/transform',
      body,
      onChunk,
      () => setIsGenerating(false),
      (err) => {
        setError(err.message)
        setIsGenerating(false)
      },
    )
  }, [])

  /** Clear error state */
  const clearError = useCallback(() => setError(null), [])

  return { isGenerating, error, generate, transform, clearError }
}
