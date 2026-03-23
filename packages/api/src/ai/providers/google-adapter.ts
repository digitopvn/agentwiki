/** Google Gemini generateContent API adapter */

import type { AIRequest, AIResponse } from '@agentwiki/shared'
import type { AIProvider } from '../ai-provider-interface'
import { parseSSEStream } from '../ai-provider-interface'

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

export class GoogleAdapter implements AIProvider {
  readonly id = 'google'
  readonly name = 'Google Gemini'

  async generateText(apiKey: string, req: AIRequest): Promise<AIResponse> {
    // Google's documented auth: API key in query param (server-side only, not exposed to browser)
    const url = `${BASE_URL}/${req.model}:generateContent?key=${apiKey}`
    const { systemInstruction, contents } = convertMessages(req)

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(systemInstruction && { systemInstruction }),
        contents,
        generationConfig: {
          maxOutputTokens: req.maxTokens,
          temperature: req.temperature ?? 0.7,
        },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Google Gemini API error ${res.status}: ${err}`)
    }

    const data = (await res.json()) as {
      candidates: { content: { parts: { text: string }[] } }[]
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number }
    }

    return {
      content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      model: req.model,
      tokensUsed: {
        input: data.usageMetadata?.promptTokenCount || 0,
        output: data.usageMetadata?.candidatesTokenCount || 0,
      },
    }
  }

  async streamText(apiKey: string, req: AIRequest): Promise<ReadableStream<Uint8Array>> {
    const url = `${BASE_URL}/${req.model}:streamGenerateContent?alt=sse&key=${apiKey}`
    const { systemInstruction, contents } = convertMessages(req)

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(systemInstruction && { systemInstruction }),
        contents,
        generationConfig: {
          maxOutputTokens: req.maxTokens,
          temperature: req.temperature ?? 0.7,
        },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Google Gemini API error ${res.status}: ${err}`)
    }

    return parseSSEStream(res, (data) => {
      const chunk = data as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
      return chunk.candidates?.[0]?.content?.parts?.[0]?.text || null
    })
  }
}

/** Convert OpenAI-style messages to Gemini format */
function convertMessages(req: AIRequest) {
  const systemMsg = req.messages.find((m) => m.role === 'system')
  const systemInstruction = systemMsg
    ? { parts: [{ text: systemMsg.content }] }
    : undefined

  const contents = req.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

  return { systemInstruction, contents }
}
