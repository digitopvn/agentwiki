/** Prompt templates for AI generation and transformation commands */

import type { AIMessage, AIGenerateCommand, AITransformAction, AITone } from '@agentwiki/shared'

const MAX_CONTEXT_LENGTH = 3000

/** Build system + user messages for slash command generation */
export function buildGeneratePrompt(
  command: AIGenerateCommand,
  context: string,
  prompt?: string,
): AIMessage[] {
  const truncatedContext = context.slice(0, MAX_CONTEXT_LENGTH)

  switch (command) {
    case 'write':
      return [
        { role: 'system', content: 'You are a wiki content writer. Write clear, informative content. Detect the language of the surrounding context and write in the same language. Output ONLY the content — no filler, no meta-commentary.' },
        { role: 'user', content: `Write about: ${prompt || 'this topic'}\n\nSurrounding context:\n${truncatedContext}` },
      ]
    case 'continue':
      return [
        { role: 'system', content: 'Continue writing naturally from where the text ends. Match the existing tone, style, and language. Output ONLY the continuation — no filler.' },
        { role: 'user', content: `Continue from:\n${truncatedContext}` },
      ]
    case 'summarize':
      return [
        { role: 'system', content: 'Summarize the document concisely in 2-3 sentences. Detect and match the document language. Output ONLY the summary.' },
        { role: 'user', content: truncatedContext },
      ]
    case 'list':
      return [
        { role: 'system', content: 'Generate a structured markdown list (5-7 items) related to the topic. Detect and match the context language. Output ONLY the list.' },
        { role: 'user', content: `Topic: ${prompt || 'related items'}\n\nContext:\n${truncatedContext}` },
      ]
    case 'explain':
      return [
        { role: 'system', content: 'Explain the concept simply and clearly in 2-3 paragraphs. Detect and match the context language. Output ONLY the explanation.' },
        { role: 'user', content: truncatedContext },
      ]
  }
}

/** Build system + user messages for selection toolbar transformation */
export function buildTransformPrompt(
  action: AITransformAction,
  selectedText: string,
  opts?: { tone?: AITone; language?: string; instruction?: string },
): AIMessage[] {
  switch (action) {
    case 'edit':
      return [
        { role: 'system', content: 'Edit the text according to the instruction. Output ONLY the edited text. Preserve the original language unless instructed otherwise.' },
        { role: 'user', content: `Instruction: ${opts?.instruction || 'improve this text'}\n\nText:\n${selectedText}` },
      ]
    case 'shorter':
      return [
        { role: 'system', content: 'Condense the text while keeping its core meaning. Output ONLY the condensed text. Preserve the original language.' },
        { role: 'user', content: selectedText },
      ]
    case 'longer':
      return [
        { role: 'system', content: 'Expand the text with more detail and examples. Output ONLY the expanded text. Preserve the original language.' },
        { role: 'user', content: selectedText },
      ]
    case 'tone':
      return [
        { role: 'system', content: `Rewrite the text in a ${opts?.tone || 'professional'} tone. Output ONLY the rewritten text. Preserve the original language.` },
        { role: 'user', content: selectedText },
      ]
    case 'translate':
      return [
        { role: 'system', content: `Translate the text to ${opts?.language || 'English'}. Output ONLY the translation.` },
        { role: 'user', content: selectedText },
      ]
    case 'fix-grammar':
      return [
        { role: 'system', content: 'Fix grammar, spelling, and punctuation errors. Output ONLY the corrected text. Preserve the original language.' },
        { role: 'user', content: selectedText },
      ]
  }
}
