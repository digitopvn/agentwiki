import type { AccessLevel } from '../constants'

export interface Document {
  id: string
  tenantId: string
  folderId: string | null
  title: string
  slug: string
  content: string
  contentJson: unknown | null
  summary: string | null
  category: string | null
  accessLevel: AccessLevel
  createdBy: string
  updatedBy: string | null
  createdAt: Date
  updatedAt: Date
  authorName?: string
  authorAvatar?: string | null
}

export interface Folder {
  id: string
  tenantId: string
  parentId: string | null
  name: string
  slug: string
  position: number
  createdAt: Date
  updatedAt: Date
}

export interface DocumentVersion {
  id: string
  documentId: string
  version: number
  content: string
  contentJson: unknown | null
  changeSummary: string | null
  createdBy: string
  createdAt: Date
}

export interface DocumentLink {
  id: string
  sourceDocId: string
  targetDocId: string
  context: string | null
  createdAt: Date
}

export interface ShareLink {
  id: string
  documentId: string
  token: string
  accessLevel: string
  expiresAt: Date | null
  createdAt: Date
}
