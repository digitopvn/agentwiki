/** Zod schemas for storage folder and upload operations */

import { z } from 'zod'

export const createStorageFolderSchema = z.object({
  name: z.string().min(1).max(200),
  parentId: z.string().nullable().optional(),
})

export const updateStorageFolderSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  parentId: z.string().nullable().optional(),
  position: z.number().int().min(0).optional(),
})

export const bulkMoveSchema = z.object({
  fileIds: z.array(z.string()).default([]),
  folderIds: z.array(z.string()).default([]),
  targetFolderId: z.string().nullable(),
})

export const bulkDeleteSchema = z.object({
  fileIds: z.array(z.string()).default([]),
  folderIds: z.array(z.string()).default([]),
})

export const moveFileSchema = z.object({
  folderId: z.string().nullable(),
})
