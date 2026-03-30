/** MCP tool result helpers and error mapping */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

/** Create a successful tool result with JSON data */
export function toolResult(data: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  }
}

/** Create a tool error result */
export function toolError(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  }
}

/** Create a text tool result (non-JSON) */
export function toolText(text: string): CallToolResult {
  return {
    content: [{ type: 'text', text }],
  }
}

/** Wrap a tool handler with try/catch error handling */
export async function safeToolCall<T>(
  fn: () => Promise<T>,
  formatResult: (data: T) => CallToolResult = (d) => toolResult(d),
): Promise<CallToolResult> {
  try {
    const data = await fn()
    return formatResult(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return toolError(message)
  }
}
