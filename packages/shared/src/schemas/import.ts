import { z } from 'zod'

/** Schema for ZIP-based import (Obsidian/Notion) */
export const startImportSchema = z.object({
  source: z.enum(['obsidian', 'notion']),
  targetFolderId: z.string().optional(),
})

/** Schema for Lark API-based import */
export const startLarkImportSchema = z.object({
  token: z.string().min(1),
  spaceId: z.string().optional(),
  targetFolderId: z.string().optional(),
})
