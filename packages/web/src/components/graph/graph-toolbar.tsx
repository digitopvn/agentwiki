/** Graph filter toolbar — edge types, category, implicit toggle */

import { EDGE_TYPES } from '@agentwiki/shared'

export interface GraphFilters {
  category?: string
  tag?: string
  types?: string[]
  includeImplicit?: boolean
}

interface GraphToolbarProps {
  filters: GraphFilters
  onChange: (filters: GraphFilters) => void
  stats?: { nodeCount: number; edgeCount: number; explicitEdges: number; implicitEdges: number }
}

export function GraphToolbar({ filters, onChange, stats }: GraphToolbarProps) {
  const toggleType = (type: string) => {
    const current = filters.types ?? []
    const updated = current.includes(type) ? current.filter((t) => t !== type) : [...current, type]
    onChange({ ...filters, types: updated.length ? updated : undefined })
  }

  return (
    <div className="flex items-center gap-3 overflow-x-auto border-b border-white/[0.06] px-4 py-2.5 scrollbar-none">
      {/* Edge type filters */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">Edges:</span>
        {EDGE_TYPES.map((type) => {
          const active = !filters.types?.length || filters.types.includes(type)
          return (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`rounded-md px-2 py-0.5 text-[11px] transition-colors ${
                active
                  ? 'bg-surface-3 text-neutral-200'
                  : 'bg-transparent text-neutral-600 hover:text-neutral-400'
              }`}
            >
              {type}
            </button>
          )
        })}
      </div>

      {/* Implicit edge toggle */}
      <label className="flex cursor-pointer items-center gap-1.5">
        <input
          type="checkbox"
          checked={filters.includeImplicit ?? true}
          onChange={(e) => onChange({ ...filters, includeImplicit: e.target.checked })}
          className="h-3 w-3 rounded border-neutral-600 bg-surface-2 text-brand-500 focus:ring-0"
        />
        <span className="text-[11px] text-neutral-400">Similarity</span>
      </label>

      {/* Stats */}
      {stats && (
        <div className="ml-auto flex items-center gap-3 text-[11px] text-neutral-500">
          <span>{stats.nodeCount} nodes</span>
          <span>{stats.explicitEdges} links</span>
          {stats.implicitEdges > 0 && <span>{stats.implicitEdges} similar</span>}
        </div>
      )}
    </div>
  )
}
