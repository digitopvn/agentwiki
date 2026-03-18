/** Markdown content chunker — split by headings with overlap */

export interface Chunk {
  index: number
  text: string
  heading: string | null // parent heading context
}

/** Split markdown by headings, max ~512 tokens (~2000 chars), 150-token overlap (~600 chars) */
export function chunkMarkdown(content: string, maxChars = 2000, overlapChars = 600): Chunk[] {
  if (!content.trim()) return []

  // Split on headings (## or ###)
  const sections = content.split(/^(#{1,3}\s.+)$/m)
  const chunks: Chunk[] = []
  let currentHeading: string | null = null
  let buffer = ''

  for (const section of sections) {
    if (/^#{1,3}\s/.test(section)) {
      // Flush buffer before new heading
      if (buffer.trim()) {
        pushChunks(chunks, buffer.trim(), currentHeading, maxChars, overlapChars)
      }
      currentHeading = section.trim()
      buffer = section + '\n'
    } else {
      buffer += section
    }
  }

  // Flush remaining
  if (buffer.trim()) {
    pushChunks(chunks, buffer.trim(), currentHeading, maxChars, overlapChars)
  }

  // Re-index
  return chunks.map((c, i) => ({ ...c, index: i }))
}

function pushChunks(
  chunks: Chunk[],
  text: string,
  heading: string | null,
  maxChars: number,
  overlapChars: number,
) {
  if (text.length <= maxChars) {
    chunks.push({ index: chunks.length, text, heading })
    return
  }

  // Split long sections into overlapping windows
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length)
    const chunkText = text.slice(start, end)
    chunks.push({ index: chunks.length, text: chunkText.trim(), heading })
    start = end - overlapChars
    if (start >= text.length) break
  }
}
