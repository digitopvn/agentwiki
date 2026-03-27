/** Extract [[wikilinks]] and standard markdown internal links from content */

import { EDGE_TYPES, type EdgeType } from '@agentwiki/shared'

export interface ExtractedLink {
  target: string // page title or slug
  displayText: string | null // optional display text
  context: string // surrounding text for preview
  type: EdgeType | null // optional edge type annotation
}

const WIKILINK_REGEX = /\[\[([^\]]+)\]\]/g
/** Matches |type:some-type at the end of wikilink inner text */
const TYPE_ANNOTATION_REGEX = /\|type:([a-z-]+)$/
/** Matches standard markdown links to internal docs: [text](/doc/slug-or-id) */
const INTERNAL_LINK_REGEX = /\[([^\]]*)\]\(\/doc\/([^)]+)\)/g

/** Extract all [[wikilinks]] from markdown content */
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

    const start = Math.max(0, match.index - 40)
    const end = Math.min(content.length, match.index + match[0].length + 40)
    const context = content.slice(start, end).replace(/\n/g, ' ').trim()

    links.push({ target, displayText, context, type })
  }

  return links
}

/** Extract standard markdown links pointing to internal docs: [text](/doc/slug) */
export function extractInternalLinks(content: string): ExtractedLink[] {
  const links: ExtractedLink[] = []
  let match: RegExpExecArray | null

  while ((match = INTERNAL_LINK_REGEX.exec(content)) !== null) {
    const displayText = match[1] || null
    // Decode URL-encoded chars (%20 etc.) and strip query params/hash
    const rawTarget = match[2].trim().split(/[?#]/)[0]
    const target = decodeURIComponent(rawTarget)

    const start = Math.max(0, match.index - 40)
    const end = Math.min(content.length, match.index + match[0].length + 40)
    const context = content.slice(start, end).replace(/\n/g, ' ').trim()

    links.push({ target, displayText, context, type: null })
  }

  return links
}

/** Extract all links (wikilinks + internal markdown links), deduplicated by target */
export function extractAllLinks(content: string): ExtractedLink[] {
  const wikilinks = extractWikilinks(content)
  const internalLinks = extractInternalLinks(content)

  // Dedup: wikilinks take priority (support type annotations)
  const seen = new Set(wikilinks.map((l) => l.target.toLowerCase()))
  const merged = [...wikilinks]
  for (const link of internalLinks) {
    if (!seen.has(link.target.toLowerCase())) {
      seen.add(link.target.toLowerCase())
      merged.push(link)
    }
  }

  return merged
}
