/** Registry pattern for resolving AI providers by ID */

import type { AIProvider } from './ai-provider-interface'
import type { AIProviderId } from '@agentwiki/shared'
import { OpenAIAdapter } from './providers/openai-adapter'
import { AnthropicAdapter } from './providers/anthropic-adapter'
import { GoogleAdapter } from './providers/google-adapter'
import { OpenRouterAdapter } from './providers/openrouter-adapter'
import { MiniMaxAdapter } from './providers/minimax-adapter'
import { AlibabaAdapter } from './providers/alibaba-adapter'

const providers: Record<AIProviderId, AIProvider> = {
  openai: new OpenAIAdapter(),
  anthropic: new AnthropicAdapter(),
  google: new GoogleAdapter(),
  openrouter: new OpenRouterAdapter(),
  minimax: new MiniMaxAdapter(),
  alibaba: new AlibabaAdapter(),
}

/** Get an AI provider adapter by its identifier */
export function getProvider(id: AIProviderId): AIProvider {
  const provider = providers[id]
  if (!provider) throw new Error(`Unknown AI provider: ${id}`)
  return provider
}
