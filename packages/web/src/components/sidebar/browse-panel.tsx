/** Browse documents by category or tag — collapsible panel in sidebar */

import { Tag, Layers, X } from 'lucide-react'
import { useTags, useCategories } from '../../hooks/use-tags'
import { useAppStore } from '../../stores/app-store'
import { cn } from '../../lib/utils'

export interface BrowseFilter {
  type: 'category' | 'tag'
  value: string
}

interface BrowsePanelProps {
  activeFilter: BrowseFilter | null
  onSelectFilter: (filter: BrowseFilter) => void
  onClearFilter: () => void
}

export function BrowsePanel({ activeFilter, onSelectFilter, onClearFilter }: BrowsePanelProps) {
  const { theme } = useAppStore()
  const isDark = theme === 'dark'
  const { data: tagsData } = useTags()
  const { data: catsData } = useCategories()

  const tags = tagsData?.tags ?? []
  const categories = catsData?.categories ?? []

  const chipBase = 'cursor-pointer rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors'

  return (
    <div className="space-y-2 px-2">
      {/* Active filter indicator */}
      {activeFilter && (
        <div className={cn('flex items-center gap-1.5 rounded-lg px-2 py-1', isDark ? 'bg-brand-500/10' : 'bg-brand-50')}>
          <span className="text-[11px] text-brand-400">
            {activeFilter.type === 'category' ? 'Category' : 'Tag'}: {activeFilter.value}
          </span>
          <button onClick={onClearFilter} className="ml-auto cursor-pointer rounded p-0.5 text-brand-400 hover:bg-brand-500/20">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Categories */}
      {categories.length > 0 && (
        <div>
          <div className={cn('flex items-center gap-1.5 px-1 py-1 text-[10px] font-semibold uppercase tracking-wider', isDark ? 'text-neutral-600' : 'text-neutral-400')}>
            <Layers className="h-3 w-3" />
            Categories
          </div>
          <div className="flex flex-wrap gap-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => onSelectFilter({ type: 'category', value: cat })}
                className={cn(
                  chipBase,
                  activeFilter?.type === 'category' && activeFilter.value === cat
                    ? 'bg-brand-600 text-white'
                    : isDark
                      ? 'bg-surface-3 text-neutral-400 hover:bg-surface-4 hover:text-neutral-200'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div>
          <div className={cn('flex items-center gap-1.5 px-1 py-1 text-[10px] font-semibold uppercase tracking-wider', isDark ? 'text-neutral-600' : 'text-neutral-400')}>
            <Tag className="h-3 w-3" />
            Tags
          </div>
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <button
                key={tag}
                onClick={() => onSelectFilter({ type: 'tag', value: tag })}
                className={cn(
                  chipBase,
                  activeFilter?.type === 'tag' && activeFilter.value === tag
                    ? 'bg-brand-600 text-white'
                    : isDark
                      ? 'bg-surface-3 text-neutral-400 hover:bg-surface-4 hover:text-neutral-200'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
                )}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {categories.length === 0 && tags.length === 0 && (
        <p className={cn('py-3 text-center text-[11px]', isDark ? 'text-neutral-600' : 'text-neutral-400')}>
          No categories or tags yet
        </p>
      )}
    </div>
  )
}
