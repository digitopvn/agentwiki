/** Centralized keyboard shortcut definitions with configurable overrides */

export interface ShortcutConfig {
  id: string
  label: string
  defaultKeys: string
  description?: string
}

/** Default keyboard shortcuts — source of truth */
export const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  { id: 'command-palette', label: 'Open command palette', defaultKeys: 'ctrl+k' },
  { id: 'new-document', label: 'New document', defaultKeys: 'ctrl+n' },
  { id: 'save-checkpoint', label: 'Save version checkpoint', defaultKeys: 'ctrl+s' },
  { id: 'toggle-sidebar', label: 'Toggle sidebar', defaultKeys: 'ctrl+\\' },
  { id: 'toggle-metadata', label: 'Toggle metadata panel', defaultKeys: 'ctrl+.' },
  { id: 'prev-tab', label: 'Previous tab', defaultKeys: 'ctrl+shift+[' },
  { id: 'next-tab', label: 'Next tab', defaultKeys: 'ctrl+shift+]' },
  { id: 'close-modal', label: 'Close modals', defaultKeys: 'escape' },
]

// TODO: Shortcuts are stored in localStorage — they don't sync across devices.
// When multi-device session support is added, migrate to server-side storage.
const STORAGE_KEY = 'agentwiki:shortcuts'

/** Get user's custom shortcut overrides from localStorage */
export function getCustomShortcuts(): Record<string, string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

/** Save a custom shortcut binding. Returns conflicting shortcut id if duplicate found, or null on success. */
export function setCustomShortcut(id: string, keys: string): string | null {
  // Check for conflicts across all active bindings
  const all = getActiveShortcuts()
  const conflict = all.find((s) => s.id !== id && s.activeKeys === keys)
  if (conflict) return conflict.id

  const custom = getCustomShortcuts()
  custom[id] = keys
  localStorage.setItem(STORAGE_KEY, JSON.stringify(custom))
  return null
}

/** Remove a custom shortcut (revert to default) */
export function resetCustomShortcut(id: string) {
  const custom = getCustomShortcuts()
  delete custom[id]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(custom))
}

/** Reset all custom shortcuts */
export function resetAllShortcuts() {
  localStorage.removeItem(STORAGE_KEY)
}

/** Get the active key binding for a shortcut (custom override or default) */
export function getActiveKeys(id: string): string {
  const custom = getCustomShortcuts()
  const shortcut = DEFAULT_SHORTCUTS.find((s) => s.id === id)
  return custom[id] ?? shortcut?.defaultKeys ?? ''
}

/** Get all shortcuts with their active bindings */
export function getActiveShortcuts(): (ShortcutConfig & { activeKeys: string; isCustom: boolean })[] {
  const custom = getCustomShortcuts()
  return DEFAULT_SHORTCUTS.map((s) => ({
    ...s,
    activeKeys: custom[s.id] ?? s.defaultKeys,
    isCustom: !!custom[s.id],
  }))
}

/** Format a key combo for display: 'ctrl+shift+[' → 'Ctrl + Shift + [' (or Cmd on Mac) */
export function formatKeyCombo(combo: string): string {
  const isMac = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform?.includes('Mac')
    ?? navigator.platform?.includes('Mac')
    ?? navigator.userAgent?.includes('Mac')
  return combo
    .split('+')
    .map((part) => {
      const p = part.trim().toLowerCase()
      if (p === 'ctrl' || p === 'meta') return isMac ? 'Cmd' : 'Ctrl'
      if (p === 'shift') return 'Shift'
      if (p === 'alt') return isMac ? 'Option' : 'Alt'
      if (p === 'escape') return 'Esc'
      if (p === '\\') return '\\'
      return p.toUpperCase()
    })
    .join(' + ')
}
