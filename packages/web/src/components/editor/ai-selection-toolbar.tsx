/** AI-powered text transformation toolbar for BlockNote selection */

import { useState, useCallback } from 'react'
import type { BlockNoteEditor } from '@blocknote/core'
import type { AITransformAction, AITransformBody, AITone } from '@agentwiki/shared'

interface AISelectionToolbarProps {
  editor: BlockNoteEditor
  documentId: string
  transform: (body: AITransformBody, onChunk: (text: string) => void) => Promise<void>
  isGenerating: boolean
}

const TONES: AITone[] = ['professional', 'casual', 'formal', 'friendly']
const LANGUAGES = ['English', 'Vietnamese', 'Chinese', 'Japanese', 'Spanish', 'French', 'German', 'Korean']

export function AISelectionToolbar({ editor, documentId, transform, isGenerating }: AISelectionToolbarProps) {
  const [showToneMenu, setShowToneMenu] = useState(false)
  const [showTranslateMenu, setShowTranslateMenu] = useState(false)

  const handleAction = useCallback(
    async (action: AITransformAction, opts?: { tone?: AITone; language?: string; instruction?: string }) => {
      const selectedText = editor.getSelectedText()
      if (!selectedText) return

      setShowToneMenu(false)
      setShowTranslateMenu(false)

      let accumulated = ''
      await transform(
        { action, selectedText, documentId, ...opts },
        (chunk) => {
          accumulated += chunk
        },
      )

      if (accumulated) {
        editor.insertInlineContent([{ type: 'text', text: accumulated, styles: {} }])
      }
    },
    [editor, documentId, transform],
  )

  const handleEdit = useCallback(async () => {
    const instruction = window.prompt('How should AI edit this text?')
    if (!instruction) return
    await handleAction('edit', { instruction })
  }, [handleAction])

  return (
    <div className="ai-toolbar" style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
      {/* Divider from default toolbar */}
      <div style={{ width: 1, height: 20, backgroundColor: 'var(--bn-colors-border)', margin: '0 4px' }} />

      <ToolbarBtn label="Edit with AI" onClick={handleEdit} disabled={isGenerating}>
        ✏️
      </ToolbarBtn>
      <ToolbarBtn label="Shorter" onClick={() => handleAction('shorter')} disabled={isGenerating}>
        ↙
      </ToolbarBtn>
      <ToolbarBtn label="Longer" onClick={() => handleAction('longer')} disabled={isGenerating}>
        ↗
      </ToolbarBtn>

      {/* Tone dropdown */}
      <div style={{ position: 'relative' }}>
        <ToolbarBtn
          label="Change tone"
          onClick={() => {
            setShowToneMenu(!showToneMenu)
            setShowTranslateMenu(false)
          }}
          disabled={isGenerating}
        >
          🎭
        </ToolbarBtn>
        {showToneMenu && (
          <DropdownMenu
            items={TONES}
            onSelect={(tone) => handleAction('tone', { tone: tone as AITone })}
            onClose={() => setShowToneMenu(false)}
          />
        )}
      </div>

      {/* Translate dropdown */}
      <div style={{ position: 'relative' }}>
        <ToolbarBtn
          label="Translate"
          onClick={() => {
            setShowTranslateMenu(!showTranslateMenu)
            setShowToneMenu(false)
          }}
          disabled={isGenerating}
        >
          🌐
        </ToolbarBtn>
        {showTranslateMenu && (
          <DropdownMenu
            items={LANGUAGES}
            onSelect={(lang) => handleAction('translate', { language: lang })}
            onClose={() => setShowTranslateMenu(false)}
          />
        )}
      </div>

      <ToolbarBtn label="Fix grammar" onClick={() => handleAction('fix-grammar')} disabled={isGenerating}>
        ✓
      </ToolbarBtn>

      {isGenerating && <span style={{ fontSize: 12, opacity: 0.6, marginLeft: 4 }}>AI...</span>}
    </div>
  )
}

/** Simple toolbar button */
function ToolbarBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'none',
        border: 'none',
        cursor: disabled ? 'wait' : 'pointer',
        padding: '4px 6px',
        borderRadius: 4,
        opacity: disabled ? 0.5 : 1,
        fontSize: 14,
        lineHeight: 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = 'var(--bn-colors-hovered)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent'
      }}
    >
      {children}
    </button>
  )
}

/** Simple dropdown menu for tone/language selection */
function DropdownMenu({
  items,
  onSelect,
  onClose,
}: {
  items: string[]
  onSelect: (item: string) => void
  onClose: () => void
}) {
  return (
    <>
      {/* Backdrop to close menu */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={onClose} />
      <div
        style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          zIndex: 100,
          backgroundColor: 'var(--bn-colors-menu)',
          border: '1px solid var(--bn-colors-border)',
          borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          padding: '4px 0',
          minWidth: 120,
        }}
      >
        {items.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              onSelect(item)
              onClose()
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '6px 12px',
              fontSize: 13,
              color: 'inherit',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bn-colors-hovered)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            {item}
          </button>
        ))}
      </div>
    </>
  )
}
