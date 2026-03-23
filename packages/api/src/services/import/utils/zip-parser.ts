/** Parse ZIP archive entries using fflate */

import { unzipSync } from 'fflate'

/** Files to always skip during import */
const SKIP_PATTERNS = [
  /^__MACOSX\//,
  /\.DS_Store$/,
  /^\.obsidian\//,
  /^\.trash\//,
  /Thumbs\.db$/,
  /desktop\.ini$/,
]

/** MIME type lookup by extension */
const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.txt': 'text/plain',
}

export interface ZipEntry {
  path: string
  data: Uint8Array
  isDirectory: boolean
}

/** Per-file size limit (20MB) to prevent memory exhaustion on large entries */
const MAX_FILE_SIZE = 20 * 1024 * 1024
/** Total decompressed size limit (256MB) to stay within Workers memory budget */
const MAX_TOTAL_SIZE = 256 * 1024 * 1024
/** Max compressed ZIP size for decompression (50MB) — limits peak memory during unzipSync */
const MAX_COMPRESSED_SIZE = 50 * 1024 * 1024

/** Parse a ZIP file and return all valid entries */
export function parseZip(zipData: ArrayBuffer): ZipEntry[] {
  // Guard: reject oversized compressed input before decompression to limit peak memory
  if (zipData.byteLength > MAX_COMPRESSED_SIZE) {
    throw new Error(`ZIP file too large (${(zipData.byteLength / 1024 / 1024).toFixed(1)}MB). Max compressed size is ${MAX_COMPRESSED_SIZE / 1024 / 1024}MB.`)
  }

  const unzipped = unzipSync(new Uint8Array(zipData))
  const entries: ZipEntry[] = []
  let totalSize = 0

  for (const [path, data] of Object.entries(unzipped)) {
    // Skip system files
    if (SKIP_PATTERNS.some((p) => p.test(path))) continue

    // Skip empty directory entries
    const isDir = path.endsWith('/')
    if (isDir) continue

    // Security: reject path traversal, absolute paths, null bytes
    if (path.includes('..') || path.startsWith('/') || path.includes('\0')) continue

    // Safety: skip individual files that are too large
    if (data.byteLength > MAX_FILE_SIZE) {
      console.warn(`Skipping oversized file in ZIP: ${path} (${(data.byteLength / 1024 / 1024).toFixed(1)}MB)`)
      continue
    }

    totalSize += data.byteLength
    if (totalSize > MAX_TOTAL_SIZE) {
      console.warn(`ZIP decompressed size exceeds ${MAX_TOTAL_SIZE / 1024 / 1024}MB limit, truncating entries`)
      break
    }

    entries.push({ path, data, isDirectory: false })
  }

  return entries
}

/** Get MIME type from file extension */
export function getMimeType(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  return MIME_MAP[ext] ?? 'application/octet-stream'
}

/** Check if a file is a markdown file */
export function isMarkdownFile(path: string): boolean {
  return path.toLowerCase().endsWith('.md')
}

/** Check if a file is an image */
export function isImageFile(path: string): boolean {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext)
}

/** Extract directory paths from a list of file paths */
export function extractDirectories(filePaths: string[]): string[] {
  const dirs = new Set<string>()
  for (const fp of filePaths) {
    const parts = fp.split('/')
    // Build all parent directories
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join('/'))
    }
  }
  // Sort by depth (shallowest first)
  return [...dirs].sort((a, b) => a.split('/').length - b.split('/').length)
}

/** Get the filename from a path */
export function getFilename(path: string): string {
  return path.split('/').pop() ?? path
}

/** Sanitize filename for R2 storage */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-]/g, '_').replace(/__+/g, '_')
}
