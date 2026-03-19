/** Common interface for all AI provider adapters */

import type { AIRequest, AIResponse } from '@agentwiki/shared'

/** Each AI provider must implement this interface */
export interface AIProvider {
  readonly id: string
  readonly name: string
  generateText(apiKey: string, req: AIRequest): Promise<AIResponse>
  streamText(apiKey: string, req: AIRequest): Promise<ReadableStream<Uint8Array>>
}

/**
 * Parse SSE stream from AI provider into text chunks.
 * Handles standard "data: {json}\n\n" format with [DONE] sentinel.
 * @param response - fetch Response with SSE body
 * @param extractContent - extract text content from parsed SSE data object
 */
export function parseSSEStream(
  response: Response,
  extractContent: (data: unknown) => string | null,
): ReadableStream<Uint8Array> {
  if (!response.body) throw new Error('AI provider returned empty response body')
  const reader = response.body.getReader()
  const textDecoder = new TextDecoder()
  const textEncoder = new TextEncoder()
  let buffer = ''

  return new ReadableStream({
    cancel() {
      reader.cancel()
    },
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) {
        controller.close()
        return
      }

      buffer += textDecoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') {
          controller.close()
          return
        }
        try {
          const parsed = JSON.parse(data)
          const content = extractContent(parsed)
          if (content) controller.enqueue(textEncoder.encode(content))
        } catch {
          /* skip malformed SSE chunks */
        }
      }
    },
  })
}
