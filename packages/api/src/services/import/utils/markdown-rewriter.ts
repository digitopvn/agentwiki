/** Rewrite markdown links and embeds for imported documents */

/** Replace standard markdown image links with new URLs */
export function rewriteImageLinks(
  markdown: string,
  imageMap: Map<string, string>,
): string {
  // Match ![alt](path) — non-greedy on path
  return markdown.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (match, alt, originalPath) => {
      const normalized = normalizePath(originalPath)
      const newUrl = imageMap.get(normalized) ?? imageMap.get(decodeURIComponent(normalized))
      if (newUrl) return `![${alt}](${newUrl})`
      return match
    },
  )
}

/** Convert Obsidian ![[embed]] syntax to standard markdown images */
export function rewriteObsidianEmbeds(
  markdown: string,
  imageMap: Map<string, string>,
): string {
  // Match ![[filename]] or ![[filename|width]]
  return markdown.replace(
    /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g,
    (_match, filename) => {
      const trimmed = filename.trim()
      // Try exact match first, then just filename
      const newUrl = imageMap.get(trimmed)
        ?? findByFilename(imageMap, trimmed)
      if (newUrl) return `![${trimmed}](${newUrl})`
      return `![${trimmed}]()`
    },
  )
}

/** Convert Obsidian [[wikilinks]] to AgentWiki format */
export function rewriteWikilinks(
  markdown: string,
  slugMap: Map<string, string>,
): string {
  // Match [[target]] or [[target|alias]] but NOT ![[embeds]]
  return markdown.replace(
    /(?<!!)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_match, target, alias) => {
      const trimmed = target.trim()
      // Strip heading anchors: [[page#heading]] → page
      const pageName = trimmed.split('#')[0].trim()
      const slug = slugMap.get(pageName) ?? slugMap.get(pageName.toLowerCase())
      const display = alias?.trim() ?? trimmed
      if (slug) return `[[${slug}|${display}]]`
      return `[[${display}]]`
    },
  )
}

/** Strip Notion's UUID suffix from filenames */
export function stripNotionUUID(name: string): string {
  // Notion appends 32-char hex: "Page Title abc123def456789012345678901234"
  return name.replace(/\s+[a-f0-9]{32}$/i, '').trim()
}

/** Parse YAML frontmatter from markdown */
export function parseFrontmatter(markdown: string): {
  frontmatter: Record<string, unknown>
  body: string
} {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: markdown }

  const yamlText = match[1]
  const body = match[2]
  const frontmatter: Record<string, unknown> = {}

  // Simple YAML parser for common fields (tags, title, date, aliases)
  for (const line of yamlText.split('\n')) {
    const kv = line.match(/^(\w+)\s*:\s*(.+)$/)
    if (!kv) continue
    const [, key, rawValue] = kv
    let value: unknown = rawValue.trim()

    // Parse arrays: [item1, item2] or - item
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''))
    }

    frontmatter[key] = value
  }

  return { frontmatter, body }
}

/** Extract tags from frontmatter and inline #tags */
export function extractTags(frontmatter: Record<string, unknown>, content: string): string[] {
  const tags = new Set<string>()

  // From frontmatter
  const fmTags = frontmatter.tags
  if (Array.isArray(fmTags)) {
    fmTags.forEach((t) => { if (typeof t === 'string') tags.add(t) })
  } else if (typeof fmTags === 'string') {
    tags.add(fmTags)
  }

  // From inline #tags (only at word boundary, not inside URLs or code)
  const inlineMatches = content.match(/(?:^|\s)#([a-zA-Z][\w-]{0,49})/g)
  if (inlineMatches) {
    inlineMatches.forEach((m) => tags.add(m.trim().slice(1)))
  }

  return [...tags].slice(0, 20) // max 20 tags per AgentWiki schema
}

// --- helpers ---

function normalizePath(p: string): string {
  return decodeURIComponent(p).replace(/\\/g, '/').replace(/^\.\//, '')
}

function findByFilename(map: Map<string, string>, filename: string): string | undefined {
  for (const [key, value] of map) {
    if (key.endsWith('/' + filename) || key === filename) return value
  }
  return undefined
}
