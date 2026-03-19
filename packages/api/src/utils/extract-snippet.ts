/** Extract a text snippet around the query match for search results */
export function extractSnippet(content: string, query: string, length = 150): string {
  const lower = content.toLowerCase()
  const queryLower = query.toLowerCase()
  const idx = lower.indexOf(queryLower)

  if (idx === -1) return content.slice(0, length) + (content.length > length ? '...' : '')

  const start = Math.max(0, idx - 60)
  const end = Math.min(content.length, idx + query.length + 60)
  let snippet = content.slice(start, end).replace(/\n/g, ' ').trim()

  if (start > 0) snippet = '...' + snippet
  if (end < content.length) snippet += '...'

  return snippet
}
