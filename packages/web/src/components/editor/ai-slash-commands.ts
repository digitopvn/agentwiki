/** Custom AI slash menu items for BlockNote editor */

import type { BlockNoteEditor } from '@blocknote/core'
import type { DefaultReactSuggestionItem } from '@blocknote/react'
import type { AIGenerateBody } from '@agentwiki/shared'

type GenerateFn = (body: AIGenerateBody, onChunk: (text: string) => void) => Promise<void>

/** Create AI slash menu items for the given editor and document */
export function getAISlashMenuItems(
  editor: BlockNoteEditor,
  documentId: string,
  generate: GenerateFn,
): DefaultReactSuggestionItem[] {
  /** Get markdown content of all blocks as context */
  const getContext = async () => {
    const md = await editor.blocksToMarkdownLossy(editor.document)
    return md.slice(0, 3000)
  }

  /** Insert AI-generated markdown after the current block */
  const insertGenerated = async (body: AIGenerateBody) => {
    let accumulated = ''
    await generate(body, (chunk) => {
      accumulated += chunk
    })
    if (!accumulated) return

    const blocks = await editor.tryParseMarkdownToBlocks(accumulated)
    const currentBlock = editor.getTextCursorPosition().block
    editor.insertBlocks(blocks, currentBlock, 'after')
  }

  return [
    {
      title: 'AI Write',
      subtext: 'Write content with AI assistance',
      group: 'AI',
      aliases: ['ai', 'write', 'generate'],
      onItemClick: async () => {
        const prompt = window.prompt('What should AI write about?')
        if (!prompt) return
        const context = await getContext()
        await insertGenerated({ command: 'write', context, prompt, documentId })
      },
    },
    {
      title: 'AI Continue',
      subtext: 'Continue writing from current position',
      group: 'AI',
      aliases: ['continue', 'extend'],
      onItemClick: async () => {
        const context = await getContext()
        await insertGenerated({ command: 'continue', context, documentId })
      },
    },
    {
      title: 'AI Summarize',
      subtext: 'Generate a summary of this document',
      group: 'AI',
      aliases: ['summarize', 'tldr', 'summary'],
      onItemClick: async () => {
        const context = await getContext()
        await insertGenerated({ command: 'summarize', context, documentId })
      },
    },
    {
      title: 'AI List',
      subtext: 'Generate a list about a topic',
      group: 'AI',
      aliases: ['list', 'bullets', 'items'],
      onItemClick: async () => {
        const prompt = window.prompt('What should the list be about?')
        if (!prompt) return
        const context = await getContext()
        await insertGenerated({ command: 'list', context, prompt, documentId })
      },
    },
    {
      title: 'AI Explain',
      subtext: 'Explain the current content simply',
      group: 'AI',
      aliases: ['explain', 'simplify', 'clarify'],
      onItemClick: async () => {
        const context = await getContext()
        await insertGenerated({ command: 'explain', context, documentId })
      },
    },
  ]
}
