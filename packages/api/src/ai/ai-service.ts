/** AI service — business logic for generate, transform, suggest, settings, usage */

import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc, inArray, sql } from 'drizzle-orm'
import { aiSettings, aiUsage, documents } from '../db/schema'
import { embedQuery } from '../services/embedding-service'
import { encrypt, decrypt } from '../utils/encryption'
import { generateId } from '../utils/crypto'
import { getProvider } from './ai-provider-registry'
import { buildGeneratePrompt, buildTransformPrompt } from './ai-prompt-builder'
import type { Env } from '../env'
import type {
  AIProviderId,
  AIAction,
  AIGenerateBody,
  AITransformBody,
  AISuggestBody,
  AIProviderSetting,
  AIUsageRecord,
} from '@agentwiki/shared'

/** Resolve the first enabled provider for a tenant (lowest priority), decrypt its API key */
export async function getActiveProvider(env: Env, tenantId: string) {
  const db = drizzle(env.DB)
  const settings = await db
    .select()
    .from(aiSettings)
    .where(and(eq(aiSettings.tenantId, tenantId), eq(aiSettings.isEnabled, true)))
    .orderBy(aiSettings.priority)
    .limit(1)

  if (!settings.length) return null

  const setting = settings[0]
  const apiKey = await decrypt(setting.encryptedApiKey, env.AI_ENCRYPTION_KEY)
  const provider = getProvider(setting.providerId as AIProviderId)

  return { provider, apiKey, model: setting.defaultModel, providerId: setting.providerId }
}

/** Generate text via slash commands — returns SSE-ready ReadableStream */
export async function generate(
  env: Env,
  tenantId: string,
  userId: string,
  body: AIGenerateBody,
): Promise<ReadableStream<Uint8Array>> {
  const active = await getActiveProvider(env, tenantId)
  if (!active) throw new Error('No AI provider configured. Please configure one in Settings.')

  const messages = buildGeneratePrompt(body.command, body.context, body.prompt)
  const stream = await active.provider.streamText(active.apiKey, {
    model: active.model,
    messages,
    maxTokens: 1024,
    temperature: 0.7,
  })

  // Log usage async (best effort)
  logUsage(env, tenantId, userId, active.providerId as AIProviderId, active.model, 'generate', 0, 0)

  return stream
}

/** Transform selected text — returns SSE-ready ReadableStream */
export async function transform(
  env: Env,
  tenantId: string,
  userId: string,
  body: AITransformBody,
): Promise<ReadableStream<Uint8Array>> {
  const active = await getActiveProvider(env, tenantId)
  if (!active) throw new Error('No AI provider configured. Please configure one in Settings.')

  const messages = buildTransformPrompt(body.action, body.selectedText, {
    tone: body.tone,
    language: body.language,
    instruction: body.instruction,
  })
  const stream = await active.provider.streamText(active.apiKey, {
    model: active.model,
    messages,
    maxTokens: 2048,
    temperature: 0.5,
  })

  logUsage(env, tenantId, userId, active.providerId as AIProviderId, active.model, 'transform', 0, 0)

  return stream
}

/** Generate summary using tenant provider (for queue handler upgrade) */
export async function generateSummaryWithProvider(
  env: Env,
  tenantId: string,
  title: string,
  content: string,
): Promise<string | null> {
  const active = await getActiveProvider(env, tenantId)
  if (!active) return null

  const response = await active.provider.generateText(active.apiKey, {
    model: active.model,
    messages: [
      { role: 'system', content: 'Summarize in 1-2 concise sentences. Detect and match the document language. Output ONLY the summary.' },
      { role: 'user', content: `Title: ${title}\n\n${content.slice(0, 3000)}` },
    ],
    maxTokens: 150,
  })

  logUsage(env, tenantId, 'system', active.providerId as AIProviderId, active.model, 'summarize', response.tokensUsed.input, response.tokensUsed.output)

  return response.content || null
}

/** RAG-powered smart suggestions: query Vectorize for related docs, inject into AI prompt */
export async function suggest(
  env: Env,
  tenantId: string,
  userId: string,
  body: AISuggestBody,
): Promise<string[]> {
  const active = await getActiveProvider(env, tenantId)
  if (!active) throw new Error('No AI provider configured. Please configure one in Settings.')

  // Step 1: Embed the current context to find similar docs
  const queryEmbedding = await embedQuery(env, body.context.slice(0, 512))

  // Step 2: Query Vectorize for similar document chunks
  const matches = await env.VECTORIZE.query(queryEmbedding, {
    topK: 5,
    filter: { org_id: tenantId },
    returnMetadata: 'all',
  })

  // Step 3: Fetch related document content (exclude current doc)
  const relatedDocIds = [
    ...new Set(
      matches.matches
        .map((m) => (m.metadata as Record<string, string>)?.doc_id)
        .filter((id): id is string => !!id && id !== body.documentId),
    ),
  ].slice(0, 3)

  let relatedContext = ''
  if (relatedDocIds.length) {
    const db = drizzle(env.DB)
    const docs = await db
      .select({ title: documents.title, content: documents.content })
      .from(documents)
      .where(inArray(documents.id, relatedDocIds))
      .limit(3)

    relatedContext = docs
      .map((d) => `## ${d.title}\n${d.content?.slice(0, 500)}`)
      .join('\n\n')
  }

  // Step 4: Generate suggestions with RAG context
  const maxSuggestions = body.maxSuggestions ?? 3
  const response = await active.provider.generateText(active.apiKey, {
    model: active.model,
    messages: [
      {
        role: 'system',
        content: `You are a wiki writing assistant. Based on the user's current context and related documents from the same wiki, suggest ${maxSuggestions} short writing continuations or related topics to explore. Return ONLY a JSON array of strings. Each suggestion should be 1-2 sentences.`,
      },
      {
        role: 'user',
        content: `Current context:\n${body.context.slice(0, 2000)}${relatedContext ? `\n\nRelated wiki content:\n${relatedContext.slice(0, 2000)}` : ''}`,
      },
    ],
    maxTokens: 500,
  })

  logUsage(env, tenantId, userId, active.providerId as AIProviderId, active.model, 'suggest', response.tokensUsed.input, response.tokensUsed.output)

  // Parse JSON array from response
  try {
    const parsed = JSON.parse(response.content)
    if (Array.isArray(parsed)) return parsed.map(String).slice(0, maxSuggestions)
  } catch {
    // Fallback: return raw response as single suggestion
  }
  return response.content ? [response.content] : []
}

// --- Settings CRUD ---

/** List all AI provider settings for a tenant (keys masked) */
export async function getSettings(env: Env, tenantId: string): Promise<AIProviderSetting[]> {
  const db = drizzle(env.DB)
  const rows = await db
    .select()
    .from(aiSettings)
    .where(eq(aiSettings.tenantId, tenantId))

  return rows.map((r) => ({
    id: r.id,
    providerId: r.providerId as AIProviderId,
    apiKey: maskKey(r.encryptedApiKey),
    defaultModel: r.defaultModel,
    isEnabled: r.isEnabled,
    priority: r.priority ?? 0,
  }))
}

/** Upsert AI provider setting (encrypts API key) */
export async function upsertSetting(
  env: Env,
  tenantId: string,
  data: { providerId: AIProviderId; apiKey: string; defaultModel: string; isEnabled: boolean },
) {
  const db = drizzle(env.DB)
  const now = Date.now()
  const encryptedKey = await encrypt(data.apiKey, env.AI_ENCRYPTION_KEY)

  const existing = await db
    .select()
    .from(aiSettings)
    .where(and(eq(aiSettings.tenantId, tenantId), eq(aiSettings.providerId, data.providerId)))
    .limit(1)

  if (existing.length) {
    const updateData: Record<string, unknown> = {
      defaultModel: data.defaultModel,
      isEnabled: data.isEnabled,
      updatedAt: new Date(now),
    }
    // Only update encrypted key if user provided a new one (not the sentinel)
    if (data.apiKey !== '__unchanged__') {
      updateData.encryptedApiKey = encryptedKey
    }
    await db
      .update(aiSettings)
      .set(updateData)
      .where(eq(aiSettings.id, existing[0].id))
  } else {
    // Auto-assign priority = max existing + 1 so new providers go to the end
    const maxResult = await db
      .select({ max: sql<number>`MAX(priority)` })
      .from(aiSettings)
      .where(eq(aiSettings.tenantId, tenantId))
    const nextPriority = ((maxResult[0]?.max as number) ?? -1) + 1

    await db.insert(aiSettings).values({
      id: generateId(),
      tenantId,
      providerId: data.providerId,
      encryptedApiKey: encryptedKey,
      defaultModel: data.defaultModel,
      isEnabled: data.isEnabled,
      priority: nextPriority,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
  }
}

/** Bulk update provider priorities (for drag-and-drop reordering) */
export async function updatePriorities(
  env: Env,
  tenantId: string,
  order: { providerId: string; priority: number }[],
) {
  const db = drizzle(env.DB)
  const now = new Date()

  // Validate all provider IDs belong to this tenant before mutating
  const existing = await db.select({ providerId: aiSettings.providerId }).from(aiSettings).where(eq(aiSettings.tenantId, tenantId))
  const validIds = new Set(existing.map((e) => e.providerId))

  for (const item of order) {
    if (!validIds.has(item.providerId)) continue // skip invalid IDs silently
    await db
      .update(aiSettings)
      .set({ priority: item.priority, updatedAt: now })
      .where(and(eq(aiSettings.tenantId, tenantId), eq(aiSettings.providerId, item.providerId)))
  }
}

/** Delete a provider setting */
export async function deleteSetting(env: Env, tenantId: string, providerId: string) {
  const db = drizzle(env.DB)
  await db
    .delete(aiSettings)
    .where(and(eq(aiSettings.tenantId, tenantId), eq(aiSettings.providerId, providerId)))
}

// --- Usage ---

/** Get usage records for a tenant */
export async function getUsage(env: Env, tenantId: string, limit = 100): Promise<AIUsageRecord[]> {
  const db = drizzle(env.DB)
  const rows = await db
    .select()
    .from(aiUsage)
    .where(eq(aiUsage.tenantId, tenantId))
    .orderBy(desc(aiUsage.createdAt))
    .limit(limit)

  return rows.map((r) => ({
    providerId: r.providerId as AIProviderId,
    model: r.model,
    action: r.action as AIAction,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    createdAt: new Date(r.createdAt).toISOString(),
  }))
}

// --- Internal helpers ---

/** Log AI usage (best effort, non-blocking) */
function logUsage(
  env: Env,
  tenantId: string,
  userId: string,
  providerId: AIProviderId,
  model: string,
  action: AIAction,
  inputTokens: number,
  outputTokens: number,
) {
  const db = drizzle(env.DB)
  db.insert(aiUsage)
    .values({
      id: generateId(),
      tenantId,
      userId,
      providerId,
      model,
      action,
      inputTokens,
      outputTokens,
      createdAt: new Date(),
    })
    .run()
    .catch((err) => console.error('Failed to log AI usage:', err))
}

/** Mask encrypted key — show only indicator that key exists */
function maskKey(encrypted: string): string {
  return encrypted ? '••••••••' : ''
}
