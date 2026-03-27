/** Notion export ZIP adapter — parses Notion markdown export format */

import { parseZip, isMarkdownFile, extractDirectories, getFilename, getMimeType, isImageFile } from '../utils/zip-parser'
import { stripNotionUUID } from '../utils/markdown-rewriter'
import type { ImportDocument, ImportFolder, ImportAttachment, ImportInternalLink, ImportParseResult } from '@agentwiki/shared'
import type { ImportAdapter } from '../import-types'
import type { Env } from '../../../env'

/** Regex for Notion's internal markdown links */
const RELATIVE_LINK_REGEX = /\[([^\]]+)\]\(([^)]+\.md)\)/g
const IMAGE_LINK_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g

export class NotionAdapter implements ImportAdapter {
  async parse(
    _env: Env,
    data: ArrayBuffer | null,
  ): Promise<ImportParseResult> {
    if (!data) throw new Error('ZIP data required for Notion import')

    const entries = parseZip(data)

    // Detect and strip common root directory prefix (Notion wraps in Export-xxx/)
    const rootPrefix = detectRootPrefix(entries.map((e) => e.path))

    // Separate markdown, CSV, and attachment entries
    const mdEntries = entries.filter((e) => isMarkdownFile(e.path))
    const csvEntries = entries.filter((e) => e.path.toLowerCase().endsWith('.csv'))
    const attachmentEntries = entries.filter((e) => !isMarkdownFile(e.path) && !e.path.endsWith('.csv'))

    // Build attachment lookup by path
    const attachmentByPath = new Map<string, typeof entries[0]>()
    for (const entry of attachmentEntries) {
      attachmentByPath.set(stripPrefix(entry.path, rootPrefix), entry)
    }

    // Build folder structure (strip UUIDs from folder names)
    const allPaths = mdEntries.map((e) => stripPrefix(e.path, rootPrefix))
    const dirPaths = extractDirectories(allPaths)
    const folders: ImportFolder[] = dirPaths.map((dirPath) => {
      const parts = dirPath.split('/')
      const rawName = parts[parts.length - 1]
      const name = stripNotionUUID(rawName)
      const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : undefined
      return { sourcePath: dirPath, name, parentPath }
    })

    // Parse markdown files
    const documents: ImportDocument[] = []
    const decoder = new TextDecoder()

    for (const entry of mdEntries) {
      const relPath = stripPrefix(entry.path, rootPrefix)
      const rawText = decoder.decode(entry.data)

      // Title: filename without UUID and .md extension
      const filename = getFilename(relPath)
      const title = stripNotionUUID(filename.replace(/\.md$/i, ''))

      // Collect internal links (relative .md links)
      const internalLinks = extractNotionLinks(rawText, relPath, rootPrefix)

      // Collect image attachments
      const attachments = collectNotionAttachments(rawText, relPath, attachmentByPath)

      documents.push({
        sourcePath: relPath,
        title,
        content: rawText,
        attachments,
        internalLinks,
      })
    }

    // Convert CSV database exports to markdown documents
    for (const entry of csvEntries) {
      const relPath = stripPrefix(entry.path, rootPrefix)
      const rawText = decoder.decode(entry.data)
      const title = stripNotionUUID(getFilename(relPath).replace(/\.csv$/i, ''))
      const markdownTable = csvToMarkdownTable(rawText)

      if (markdownTable) {
        documents.push({
          sourcePath: relPath.replace(/\.csv$/i, '.md'),
          title,
          content: `# ${title}\n\n${markdownTable}`,
          tags: ['database'],
          attachments: [],
          internalLinks: [],
        })
      }
    }

    return { folders, documents }
  }
}

/** Detect common root prefix directory in ZIP entries */
function detectRootPrefix(paths: string[]): string {
  if (!paths.length) return ''

  // Collect first-level directory candidates from ALL paths
  const candidates = new Set<string>()
  for (const p of paths) {
    const slashIdx = p.indexOf('/')
    if (slashIdx === -1) return '' // file at root → no common prefix
    candidates.add(p.substring(0, slashIdx + 1))
  }

  // Only valid if all paths share the same single root directory
  if (candidates.size !== 1) return ''
  const prefix = [...candidates][0]
  // Double-check every path actually starts with this prefix
  if (paths.every((p) => p.startsWith(prefix))) return prefix
  return ''
}

function stripPrefix(path: string, prefix: string): string {
  return prefix && path.startsWith(prefix) ? path.slice(prefix.length) : path
}

/** Extract relative markdown links as internal links */
function extractNotionLinks(markdown: string, currentPath: string, rootPrefix: string): ImportInternalLink[] {
  const links: ImportInternalLink[] = []
  const seen = new Set<string>()
  const dir = currentPath.includes('/') ? currentPath.substring(0, currentPath.lastIndexOf('/')) : ''

  RELATIVE_LINK_REGEX.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = RELATIVE_LINK_REGEX.exec(markdown)) !== null) {
    const rawPath = decodeURIComponent(match[2]).replace(/^\.\//, '')
    if (seen.has(rawPath)) continue
    seen.add(rawPath)

    const targetPath = rawPath.startsWith('/') ? rawPath.slice(1) : (dir ? `${dir}/${rawPath}` : rawPath)
    const normalized = stripPrefix(targetPath, rootPrefix)

    links.push({ ref: match[0], targetSourcePath: normalized })
  }

  return links
}

/** Collect image attachments from Notion markdown */
function collectNotionAttachments(
  markdown: string,
  currentPath: string,
  byPath: Map<string, { path: string; data: Uint8Array }>,
): ImportAttachment[] {
  const attachments: ImportAttachment[] = []
  const seen = new Set<string>()
  const dir = currentPath.includes('/') ? currentPath.substring(0, currentPath.lastIndexOf('/')) : ''

  IMAGE_LINK_REGEX.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = IMAGE_LINK_REGEX.exec(markdown)) !== null) {
    const imgPath = decodeURIComponent(match[2]).replace(/^\.\//, '')
    if (seen.has(imgPath) || imgPath.startsWith('http')) continue
    seen.add(imgPath)

    if (!isImageFile(imgPath)) continue

    const fullPath = dir ? `${dir}/${imgPath}` : imgPath
    const entry = byPath.get(fullPath)
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

/** Convert CSV text to a markdown table */
function csvToMarkdownTable(csv: string): string | null {
  const lines = csv.trim().split('\n')
  if (lines.length < 2) return null

  const parseRow = (line: string): string[] => {
    // RFC 4180 CSV parser (handles "" escape sequences inside quoted fields)
    const fields: string[] = []
    let current = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (inQuote) {
        if (char === '"') {
          // Peek next char: "" is an escaped quote, otherwise end of quoted field
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"'
            i++ // skip the second quote
          } else {
            inQuote = false
          }
        } else {
          current += char
        }
      } else {
        if (char === '"') {
          inQuote = true
        } else if (char === ',') {
          fields.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
    }
    fields.push(current.trim())
    return fields
  }

  const headers = parseRow(lines[0])
  const rows = lines.slice(1, 501).map(parseRow) // max 500 rows

  const header = `| ${headers.join(' | ')} |`
  const separator = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n')

  let table = `${header}\n${separator}\n${body}`
  if (lines.length > 501) {
    table += `\n\n*Truncated: showing 500 of ${lines.length - 1} rows*`
  }
  return table
}
