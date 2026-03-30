/** AI insight panel — stats, similar docs, path info for selected nodes */

import { useState } from 'react'
import { useGraphStats, useGraphSimilar, useGraphPath } from '../../hooks/use-graph'

interface GraphInsightPanelProps {
  selectedNodes: string[]
  onNavigate?: (docId: string) => void
}

export function GraphInsightPanel({ selectedNodes, onNavigate }: GraphInsightPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { data: stats } = useGraphStats()
  const selectedId = selectedNodes.length === 1 ? selectedNodes[0] : null
  const { data: similarData } = useGraphSimilar(selectedId)

  const fromId = selectedNodes.length === 2 ? selectedNodes[0] : null
  const toId = selectedNodes.length === 2 ? selectedNodes[1] : null
  const { data: pathData, isLoading: isPathLoading } = useGraphPath(fromId, toId)

  /** Type guard: distinguish PathResult from error response */
  const isValidPath = pathData && 'path' in pathData && Array.isArray(pathData.path)

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="absolute right-3 top-14 z-20 flex h-8 w-8 items-center justify-center rounded-md bg-surface-2 text-neutral-300 hover:bg-surface-3 md:hidden"
        title="Toggle insights"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
      </button>

      <div className={`${isOpen ? 'absolute inset-y-0 right-0 z-10 flex' : 'hidden'} w-72 flex-col gap-4 overflow-y-auto border-l border-white/[0.06] bg-surface-1 p-4 md:relative md:flex`}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Graph Insights</h3>
        {/* Close button — visible only on mobile when panel is open */}
        <button
          onClick={() => setIsOpen(false)}
          className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-surface-2 hover:text-neutral-300 md:hidden"
          title="Close panel"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      {/* Stats section */}
      {stats && (
        <section>
          <h4 className="mb-2 text-[11px] font-medium text-neutral-500">Overview</h4>
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Nodes" value={stats.nodeCount} />
            <StatCard label="Edges" value={stats.edgeCount} />
            <StatCard label="Avg Degree" value={stats.avgDegree} />
            <StatCard label="Orphans" value={stats.orphanCount} />
          </div>
          {stats.topConnected.length > 0 && (
            <div className="mt-3">
              <h4 className="mb-1.5 text-[11px] font-medium text-neutral-500">Top Connected</h4>
              {stats.topConnected.slice(0, 5).map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => onNavigate?.(doc.id)}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-surface-2"
                >
                  <span className="truncate text-[11px] text-neutral-300">{doc.title}</span>
                  <span className="ml-2 shrink-0 text-[10px] text-neutral-500">{doc.degree}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Selected node — similar docs */}
      {selectedId && similarData?.results && (
        <section>
          <h4 className="mb-2 text-[11px] font-medium text-neutral-500">Similar Documents</h4>
          {similarData.results.length === 0 && (
            <p className="text-[11px] text-neutral-600">No similar documents found</p>
          )}
          {similarData.results.map((doc) => (
            <button
              key={doc.id}
              onClick={() => onNavigate?.(doc.id)}
              className="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-surface-2"
            >
              <span className="truncate text-[11px] text-neutral-300">{doc.title}</span>
              <span className="ml-2 shrink-0 text-[10px] text-neutral-500">
                {Math.round(doc.score * 100)}%
              </span>
            </button>
          ))}
        </section>
      )}

      {/* Two nodes selected — path */}
      {fromId && toId && (
        <section>
          <h4 className="mb-2 text-[11px] font-medium text-neutral-500">Path Between Nodes</h4>
          {isPathLoading ? (
            <p className="text-[11px] text-neutral-600">Finding path...</p>
          ) : isValidPath ? (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-neutral-400">{pathData.hops} hop{pathData.hops !== 1 ? 's' : ''}</span>
              {pathData.path.map((node, i) => (
                <div key={node.id} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-[10px] text-neutral-600">&rarr;</span>}
                  <button
                    onClick={() => onNavigate?.(node.id)}
                    className="truncate text-[11px] text-brand-400 hover:underline"
                  >
                    {node.title}
                  </button>
                </div>
              ))}
              {pathData.edges.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {pathData.edges.map((e) => (
                    <span key={e.id} className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-neutral-400">
                      {e.type}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-neutral-600">No path found</p>
          )}
        </section>
      )}

      {/* Empty state */}
      {!selectedId && !fromId && (
        <p className="text-[11px] text-neutral-600">
          Click a node to see similar docs. Double-click to navigate. Select two nodes (Shift+click) to see path.
        </p>
      )}
    </div>
    </>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <div className="text-sm font-semibold text-neutral-200">{value}</div>
      <div className="text-[10px] text-neutral-500">{label}</div>
    </div>
  )
}
