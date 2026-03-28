/**
 * ProseMirror plugin that intercepts paste events containing markdown code fences.
 * BlockNote v0.22.0 default paste handler treats text/plain as plain text,
 * which loses code blocks. This plugin detects code fences and uses
 * BlockNote's markdown parser to preserve them.
 */

import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { BlockNoteEditor } from '@blocknote/core'

/** Matches actual code fence blocks: ```<lang>\n...\n``` */
const CODE_FENCE_REGEX = /```\w*\n[\s\S]*?\n```/

/**
 * Creates a ProseMirror plugin that intercepts paste events when clipboard
 * text/plain contains markdown code fences. Parses the markdown via
 * BlockNote's parser and inserts blocks at the cursor position.
 *
 * Register after editor creation via editor._tiptapEditor.registerPlugin().
 */
export function createPasteMarkdownPlugin(editor: BlockNoteEditor) {
  return new Plugin({
    key: new PluginKey('pasteMarkdownWithCodeBlocks'),
    props: {
      handleDOMEvents: {
        paste(_view: EditorView, event: Event) {
          if (!editor.isEditable) return false

          const clipboardEvent = event as ClipboardEvent
          const clipboardData = clipboardEvent.clipboardData
          if (!clipboardData) return false

          const plainText = clipboardData.getData('text/plain')
          if (!plainText || !CODE_FENCE_REGEX.test(plainText)) return false

          // Prevent default and BlockNote's handler
          clipboardEvent.preventDefault()

          // Async: parse markdown and insert blocks at cursor
          editor.tryParseMarkdownToBlocks(plainText).then((blocks) => {
            if (!blocks.length) return

            const cursorBlock = editor.getTextCursorPosition().block
            editor.insertBlocks(blocks, cursorBlock, 'after')

            // Remove the current block if it's empty (cursor was on blank line)
            const currentContent = cursorBlock.content
            if (Array.isArray(currentContent) && currentContent.length === 0) {
              editor.removeBlocks([cursorBlock])
            }
          }).catch(() => {
            // Fallback: insert as plain text paragraph at cursor
            try {
              const cursorBlock = editor.getTextCursorPosition().block
              editor.insertBlocks(
                [{ type: 'paragraph', content: [{ type: 'text', text: plainText, styles: {} }] }],
                cursorBlock,
                'after',
              )
            } catch {
              // Editor may be unfocused — silently ignore
            }
          })

          return true // signal event handled
        },
      },
    },
  })
}
