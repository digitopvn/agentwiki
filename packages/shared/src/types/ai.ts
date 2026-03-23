/** AI provider types, request/response interfaces */

/** Supported AI provider identifiers */
export type AIProviderId = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'minimax' | 'alibaba'

/** AI action categories */
export type AIAction = 'generate' | 'transform' | 'suggest' | 'summarize'

/** Slash command types for AI generation */
export type AIGenerateCommand = 'write' | 'continue' | 'summarize' | 'list' | 'explain'

/** Text transformation actions for selection toolbar */
export type AITransformAction = 'edit' | 'shorter' | 'longer' | 'tone' | 'translate' | 'fix-grammar'

/** Available tone options for tone transformation */
export type AITone = 'professional' | 'casual' | 'formal' | 'friendly'

/** Chat message for AI provider requests */
export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Unified request format sent to AI provider adapters */
export interface AIRequest {
  model: string
  messages: AIMessage[]
  maxTokens: number
  temperature?: number
  stream?: boolean
}

/** Unified response from AI provider adapters */
export interface AIResponse {
  content: string
  model: string
  tokensUsed: { input: number; output: number }
}

/** Request body for POST /api/ai/generate (slash commands) */
export interface AIGenerateBody {
  command: AIGenerateCommand
  context: string
  prompt?: string
  documentId: string
}

/** Request body for POST /api/ai/transform (selection actions) */
export interface AITransformBody {
  action: AITransformAction
  selectedText: string
  context?: string
  tone?: AITone
  language?: string
  instruction?: string
  documentId: string
}

/** Request body for POST /api/ai/suggest (RAG suggestions) */
export interface AISuggestBody {
  context: string
  documentId: string
  maxSuggestions?: number
}

/** AI provider setting as returned from API (key masked) */
export interface AIProviderSetting {
  id: string
  providerId: AIProviderId
  apiKey: string
  defaultModel: string
  isEnabled: boolean
}

/** AI usage record for tracking token consumption */
export interface AIUsageRecord {
  providerId: AIProviderId
  model: string
  action: AIAction
  inputTokens: number
  outputTokens: number
  createdAt: string
}
