/** Global keyboard shortcut listener with modifier key matching */

import { useEffect } from 'react'

export interface ShortcutDefinition {
  /** Key combo string: "ctrl+k", "meta+shift+[", "escape" */
  keys: string
  /** Action to run when matched */
  action: () => void
}

/** Parse a key combo string into parts */
function parseKeys(combo: string) {
  const parts = combo.toLowerCase().split('+')
  return {
    ctrl: parts.includes('ctrl'),
    meta: parts.includes('meta'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key: parts.filter((p) => !['ctrl', 'meta', 'shift', 'alt'].includes(p))[0] ?? '',
  }
}

function matchesShortcut(e: KeyboardEvent, combo: string): boolean {
  const parsed = parseKeys(combo)
  const isMod = parsed.ctrl || parsed.meta

  // Match ctrl OR meta for cross-platform
  if (isMod && !(e.ctrlKey || e.metaKey)) return false
  if (!isMod && (e.ctrlKey || e.metaKey)) return false
  if (parsed.shift !== e.shiftKey) return false
  if (parsed.alt !== e.altKey) return false

  return e.key.toLowerCase() === parsed.key
}

export function useKeyboardShortcuts(shortcuts: ShortcutDefinition[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs (except specific ones)
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      for (const shortcut of shortcuts) {
        if (matchesShortcut(e, shortcut.keys)) {
          // Allow modifier shortcuts even in inputs
          const parsed = parseKeys(shortcut.keys)
          if (isInput && !(parsed.ctrl || parsed.meta)) continue

          e.preventDefault()
          shortcut.action()
          return
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [shortcuts])
}
