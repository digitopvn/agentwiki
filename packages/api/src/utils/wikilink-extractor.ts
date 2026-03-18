/** Extract [[wikilinks]] from markdown content */

export interface ExtractedLink {
  target: string // page title or slug
  displayText: string | null // optional display text from [[display|target]]
  context: string // surrounding text for preview
}

const WIKILINK_REGEX = /\[\[([^\]]+)\]\]/g

/** Extract all wikilinks from markdown content */
export function extractWikilinks(content: string): ExtractedLink[] {
  const links: ExtractedLink[] = []
  let match: RegExpExecArray | null

  while ((match = WIKILINK_REGEX.exec(content)) !== null) {
    const inner = match[1]
    const pipeIndex = inner.indexOf('|')

    const target = pipeIndex >= 0 ? inner.slice(pipeIndex + 1).trim() : inner.trim()
    const displayText = pipeIndex >= 0 ? inner.slice(0, pipeIndex).trim() : null

    // Extract ~80 chars of surrounding context
    const start = Math.max(0, match.index - 40)
    const end = Math.min(content.length, match.index + match[0].length + 40)
    const context = content.slice(start, end).replace(/\n/g, ' ').trim()

    links.push({ target, displayText, context })
  }

  return links
}
