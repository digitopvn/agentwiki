/**
 * Sanitize bare code fences (``` without language) to prevent BlockNote parse crash.
 *
 * BlockNote's ProseMirror HTML parser calls .toLowerCase() on the code-block
 * language attribute. When a fence has no language, the attribute is undefined
 * and the call throws: "Cannot read properties of undefined (reading 'toLowerCase')".
 *
 * Fix: prepend a default language identifier to bare opening fences.
 * Closing fences are left untouched so markdown-it still matches them.
 */
export function sanitizeCodeFences(md: string): string {
  let inCodeBlock = false

  return md
    .split('\n')
    .map((line) => {
      const trimmed = line.trimEnd()

      // Bare fence: 3+ backticks (or tildes) with no language after them
      if (/^(`{3,}|~{3,})\s*$/.test(trimmed)) {
        if (!inCodeBlock) {
          // Opening fence — append default language
          inCodeBlock = true
          return trimmed + 'text'
        }
        // Closing fence — leave as-is
        inCodeBlock = false
        return line
      }

      // Fence WITH a language identifier (opening only)
      if (/^(`{3,}|~{3,})\S/.test(trimmed) && !inCodeBlock) {
        inCodeBlock = true
      }

      return line
    })
    .join('\n')
}
