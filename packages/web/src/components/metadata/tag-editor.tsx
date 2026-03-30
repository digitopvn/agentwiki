/** Tag input with add/remove for a document */

import { useState, useRef } from 'react'
import { X, Plus, Tag } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../lib/api-client'
import { useAppStore } from '../../stores/app-store'
import { cn } from '../../lib/utils'

interface TagEditorProps {
  documentId: string
}

interface TagRecord {
  tag: string
  count: number
}

// Local tags per document are stored client-side until we have a dedicated tag endpoint per doc.
// In a real backend integration, POST/DELETE /api/documents/:id/tags would be used.
export function TagEditor({ documentId }: TagEditorProps) {
  const { theme } = useAppStore()
  const isDark = theme === 'dark'

  const [tags, setTags] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: allTagsData } = useQuery<{ tags: TagRecord[] }>({
    queryKey: ['tags'],
    queryFn: () => apiClient.get<{ tags: TagRecord[] }>('/api/tags'),
  })

  const suggestions = (allTagsData?.tags ?? [])
    .map((t) => t.tag)
    .filter((t) => !tags.includes(t) && t.toLowerCase().includes(input.toLowerCase()))
    .slice(0, 8)

  const addTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase()
    if (!trimmed || tags.includes(trimmed)) return
    setTags((prev) => [...prev, trimmed])
    setInput('')
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (input.trim()) addTag(input)
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Tag className="h-3.5 w-3.5 text-neutral-500" />
        <h3 className={cn('text-xs font-semibold uppercase tracking-wider', isDark ? 'text-neutral-400' : 'text-neutral-500')}>
          Tags
        </h3>
      </div>

      {/* Tag chips */}
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <span
            key={tag}
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs',
              isDark ? 'bg-neutral-800 text-neutral-200' : 'bg-neutral-100 text-neutral-700',
            )}
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="text-neutral-400 hover:text-neutral-100"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>

      {/* Input */}
      <div className="relative">
        <div className={cn(
          'flex items-center gap-1 rounded border px-2 py-1',
          isDark ? 'border-neutral-700 bg-neutral-800' : 'border-neutral-300 bg-white',
        )}>
          <Plus className="h-3 w-3 shrink-0 text-neutral-500" />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setShowSuggestions(true)
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Add tag..."
            className={cn(
              'flex-1 bg-transparent text-base outline-none placeholder-neutral-500 md:text-xs',
              isDark ? 'text-neutral-100' : 'text-neutral-900',
            )}
          />
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className={cn(
            'absolute left-0 right-0 top-full z-10 mt-1 rounded border shadow-lg',
            isDark ? 'border-neutral-700 bg-neutral-800' : 'border-neutral-200 bg-white',
          )}>
            {suggestions.map((s) => (
              <button
                key={s}
                onMouseDown={(e) => { e.preventDefault(); addTag(s) }}
                className={cn(
                  'w-full px-3 py-1.5 text-left text-xs',
                  isDark ? 'text-neutral-200 hover:bg-neutral-700' : 'text-neutral-700 hover:bg-neutral-50',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className={cn('text-xs', isDark ? 'text-neutral-600' : 'text-neutral-400')}>
        Press Enter or comma to add
      </p>
    </div>
  )
}
