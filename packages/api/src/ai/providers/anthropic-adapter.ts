/** Anthropic Messages API adapter */

import type { AIRequest, AIResponse } from '@agentwiki/shared'
import type { AIProvider } from '../ai-provider-interface'
import { parseSSEStream } from '../ai-provider-interface'

const BASE_URL = 'https://api.anthropic.com/v1/messages'

export class AnthropicAdapter implements AIProvider {
  readonly id = 'anthropic'
  readonly name = 'Anthropic'

  async generateText(apiKey: string, req: AIRequest): Promise<AIResponse> {
    const { system, messages } = extractSystemMessage(req)

    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens,
        ...(system && { system }),
        messages,
        temperature: req.temperature ?? 0.7,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Anthropic API error ${res.status}: ${err}`)
    }

    const data = (await res.json()) as {
      content: { type: string; text: string }[]
      usage: { input_tokens: number; output_tokens: number }
      model: string
    }

    return {
      content: data.content?.find((b) => b.type === 'text')?.text || '',
      model: data.model,
      tokensUsed: {
        input: data.usage?.input_tokens || 0,
        output: data.usage?.output_tokens || 0,
      },
    }
  }

  async streamText(apiKey: string, req: AIRequest): Promise<ReadableStream<Uint8Array>> {
    const { system, messages } = extractSystemMessage(req)

    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens,
        ...(system && { system }),
        messages,
        temperature: req.temperature ?? 0.7,
        stream: true,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Anthropic API error ${res.status}: ${err}`)
    }

    return parseSSEStream(res, (data) => {
      const event = data as { type: string; delta?: { type: string; text?: string } }
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        return event.delta.text || null
      }
      return null
    })
  }
}

/** Anthropic requires system message as top-level param, not in messages array */
function extractSystemMessage(req: AIRequest) {
  const systemMsg = req.messages.find((m) => m.role === 'system')
  const messages = req.messages.filter((m) => m.role !== 'system')
  return { system: systemMsg?.content, messages }
}
