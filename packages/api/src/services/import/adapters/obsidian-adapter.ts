/** Obsidian vault ZIP adapter — parses .md files, wikilinks, embeds, frontmatter */

import { parseZip, isMarkdownFile, isImageFile, extractDirectories, getFilename, getMimeType } from '../utils/zip-parser'
import { parseFrontmatter, extractTags } from '../utils/markdown-rewriter'
import type { ImportDocument, ImportFolder, ImportAttachment, ImportInternalLink, ImportParseResult } from '@agentwiki/shared'
import type { ImportAdapter } from '../import-types'
import type { Env } from '../../../env'

/** Regex patterns for Obsidian syntax */
const WIKILINK_REGEX = /(?<!!)\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
const EMBED_REGEX = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
const STANDARD_IMAGE_REGEX = /!\[[^\]]*\]\(([^)]+)\)/g

export class ObsidianAdapter implements ImportAdapter {
  async parse(
    _env: Env,
    data: ArrayBuffer | null,
  ): Promise<ImportParseResult> {
    if (!data) throw new Error('ZIP data required for Obsidian import')

    const entries = parseZip(data)

    // Separate markdown files and attachment files
    const mdEntries = entries.filter((e) => isMarkdownFile(e.path))
    const attachmentEntries = entries.filter((e) => !isMarkdownFile(e.path))

    // Build attachment lookup: filename → entry (for ![[filename]] resolution)
    const attachmentByName = new Map<string, typeof entries[0]>()
    const attachmentByPath = new Map<string, typeof entries[0]>()
    for (const entry of attachmentEntries) {
      attachmentByPath.set(entry.path, entry)
      const fname = getFilename(entry.path)
      // Only set by-name if unique; if duplicate, prefer path-based lookup
      if (!attachmentByName.has(fname)) {
        attachmentByName.set(fname, entry)
      }
    }

    // Build folder structure from markdown file paths
    const mdPaths = mdEntries.map((e) => e.path)
    const dirPaths = extractDirectories(mdPaths)
    const folders: ImportFolder[] = dirPaths.map((dirPath) => {
      const parts = dirPath.split('/')
      const name = parts[parts.length - 1]
      const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : undefined
      return { sourcePath: dirPath, name, parentPath }
    })

    // Parse each markdown file
    const documents: ImportDocument[] = []
    const decoder = new TextDecoder()

    for (const entry of mdEntries) {
      const rawText = decoder.decode(entry.data)
      const { frontmatter, body } = parseFrontmatter(rawText)

      // Title: frontmatter title > filename without .md
      const filename = getFilename(entry.path)
      const title = (frontmatter.title as string) ?? filename.replace(/\.md$/i, '')

      // Tags from frontmatter + inline
      const tags = extractTags(frontmatter, body)

      // Parse created date from frontmatter
      const createdAt = parseDate(frontmatter.created ?? frontmatter.date ?? frontmatter.dateCreated)

      // Collect internal wikilinks
      const internalLinks = extractInternalLinks(body, entry.path)

      // Collect attachment references
      const attachments = collectAttachments(body, entry.path, attachmentByName, attachmentByPath)

      documents.push({
        sourcePath: entry.path,
        title,
        content: body,
        tags: tags.length ? tags : undefined,
        createdAt,
        attachments,
        internalLinks,
      })
    }

    return { folders, documents }
  }
}

/** Extract [[wikilink]] references as internal links */
function extractInternalLinks(markdown: string, currentPath: string): ImportInternalLink[] {
  const links: ImportInternalLink[] = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null

  WIKILINK_REGEX.lastIndex = 0
  while ((match = WIKILINK_REGEX.exec(markdown)) !== null) {
    const target = match[1].trim().split('#')[0].trim() // strip heading anchor
    if (!target || seen.has(target)) continue
    seen.add(target)

    // Resolve relative to current file's directory
    const dir = currentPath.includes('/') ? currentPath.substring(0, currentPath.lastIndexOf('/')) : ''
    const targetPath = target.includes('/') ? target : (dir ? `${dir}/${target}` : target)

    links.push({
      ref: match[0],
      targetSourcePath: targetPath.endsWith('.md') ? targetPath : `${targetPath}.md`,
    })
  }

  return links
}

/** Collect image/file attachments referenced in the document */
function collectAttachments(
  markdown: string,
  currentPath: string,
  byName: Map<string, { path: string; data: Uint8Array }>,
  byPath: Map<string, { path: string; data: Uint8Array }>,
): ImportAttachment[] {
  const attachments: ImportAttachment[] = []
  const seen = new Set<string>()
  const dir = currentPath.includes('/') ? currentPath.substring(0, currentPath.lastIndexOf('/')) : ''

  // Obsidian embeds: ![[filename]]
  EMBED_REGEX.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = EMBED_REGEX.exec(markdown)) !== null) {
    const ref = match[1].trim().split('|')[0].trim()
    if (seen.has(ref) || !isImageFile(ref)) continue
    seen.add(ref)

    const entry = byPath.get(dir ? `${dir}/${ref}` : ref) ?? byName.get(ref)
    if (entry) {
      attachments.push({
        sourcePath: entry.path,
        filename: getFilename(entry.path),
        data: (entry.data.buffer as ArrayBuffer).slice(entry.data.byteOffset, entry.data.byteOffset + entry.data.byteLength),
        contentType: getMimeType(entry.path),
      })
    }
  }

  // Standard markdown images: ![alt](path)
  STANDARD_IMAGE_REGEX.lastIndex = 0
  while ((match = STANDARD_IMAGE_REGEX.exec(markdown)) !== null) {
    const imgPath = decodeURIComponent(match[1]).replace(/^\.\//, '')
    if (seen.has(imgPath) || imgPath.startsWith('http')) continue
    seen.add(imgPath)

    const fullPath = dir ? `${dir}/${imgPath}` : imgPath
    const entry = byPath.get(fullPath) ?? byName.get(getFilename(imgPath))
    if (entry) {
      attachments.push({
        sourcePath: entry.path,
        filename: getFilename(entry.path),
        data: (entry.data.buffer as ArrayBuffer).slice(entry.data.byteOffset, entry.data.byteOffset + entry.data.byteLength),
        contentType: getMimeType(entry.path),
      })
    }
  }

  return attachments
}

/** Parse date from frontmatter value */
function parseDate(value: unknown): number | undefined {
  if (!value) return undefined
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const ts = Date.parse(value)
    return isNaN(ts) ? undefined : ts
  }
  return undefined
}
