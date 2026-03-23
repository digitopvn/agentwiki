/** Search filter chips for faceted filtering — categories, tags, date ranges */

import { X, Tag, Folder, Calendar } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { SearchFilters, SearchFacets } from '@agentwiki/shared'

interface SearchFiltersProps {
  filters: SearchFilters
  facets?: SearchFacets
  onChange: (filters: SearchFilters) => void
  isDark: boolean
}

export function SearchFiltersBar({ filters, facets, onChange, isDark }: SearchFiltersProps) {
  const hasActiveFilters = filters.category || filters.tags?.length || filters.dateFrom

  const removeFilter = (key: keyof SearchFilters) => {
    onChange({ ...filters, [key]: undefined })
  }

  const removeTag = (tag: string) => {
    const newTags = filters.tags?.filter((t) => t !== tag)
    onChange({ ...filters, tags: newTags?.length ? newTags : undefined })
  }

  const addTag = (tag: string) => {
    const current = filters.tags ?? []
    if (!current.includes(tag)) {
      onChange({ ...filters, tags: [...current, tag] })
    }
  }

  const setCategory = (category: string) => {
    onChange({ ...filters, category: filters.category === category ? undefined : category })
  }

  const setDateRange = (preset: 'week' | 'month' | 'quarter' | 'all') => {
    const now = new Date()
    let dateFrom: string | undefined
    if (preset === 'week') dateFrom = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0]
    else if (preset === 'month') dateFrom = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0]
    else if (preset === 'quarter') dateFrom = new Date(now.getTime() - 90 * 86400000).toISOString().split('T')[0]
    onChange({ ...filters, dateFrom, dateTo: undefined })
  }

  const chipBase = cn(
    'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer transition-colors',
  )
  const chipInactive = isDark
    ? 'bg-surface-3 text-neutral-400 hover:bg-surface-4'
    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
  const chipActive = 'bg-brand-600 text-white'

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1">
      {/* Category chips */}
      {facets?.categories?.slice(0, 5).map((cat) => (
        <button
          key={cat.name}
          onClick={() => setCategory(cat.name)}
          className={cn(chipBase, filters.category === cat.name ? chipActive : chipInactive)}
        >
          <Folder className="h-3 w-3" />
          {cat.name}
          <span className="opacity-60">({cat.count})</span>
        </button>
      ))}

      {/* Tag chips */}
      {facets?.tags?.slice(0, 5).map((tag) => {
        const isActive = filters.tags?.includes(tag.name)
        return (
          <button
            key={tag.name}
            onClick={() => (isActive ? removeTag(tag.name) : addTag(tag.name))}
            className={cn(chipBase, isActive ? chipActive : chipInactive)}
          >
            <Tag className="h-3 w-3" />
            {tag.name}
            <span className="opacity-60">({tag.count})</span>
          </button>
        )
      })}

      {/* Date range presets */}
      {[
        { key: 'week' as const, label: 'This week' },
        { key: 'month' as const, label: 'This month' },
        { key: 'quarter' as const, label: '3 months' },
      ].map(({ key, label }) => {
        const isActive =
          (key === 'week' && filters.dateFrom && daysDiff(filters.dateFrom) <= 8) ||
          (key === 'month' && filters.dateFrom && daysDiff(filters.dateFrom) <= 31 && daysDiff(filters.dateFrom) > 8) ||
          (key === 'quarter' && filters.dateFrom && daysDiff(filters.dateFrom) > 31)
        return (
          <button
            key={key}
            onClick={() => setDateRange(key)}
            className={cn(chipBase, isActive ? chipActive : chipInactive)}
          >
            <Calendar className="h-3 w-3" />
            {label}
          </button>
        )
      })}

      {/* Clear all */}
      {hasActiveFilters && (
        <button
          onClick={() => onChange({})}
          className={cn(chipBase, 'text-red-400 hover:text-red-300')}
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      )}
    </div>
  )
}

function daysDiff(dateStr: string): number {
  return Math.ceil((Date.now() - new Date(dateStr).getTime()) / 86400000)
}
