import { z } from 'zod'
import { ACCESS_LEVELS } from '../constants'

export const createDocumentSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().default(''),
  contentJson: z.unknown().optional(),
  folderId: z.string().optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  accessLevel: z.enum(ACCESS_LEVELS).default('private'),
})

export const updateDocumentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().optional(),
  contentJson: z.unknown().optional(),
  folderId: z.string().nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  accessLevel: z.enum(ACCESS_LEVELS).optional(),
})

export const createFolderSchema = z.object({
  name: z.string().min(1).max(200),
  parentId: z.string().nullable().optional(),
})

export const reorderFolderSchema = z.object({
  parentId: z.string().nullable(),
  position: z.number().int().min(0),
})

export const searchDocumentsSchema = z.object({
  query: z.string().min(1).max(500),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
})

export const createShareLinkSchema = z.object({
  documentId: z.string(),
  expiresInDays: z.number().int().min(1).max(90).default(30),
})
