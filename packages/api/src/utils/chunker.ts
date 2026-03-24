/** Markdown-aware content chunker — heading hierarchy, code block protection, overlap */

export interface Chunk {
  index: number
  text: string
  heading: string | null       // immediate parent heading
  headingChain: string | null  // hierarchy: "## API > ### Auth > #### Tokens"
}

/**
 * Split markdown by structural boundaries with heading chain context.
 * - Never splits inside fenced code blocks
 * - Tracks heading hierarchy chain as metadata
 * - Default ~300 tokens (~1200 chars), ~15% overlap (~180 chars)
 */
export function chunkMarkdown(content: string, maxChars = 1200, overlapChars = 180): Chunk[] {
  if (!content.trim()) return []

  // Pre-process: protect code blocks from splitting
  const { sections } = parseSections(content)
  const chunks: Chunk[] = []

  for (const section of sections) {
    pushChunks(chunks, section.text, section.heading, section.headingChain, maxChars, overlapChars)
  }

  // Re-index
  return chunks.map((c, i) => ({ ...c, index: i }))
}

interface Section {
  text: string
  heading: string | null
  headingChain: string | null
}

/** Parse markdown into sections with heading hierarchy tracking */
function parseSections(content: string): { sections: Section[]; headingStack: string[] } {
  const lines = content.split('\n')
  const sections: Section[] = []
  const headingStack: string[] = [] // [h1, h2, h3, h4, h5, h6]
  let buffer = ''
  let currentHeading: string | null = null
  let inCodeBlock = false
  let fenceChar = '' // tracks which character (` or ~) opened the code block

  for (const line of lines) {
    // Track fenced code blocks — CommonMark requires closing fence matches opener
    const trimmedLine = line.trimStart()
    if (!inCodeBlock && (trimmedLine.startsWith('```') || trimmedLine.startsWith('~~~'))) {
      inCodeBlock = true
      fenceChar = trimmedLine[0]
      buffer += line + '\n'
      continue
    } else if (inCodeBlock && trimmedLine.startsWith(fenceChar.repeat(3))) {
      inCodeBlock = false
      fenceChar = ''
      buffer += line + '\n'
      continue
    }

    // Don't split on headings inside code blocks
    if (inCodeBlock) {
      buffer += line + '\n'
      continue
    }

    // Check for heading (h1-h6)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      // Flush buffer before new heading
      if (buffer.trim()) {
        sections.push({
          text: buffer.trim(),
          heading: currentHeading,
          headingChain: headingStack.length ? headingStack.join(' > ') : null,
        })
      }

      // Update heading stack
      const level = headingMatch[1].length // 1–6
      const headingText = headingMatch[0].trim()
      updateHeadingStack(headingStack, level, headingText)

      currentHeading = headingText
      buffer = line + '\n'
    } else {
      buffer += line + '\n'
    }
  }

  // Flush remaining
  if (buffer.trim()) {
    sections.push({
      text: buffer.trim(),
      heading: currentHeading,
      headingChain: headingStack.length ? headingStack.join(' > ') : null,
    })
  }

  return { sections, headingStack }
}

/** Update heading stack based on level — pop higher-level headings */
function updateHeadingStack(stack: string[], level: number, heading: string) {
  // Pop until we're at the right level
  while (stack.length >= level) {
    stack.pop()
  }
  stack.push(heading)
}

/** Split text into overlapping chunks, respecting maxChars */
function pushChunks(
  chunks: Chunk[],
  text: string,
  heading: string | null,
  headingChain: string | null,
  maxChars: number,
  overlapChars: number,
) {
  if (text.length <= maxChars) {
    chunks.push({ index: chunks.length, text, heading, headingChain })
    return
  }

  // For code-block-heavy sections, try to keep code blocks intact
  if (isCodeBlockHeavy(text) && text.length <= maxChars * 2) {
    // Keep as oversized chunk rather than splitting code
    chunks.push({ index: chunks.length, text, heading, headingChain })
    return
  }

  // Guard: overlap must be less than half of maxChars to prevent infinite loop
  const effectiveOverlap = Math.min(overlapChars, Math.floor(maxChars * 0.5))

  // Split into overlapping windows at paragraph boundaries when possible
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length)
    let splitAt = end

    // Try to split at a paragraph boundary (double newline)
    if (end < text.length) {
      const lastParagraph = text.lastIndexOf('\n\n', end)
      if (lastParagraph > start + maxChars * 0.5) {
        splitAt = lastParagraph + 2
      }
    }

    const chunkText = text.slice(start, splitAt).trim()
    if (chunkText) {
      chunks.push({ index: chunks.length, text: chunkText, heading, headingChain })
    }

    start = splitAt - effectiveOverlap
    if (start >= text.length || splitAt >= text.length) break
  }
}

/** Check if text is predominantly code blocks (backtick or tilde fences) */
function isCodeBlockHeavy(text: string): boolean {
  const backtickCount = (text.match(/```/g) || []).length
  const tildeCount = (text.match(/~~~/g) || []).length
  return (backtickCount + tildeCount) >= 2 // at least one complete code block
}
