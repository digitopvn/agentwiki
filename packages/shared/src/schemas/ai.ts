/** Zod validation schemas for AI API endpoints */

import { z } from 'zod'

/** Provider ID enum used across schemas */
const providerIdEnum = z.enum(['openai', 'anthropic', 'google', 'openrouter', 'minimax', 'alibaba'])

/** Validate POST /api/ai/generate request body */
export const aiGenerateSchema = z.object({
  command: z.enum(['write', 'continue', 'summarize', 'list', 'explain']),
  context: z.string().max(10000),
  prompt: z.string().max(2000).optional(),
  documentId: z.string().min(1),
})

/** Validate POST /api/ai/transform request body */
export const aiTransformSchema = z.object({
  action: z.enum(['edit', 'shorter', 'longer', 'tone', 'translate', 'fix-grammar']),
  selectedText: z.string().min(1).max(10000),
  context: z.string().max(5000).optional(),
  tone: z.enum(['professional', 'casual', 'formal', 'friendly']).optional(),
  language: z.string().max(50).optional(),
  instruction: z.string().max(500).optional(),
  documentId: z.string().min(1),
})

/** Validate POST /api/ai/suggest request body */
export const aiSuggestSchema = z.object({
  context: z.string().max(10000),
  documentId: z.string().min(1),
  maxSuggestions: z.number().min(1).max(5).default(3),
})

/** Validate PUT /api/ai/settings request body */
export const aiSettingsUpdateSchema = z.object({
  providerId: providerIdEnum,
  apiKey: z.string().min(1).max(500),
  defaultModel: z.string().min(1).max(100),
  isEnabled: z.boolean(),
})
