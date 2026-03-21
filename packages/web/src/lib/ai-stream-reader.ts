/** SSE stream reader for consuming AI endpoint responses */

/** Read SSE stream from AI endpoints, invoking callbacks for each text chunk */
export async function readAIStream(
  url: string,
  body: unknown,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: Error) => void,
): Promise<void> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'AI request failed' }))
      const message = (data as { error?: string }).error || `HTTP ${res.status}`
      onError(new Error(message))
      return
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') {
          onDone()
          return
        }
        try {
          const parsed = JSON.parse(data) as { text?: string }
          if (parsed.text) onChunk(parsed.text)
        } catch {
          /* skip malformed SSE chunks */
        }
      }
    }

    onDone()
  } catch (err) {
    onError(err instanceof Error ? err : new Error('Stream connection failed'))
  }
}
