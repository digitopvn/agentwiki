/** OpenAI Chat Completions API adapter */

import type { AIRequest, AIResponse } from '@agentwiki/shared'
import type { AIProvider } from '../ai-provider-interface'
import { parseSSEStream } from '../ai-provider-interface'

const BASE_URL = 'https://api.openai.com/v1/chat/completions'

export class OpenAIAdapter implements AIProvider {
  readonly id = 'openai'
  readonly name = 'OpenAI'

  async generateText(apiKey: string, req: AIRequest): Promise<AIResponse> {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        max_tokens: req.maxTokens,
        temperature: req.temperature ?? 0.7,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI API error ${res.status}: ${err}`)
    }

    const data = (await res.json()) as {
      choices: { message: { content: string } }[]
      usage: { prompt_tokens: number; completion_tokens: number }
      model: string
    }

    return {
      content: data.choices[0]?.message?.content || '',
      model: data.model,
      tokensUsed: {
        input: data.usage?.prompt_tokens || 0,
        output: data.usage?.completion_tokens || 0,
      },
    }
  }

  async streamText(apiKey: string, req: AIRequest): Promise<ReadableStream<Uint8Array>> {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        max_tokens: req.maxTokens,
        temperature: req.temperature ?? 0.7,
        stream: true,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI API error ${res.status}: ${err}`)
    }

    return parseSSEStream(res, (data) => {
      const chunk = data as { choices: { delta: { content?: string } }[] }
      return chunk.choices?.[0]?.delta?.content || null
    })
  }
}
