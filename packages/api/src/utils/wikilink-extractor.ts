/** Extract [[wikilinks]] and standard markdown internal links from content */

import { EDGE_TYPES, type EdgeType } from '@agentwiki/shared'

export interface ExtractedLink {
  target: string // page title or slug
  displayText: string | null // optional display text
  context: string // surrounding text for preview
  type: EdgeType | null // optional edge type annotation
}

/** Matches |type:some-type at the end of wikilink inner text */
const TYPE_ANNOTATION_REGEX = /\|type:([a-z-]+)$/

/** Safe decodeURIComponent — falls back to raw value on malformed percent sequences */
function tryDecodeURI(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Extract surrounding ~80 chars of context around a match */
function extractContext(content: string, matchIndex: number, matchLength: number): string {
  const start = Math.max(0, matchIndex - 40)
  const end = Math.min(content.length, matchIndex + matchLength + 40)
  return content.slice(start, end).replace(/\n/g, ' ').trim()
}

/** Extract all [[wikilinks]] from markdown content */
export function extractWikilinks(content: string): ExtractedLink[] {
  const links: ExtractedLink[] = []

  // Create regex inside function to avoid shared lastIndex state across calls
  for (const match of content.matchAll(/\[\[([^\]]+)\]\]/g)) {
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
    const context = extractContext(content, match.index!, match[0].length)

    links.push({ target, displayText, context, type })
  }

  return links
}

/** Extract standard markdown links pointing to internal docs: [text](/doc/slug) */
export function extractInternalLinks(content: string): ExtractedLink[] {
  const links: ExtractedLink[] = []

  // Create regex inside function to avoid shared lastIndex state across calls
  for (const match of content.matchAll(/\[([^\]]*)\]\(\/doc\/([^)]+)\)/g)) {
    const displayText = match[1] || null
    // Decode URL-encoded chars (%20 etc.) and strip query params/hash
    const rawTarget = match[2].trim().split(/[?#]/)[0]
    const target = tryDecodeURI(rawTarget)
    const context = extractContext(content, match.index!, match[0].length)

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
