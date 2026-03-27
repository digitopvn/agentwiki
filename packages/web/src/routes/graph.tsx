/** Knowledge Graph page — interactive Cytoscape.js visualization + AI insights */

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGraphData } from '../hooks/use-graph'
import { GraphCanvas } from '../components/graph/graph-canvas'
import { GraphToolbar, type GraphFilters } from '../components/graph/graph-toolbar'
import { GraphInsightPanel } from '../components/graph/graph-insight-panel'

export function GraphPage() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<GraphFilters>({})
  const [selectedNodes, setSelectedNodes] = useState<string[]>([])
  const { data, isLoading } = useGraphData(filters)

  const handleNodeSelect = useCallback((nodeId: string) => {
    setSelectedNodes((prev) => {
      // Shift-click: add to selection (max 2)
      if (prev.length === 1 && prev[0] !== nodeId) return [prev[0], nodeId]
      return [nodeId]
    })
  }, [])

  const handleNodeNavigate = useCallback((docId: string) => {
    // Navigate to document editor — find slug from graph data
    const node = data?.nodes.find((n) => n.data.id === docId)
    if (node) navigate(`/doc/${node.data.id}`)
  }, [data, navigate])

  return (
    <div className="flex h-dvh flex-col bg-surface-0">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
        <button
          onClick={() => navigate('/')}
          className="text-neutral-400 hover:text-neutral-200"
          title="Back to editor"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <h1 className="text-sm font-semibold text-neutral-200">Knowledge Graph</h1>
        {isLoading && (
          <div className="h-3.5 w-3.5 animate-spin rounded-full border border-neutral-600 border-t-brand-500" />
        )}
      </div>

      {/* Toolbar */}
      <GraphToolbar filters={filters} onChange={setFilters} stats={data?.stats} />

      {/* Main content: graph canvas + insight panel */}
      <div className="flex flex-1 overflow-hidden">
        {data ? (
          <GraphCanvas
            data={data}
            onNodeSelect={handleNodeSelect}
            onNodeNavigate={handleNodeNavigate}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            {isLoading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-700 border-t-brand-500" />
                <span className="text-xs text-neutral-500">Loading graph...</span>
              </div>
            ) : (
              <span className="text-sm text-neutral-600">No documents found</span>
            )}
          </div>
        )}
        <GraphInsightPanel
          selectedNodes={selectedNodes}
          onNavigate={handleNodeNavigate}
        />
      </div>
    </div>
  )
}
