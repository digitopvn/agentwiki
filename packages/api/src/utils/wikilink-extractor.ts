/** Extract [[wikilinks]] from markdown content with optional type annotations */

import { EDGE_TYPES, type EdgeType } from '@agentwiki/shared'

export interface ExtractedLink {
  target: string // page title or slug (left side of pipe per wiki convention)
  displayText: string | null // optional display text from [[target|display]]
  context: string // surrounding text for preview
  type: EdgeType | null // optional edge type from [[target|type:depends-on]]
}

const WIKILINK_REGEX = /\[\[([^\]]+)\]\]/g
/** Matches |type:some-type at the end of wikilink inner text */
const TYPE_ANNOTATION_REGEX = /\|type:([a-z-]+)$/

/** Extract all wikilinks from markdown content */
export function extractWikilinks(content: string): ExtractedLink[] {
  const links: ExtractedLink[] = []
  let match: RegExpExecArray | null

  while ((match = WIKILINK_REGEX.exec(content)) !== null) {
    let inner = match[1]
    let type: EdgeType | null = null

    // Check for type annotation at end: [[target|type:depends-on]]
    const typeMatch = inner.match(TYPE_ANNOTATION_REGEX)
    if (typeMatch && (EDGE_TYPES as readonly string[]).includes(typeMatch[1])) {
      type = typeMatch[1] as EdgeType
      inner = inner.slice(0, inner.lastIndexOf('|type:'))
    }

    // Standard wiki convention: [[target|display]] — left is target, right is display
    const pipeIndex = inner.indexOf('|')
    const target = pipeIndex >= 0 ? inner.slice(0, pipeIndex).trim() : inner.trim()
    const displayText = pipeIndex >= 0 ? inner.slice(pipeIndex + 1).trim() : null

    // Extract ~80 chars of surrounding context
    const start = Math.max(0, match.index - 40)
    const end = Math.min(content.length, match.index + match[0].length + 40)
    const context = content.slice(start, end).replace(/\n/g, ' ').trim()

    links.push({ target, displayText, context, type })
  }

  return links
}
