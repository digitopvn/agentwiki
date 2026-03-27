/** LarkSuite adapter — fetches documents via Lark Open API and converts to markdown */

import type { ImportDocument, ImportFolder, ImportAttachment, ImportParseResult } from '@agentwiki/shared'
import type { ImportAdapter } from '../import-types'
import type { Env } from '../../../env'
import { getMimeType } from '../utils/zip-parser'

const LARK_API = 'https://open.larksuite.com/open-apis'
const DELAY_MS = 100 // delay between API calls to respect rate limits

interface LarkFile {
  token: string
  name: string
  type: string
  parent_token?: string
}

interface LarkBlock {
  block_id: string
  block_type: number
  parent_id: string
  children: string[]
  text?: { elements: LarkTextElement[] }
  heading1?: { elements: LarkTextElement[] }
  heading2?: { elements: LarkTextElement[] }
  heading3?: { elements: LarkTextElement[] }
  heading4?: { elements: LarkTextElement[] }
  bullet?: { elements: LarkTextElement[] }
  ordered?: { elements: LarkTextElement[] }
  code?: { elements: LarkTextElement[]; style?: { language: number } }
  quote?: { elements: LarkTextElement[] }
  todo?: { elements: LarkTextElement[]; style?: { done: boolean } }
  image?: { token: string; width?: number; height?: number }
  divider?: Record<string, unknown>
  callout?: { elements: LarkTextElement[]; emoji_id?: string }
  table?: { cells: string[][] }
}

interface LarkTextElement {
  text_run?: { content: string; text_element_style?: LarkTextStyle }
  mention_doc?: { token: string; title: string }
  equation?: { content: string }
}

interface LarkTextStyle {
  bold?: boolean
  italic?: boolean
  strikethrough?: boolean
  inline_code?: boolean
  link?: { url: string }
}

export class LarkAdapter implements ImportAdapter {
  async parse(
    _env: Env,
    _data: ArrayBuffer | null,
    config?: Record<string, unknown>,
  ): Promise<ImportParseResult> {
    const token = config?.token as string
    const spaceId = config?.spaceId as string | undefined
    if (!token) throw new Error('Lark access token required')

    // List files in root or specific folder
    const rootToken = spaceId ?? ''
    const allFiles = await listFilesRecursive(token, rootToken)

    // Separate folders from documents
    const folderFiles = allFiles.filter((f) => f.type === 'folder')
    const docFiles = allFiles.filter((f) => f.type === 'docx')

    // Build folder structure
    const folders: ImportFolder[] = folderFiles.map((f) => ({
      sourcePath: f.token,
      name: f.name,
      parentPath: f.parent_token !== rootToken ? f.parent_token : undefined,
    }))

    // Fetch and convert each document
    const documents: ImportDocument[] = []
    for (const file of docFiles) {
      try {
        const blocks = await fetchDocumentBlocks(token, file.token)
        const { markdown, images, mentionedDocs } = convertBlocksToMarkdown(blocks)

        // Download images
        const attachments: ImportAttachment[] = []
        for (const img of images) {
          try {
            const result = await downloadMedia(token, img.token)
            if (result) {
              const ext = mimeToExt(result.contentType)
              attachments.push({
                sourcePath: `lark-image-${img.token}`,
                filename: `${img.token}${ext}`,
                data: result.data,
                contentType: result.contentType.split(';')[0].trim(),
              })
            }
          } catch {
            // Image download failed — skip
          }
          await delay(DELAY_MS)
        }

        documents.push({
          sourcePath: file.token,
          title: file.name,
          content: markdown,
          attachments,
          internalLinks: mentionedDocs.map((d) => ({
            ref: `[[${d.title}]]`,
            targetSourcePath: d.token,
          })),
        })

        await delay(DELAY_MS)
      } catch (err) {
        // Skip documents that fail to fetch — will be logged by engine
        console.warn(`Failed to fetch Lark doc ${file.name}: ${(err as Error).message}`)
      }
    }

    return { folders, documents }
  }
}

// --- Lark API helpers ---

async function larkFetch<T>(token: string, endpoint: string, params?: Record<string, string>, retries = 0): Promise<T> {
  const url = new URL(`${LARK_API}${endpoint}`)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })

  if (res.status === 429) {
    if (retries >= 3) throw new Error('Lark API rate limit exceeded after 3 retries')
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '2', 10)
    await delay(retryAfter * 1000)
    return larkFetch<T>(token, endpoint, params, retries + 1)
  }

  if (!res.ok) throw new Error(`Lark API ${res.status}`)

  const json = (await res.json()) as { code: number; msg: string; data: T }
  if (json.code !== 0) throw new Error(`Lark error ${json.code}: ${json.msg}`)
  return json.data
}

/** List all files recursively from a folder (max depth 10) */
async function listFilesRecursive(token: string, folderToken: string, depth = 0): Promise<LarkFile[]> {
  if (depth > 10) return [] // prevent infinite recursion on deep/circular structures

  const files: LarkFile[] = []
  let pageToken: string | undefined

  do {
    const params: Record<string, string> = { folder_token: folderToken, page_size: '50' }
    if (pageToken) params.page_token = pageToken

    const data = await larkFetch<{ files: LarkFile[]; page_token?: string; has_more?: boolean }>(
      token,
      '/drive/v1/files',
      params,
    )

    for (const file of data.files ?? []) {
      file.parent_token = folderToken
      files.push(file)

      // Recurse into subfolders
      if (file.type === 'folder') {
        const children = await listFilesRecursive(token, file.token, depth + 1)
        files.push(...children)
        await delay(DELAY_MS)
      }
    }

    pageToken = data.has_more ? data.page_token : undefined
  } while (pageToken)

  return files
}

/** Fetch all blocks from a Lark document */
async function fetchDocumentBlocks(token: string, docToken: string): Promise<LarkBlock[]> {
  const blocks: LarkBlock[] = []
  let pageToken: string | undefined

  do {
    const params: Record<string, string> = { page_size: '500' }
    if (pageToken) params.page_token = pageToken

    const data = await larkFetch<{ items: LarkBlock[]; page_token?: string; has_more?: boolean }>(
      token,
      `/docx/v1/documents/${docToken}/blocks`,
      params,
    )

    blocks.push(...(data.items ?? []))
    pageToken = data.has_more ? data.page_token : undefined
  } while (pageToken)

  return blocks
}

/** Download media file by token, returns data + detected content type */
async function downloadMedia(token: string, fileToken: string): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  const url = `${LARK_API}/drive/v1/medias/${fileToken}/download`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const contentType = res.headers.get('Content-Type') ?? 'image/png'
  const data = await res.arrayBuffer()
  return { data, contentType }
}

/** Map MIME content type to file extension */
function mimeToExt(contentType: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
  }
  return map[contentType.split(';')[0].trim()] ?? '.png'
}

// --- Block → Markdown conversion ---

interface ConversionResult {
  markdown: string
  images: { token: string }[]
  mentionedDocs: { token: string; title: string }[]
}

function convertBlocksToMarkdown(blocks: LarkBlock[]): ConversionResult {
  const lines: string[] = []
  const images: { token: string }[] = []
  const mentionedDocs: { token: string; title: string }[] = []
  let orderedListIndex = 0

  for (const block of blocks) {
    // Track ordered list numbering: increment for consecutive ordered blocks, reset otherwise
    if (block.ordered) {
      orderedListIndex++
    } else {
      orderedListIndex = 0
    }
    const line = convertBlock(block, images, mentionedDocs, orderedListIndex)
    if (line !== null) lines.push(line)
  }

  return { markdown: lines.join('\n\n'), images, mentionedDocs }
}

function convertBlock(
  block: LarkBlock,
  images: { token: string }[],
  mentions: { token: string; title: string }[],
  orderedListIndex = 1,
): string | null {
  // Block type mapping (Lark uses numeric types)
  // Type 2 = text, 3 = heading1, 4 = heading2, 5 = heading3, 6 = heading4
  // 7 = bullet, 8 = ordered, 9 = code, 10 = quote, 11 = todo
  // 14 = divider, 27 = image, 19 = callout, 23 = table

  if (block.text) return renderElements(block.text.elements, mentions)
  if (block.heading1) return `# ${renderElements(block.heading1.elements, mentions)}`
  if (block.heading2) return `## ${renderElements(block.heading2.elements, mentions)}`
  if (block.heading3) return `### ${renderElements(block.heading3.elements, mentions)}`
  if (block.heading4) return `#### ${renderElements(block.heading4.elements, mentions)}`
  if (block.bullet) return `- ${renderElements(block.bullet.elements, mentions)}`
  if (block.ordered) return `${orderedListIndex}. ${renderElements(block.ordered.elements, mentions)}`
  if (block.quote) return `> ${renderElements(block.quote.elements, mentions)}`
  if (block.todo) {
    const checked = block.todo.style?.done ? 'x' : ' '
    return `- [${checked}] ${renderElements(block.todo.elements, mentions)}`
  }
  if (block.code) {
    const lang = LARK_LANG_MAP[block.code.style?.language ?? 0] ?? ''
    const content = renderElements(block.code.elements, mentions)
    return `\`\`\`${lang}\n${content}\n\`\`\``
  }
  if (block.divider) return '---'
  if (block.image?.token) {
    images.push({ token: block.image.token })
    return `![image](lark-image-${block.image.token})`
  }
  if (block.callout) {
    const emoji = block.callout.emoji_id ? `${block.callout.emoji_id} ` : ''
    return `> ${emoji}${renderElements(block.callout.elements, mentions)}`
  }
  if (block.table?.cells) {
    const rows = block.table.cells
    if (rows.length === 0) return null
    const header = `| ${rows[0].join(' | ')} |`
    const separator = `| ${rows[0].map(() => '---').join(' | ')} |`
    const body = rows.slice(1).map((row) => `| ${row.join(' | ')} |`).join('\n')
    return body ? `${header}\n${separator}\n${body}` : `${header}\n${separator}`
  }

  return null
}

function renderElements(
  elements: LarkTextElement[] | undefined,
  mentions: { token: string; title: string }[],
): string {
  if (!elements) return ''
  return elements.map((el) => {
    if (el.text_run) {
      let text = el.text_run.content
      const style = el.text_run.text_element_style
      if (style?.inline_code) text = `\`${text}\``
      if (style?.bold) text = `**${text}**`
      if (style?.italic) text = `*${text}*`
      if (style?.strikethrough) text = `~~${text}~~`
      if (style?.link?.url) {
        const decoded = decodeURIComponent(style.link.url)
        // Only allow http/https URLs to prevent XSS via javascript: or data: URIs
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
          text = `[${text}](${decoded})`
        }
      }
      return text
    }
    if (el.mention_doc) {
      mentions.push({ token: el.mention_doc.token, title: el.mention_doc.title })
      return `[[${el.mention_doc.title}]]`
    }
    if (el.equation) return `$${el.equation.content}$`
    return ''
  }).join('')
}

// Common Lark language IDs
const LARK_LANG_MAP: Record<number, string> = {
  0: '', 1: 'plaintext', 2: 'abap', 3: 'ada', 4: 'apache', 5: 'apex',
  22: 'bash', 23: 'csharp', 24: 'cpp', 25: 'c', 26: 'cobol',
  40: 'css', 41: 'dart', 43: 'go', 49: 'html', 50: 'java',
  51: 'javascript', 52: 'json', 53: 'kotlin', 58: 'lua', 60: 'markdown',
  71: 'php', 73: 'python', 78: 'ruby', 80: 'rust', 82: 'scala',
  85: 'sql', 86: 'swift', 92: 'typescript', 95: 'xml', 97: 'yaml',
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
