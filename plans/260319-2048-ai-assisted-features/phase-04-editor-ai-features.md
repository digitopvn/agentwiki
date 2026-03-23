# Phase 4: Editor AI Features

## Context
- Existing editor: `packages/web/src/components/editor/editor.tsx` (169 LOC)
- BlockNote v0.22.0 with `@blocknote/react` + `@blocknote/mantine`
- AI API routes from Phase 3: `POST /api/ai/generate`, `POST /api/ai/transform`
- ClaudeKit reference: `AISelectionToolbar.tsx`, `BlockNoteEditor.tsx`
- BlockNote APIs: `SuggestionMenuController`, `FormattingToolbar`, `insertBlocks`, `replaceBlocks`

## Overview
- **Priority:** P1
- **Status:** Pending
- **Effort:** 10h
- Custom slash commands for AI generation + floating selection toolbar for text transformation. SSE streaming integration with BlockNote content APIs.

## Key Insights
- BlockNote `SuggestionMenuController` allows custom slash menu items with `getItems` function
- `FormattingToolbar` supports custom buttons via `Components.FormattingToolbar.Button`
- `editor.getSelectedText()` gets selected text for transformation
- `editor.insertBlocks()` / `editor.replaceBlocks()` for inserting AI output
- SSE consumed via `EventSource` or `fetch` + `ReadableStream` reader
- Need loading states (spinner in editor) while AI generates

## Requirements

### Functional
- 5 slash commands: `/ai-write`, `/ai-continue`, `/ai-summarize`, `/ai-list`, `/ai-explain`
- Selection toolbar with 6 actions: Edit with AI, Write shorter, Write longer, Change tone, Translate, Fix grammar
- Streaming text appears progressively in editor
- Loading indicator during generation
- Error state with retry option

### Non-Functional
- Toolbar appears on text selection, disappears on deselect
- Slash commands appear in existing slash menu alongside default items
- Mobile-friendly (toolbar adapts to viewport)
- No layout shift during streaming insertion

## Architecture

```
packages/web/src/
├── components/editor/
│   ├── editor.tsx                    # MODIFY: add custom slash menu + toolbar
│   ├── ai-slash-commands.ts          # NEW: slash menu item definitions
│   └── ai-selection-toolbar.tsx      # NEW: floating toolbar component
├── hooks/
│   └── use-ai.ts                     # NEW: AI API client hook
└── lib/
    └── ai-stream-reader.ts           # NEW: SSE stream consumer utility
```

### UI Flow

```
Slash Commands:
  User types "/" → slash menu appears → select "/ai-write" →
  prompt input appears → user types topic → Enter →
  loading indicator → SSE stream → text inserted block by block

Selection Toolbar:
  User selects text → floating toolbar appears above selection →
  click "Write shorter" → loading on button →
  SSE stream → selected text replaced progressively →
  toolbar closes
```

## Related Code Files

### Files to Create
- `packages/web/src/components/editor/ai-slash-commands.ts`
- `packages/web/src/components/editor/ai-selection-toolbar.tsx`
- `packages/web/src/hooks/use-ai.ts`
- `packages/web/src/lib/ai-stream-reader.ts`

### Files to Modify
- `packages/web/src/components/editor/editor.tsx` — integrate slash commands + toolbar

## Implementation Steps

### 1. Create SSE stream reader (`lib/ai-stream-reader.ts`)

```typescript
/** Read SSE stream from AI endpoints, call onChunk for each text piece */
export async function readAIStream(
  url: string,
  body: unknown,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: Error) => void,
): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'AI request failed' }))
    onError(new Error(err.error || `HTTP ${res.status}`))
    return
  }
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') { onDone(); return }
      try {
        const { text } = JSON.parse(data)
        if (text) onChunk(text)
      } catch { /* skip */ }
    }
  }
  onDone()
}
```

### 2. Create AI hook (`hooks/use-ai.ts`)

```typescript
import { useState, useCallback } from 'react'
import { readAIStream } from '../lib/ai-stream-reader'

export function useAI() {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = useCallback(async (
    body: AIGenerateBody,
    onChunk: (text: string) => void,
  ) => {
    setIsGenerating(true); setError(null)
    await readAIStream('/api/ai/generate', body, onChunk,
      () => setIsGenerating(false),
      (err) => { setError(err.message); setIsGenerating(false) }
    )
  }, [])

  const transform = useCallback(async (
    body: AITransformBody,
    onChunk: (text: string) => void,
  ) => {
    setIsGenerating(true); setError(null)
    await readAIStream('/api/ai/transform', body, onChunk,
      () => setIsGenerating(false),
      (err) => { setError(err.message); setIsGenerating(false) }
    )
  }, [])

  return { isGenerating, error, generate, transform }
}
```

### 3. Create slash commands (`ai-slash-commands.ts`)

Define 5 custom slash menu items using BlockNote's `SuggestionMenuController` API:

```typescript
import type { DefaultReactSuggestionItem } from '@blocknote/react'

export function getAISlashMenuItems(editor): DefaultReactSuggestionItem[] {
  return [
    {
      title: 'AI Write',
      subtext: 'Write content with AI assistance',
      group: 'AI',
      aliases: ['ai', 'write', 'generate'],
      onItemClick: () => { /* trigger prompt input, then call generate('write', ...) */ },
    },
    {
      title: 'AI Continue',
      subtext: 'Continue writing from current position',
      group: 'AI',
      aliases: ['continue', 'extend'],
      onItemClick: () => { /* get preceding content, call generate('continue', ...) */ },
    },
    {
      title: 'AI Summarize',
      subtext: 'Summarize the document',
      group: 'AI',
      aliases: ['summarize', 'tldr'],
      onItemClick: () => { /* get document content, call generate('summarize', ...) */ },
    },
    {
      title: 'AI List',
      subtext: 'Generate a list about a topic',
      group: 'AI',
      aliases: ['list', 'bullets'],
      onItemClick: () => { /* trigger prompt input, then call generate('list', ...) */ },
    },
    {
      title: 'AI Explain',
      subtext: 'Explain selected concept simply',
      group: 'AI',
      aliases: ['explain', 'simplify'],
      onItemClick: () => { /* get context, call generate('explain', ...) */ },
    },
  ]
}
```

For `/ai-write` and `/ai-list`: need a prompt input. Use a simple inline input that appears below the slash menu. Or use `window.prompt()` as MVP (then improve to inline input later).

**Better approach:** Insert a temporary "prompt block" where user types, then replace with AI output.

### 4. Create selection toolbar (`ai-selection-toolbar.tsx`)

Floating toolbar that appears above selected text:

```tsx
export function AISelectionToolbar({ editor, documentId }: Props) {
  const { isGenerating, transform } = useAI()
  const [showToneMenu, setShowToneMenu] = useState(false)
  const [showTranslateMenu, setShowTranslateMenu] = useState(false)

  const handleAction = async (action, opts?) => {
    const selectedText = editor.getSelectedText()
    if (!selectedText) return

    let accumulated = ''
    await transform(
      { action, selectedText, documentId, ...opts },
      (chunk) => { accumulated += chunk },
    )
    // Replace selection with accumulated result
    editor.insertInlineContent([{ type: 'text', text: accumulated }])
  }

  return (
    <div className="ai-toolbar flex gap-1 rounded-lg bg-white shadow-lg border p-1">
      <ToolbarButton icon={Wand} label="Edit with AI" onClick={() => { /* show input */ }} />
      <ToolbarButton icon={Minus} label="Shorter" onClick={() => handleAction('shorter')} />
      <ToolbarButton icon={Plus} label="Longer" onClick={() => handleAction('longer')} />
      <ToolbarButton icon={Palette} label="Tone" onClick={() => setShowToneMenu(true)} />
      <ToolbarButton icon={Globe} label="Translate" onClick={() => setShowTranslateMenu(true)} />
      <ToolbarButton icon={Check} label="Fix grammar" onClick={() => handleAction('fix-grammar')} />
      {isGenerating && <Spinner />}
    </div>
  )
}
```

**Positioning:** Use BlockNote's `FormattingToolbar` component to add AI buttons alongside default formatting buttons. This avoids building a custom floating toolbar from scratch.

### 5. Integrate into editor.tsx

```tsx
// In editor.tsx, modify BlockNoteView:
<BlockNoteView
  editor={editor}
  onChange={handleChange}
  theme={theme}
  slashMenu={false}  // disable default to use custom
  formattingToolbar={false}  // disable default to use custom
>
  <SuggestionMenuController
    triggerCharacter="/"
    getItems={(query) => filterSuggestionItems([
      ...getDefaultReactSlashMenuItems(editor),
      ...getAISlashMenuItems(editor, documentId, aiHook),
    ], query)}
  />
  <FormattingToolbarController
    formattingToolbar={() => (
      <FormattingToolbar>
        {/* Default buttons */}
        <BlockTypeSelect />
        <BasicTextStyleButton />
        {/* AI buttons */}
        <AISelectionToolbar editor={editor} documentId={documentId} />
      </FormattingToolbar>
    )}
  />
</BlockNoteView>
```

### 6. Streaming insertion into editor

For slash commands (generate), accumulate streamed text then insert as blocks:

```typescript
let accumulated = ''
await generate(body, (chunk) => {
  accumulated += chunk
})
// Convert markdown to blocks and insert
const blocks = await editor.tryParseMarkdownToBlocks(accumulated)
editor.insertBlocks(blocks, currentBlock, 'after')
```

For transform (selection), replace selection with accumulated result:

```typescript
let accumulated = ''
await transform(body, (chunk) => {
  accumulated += chunk
})
editor.insertInlineContent([{ type: 'text', text: accumulated }])
```

## Todo List

- [x] Create `ai-stream-reader.ts` SSE utility
- [x] Create `use-ai.ts` hook
- [x] Create `ai-slash-commands.ts` with 5 commands
- [x] Create `ai-selection-toolbar.tsx` with 6 actions
- [x] Modify `editor.tsx` to integrate custom slash menu + toolbar
- [x] Add loading states and error handling
- [x] Test streaming insertion in editor
- [x] Test on mobile viewport
- [x] Run `pnpm type-check` and `pnpm build`

## Success Criteria

- Typing `/ai-` shows AI commands in slash menu
- `/ai-continue` generates and inserts text at cursor position
- Selecting text shows AI toolbar with 6 action buttons
- "Write shorter" replaces selection with condensed version
- Loading spinner visible during generation
- Error message shown when AI fails
- Works on mobile (toolbar visible, buttons tappable)

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| BlockNote API changes in future versions | Medium | Pin @blocknote/* versions, test before upgrading |
| Streaming insertion causes layout shifts | Low | Insert as single block after complete, not character-by-character |
| Slash menu prompt input UX is awkward | Medium | Start with simple approach, iterate UX in follow-up |

## Security Considerations

- All AI requests go through authenticated API routes
- No direct AI provider calls from frontend
- documentId validated server-side for tenant isolation

## Next Steps

→ Phase 5: Settings & Usage Dashboard (admin UI)
→ Phase 6: Auto-summarize & RAG (backend integration)
