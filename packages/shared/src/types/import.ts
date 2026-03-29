/** Import pipeline types for Obsidian, Notion, LarkSuite */

export type ImportSource = 'obsidian' | 'notion' | 'lark'
export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed'

/** Normalized document from any source adapter */
export interface ImportDocument {
  sourcePath: string
  title: string
  content: string
  tags?: string[]
  createdAt?: number
  updatedAt?: number
  attachments: ImportAttachment[]
  internalLinks: ImportInternalLink[]
}

/** Attachment (image/file) referenced in a document */
export interface ImportAttachment {
  sourcePath: string
  filename: string
  data: ArrayBuffer
  contentType: string
}

/** Internal link between documents (resolved after all docs created) */
export interface ImportInternalLink {
  ref: string
  targetSourcePath: string
}

/** Folder in source hierarchy */
export interface ImportFolder {
  sourcePath: string
  name: string
  parentPath?: string
}

/** Result from a source adapter parse step */
export interface ImportParseResult {
  folders: ImportFolder[]
  documents: ImportDocument[]
}

/** SSE progress event streamed to client */
export interface ImportProgressEvent {
  type: 'start' | 'folder' | 'document' | 'attachment' | 'link-resolve' | 'error' | 'complete'
  current?: number
  total?: number
  name?: string
  message?: string
  summary?: ImportSummary
}

/** Final summary after import completes */
export interface ImportSummary {
  foldersCreated: number
  documentsCreated: number
  attachmentsUploaded: number
  linksResolved: number
  errors: ImportError[]
  durationMs: number
}

export interface ImportError {
  path: string
  message: string
}

/** Import job record (maps to import_jobs table) */
export interface ImportJob {
  id: string
  tenantId: string
  userId: string
  source: ImportSource
  status: ImportStatus
  targetFolderId?: string | null
  totalDocs: number
  processedDocs: number
  totalAttachments: number
  processedAttachments: number
  errorCount: number
  errors?: ImportError[] | null
  fileKey?: string | null
  larkConfig?: { token: string; spaceId?: string } | null
  createdAt: number
  completedAt?: number | null
}
