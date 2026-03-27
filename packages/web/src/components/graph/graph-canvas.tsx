/** Cytoscape.js graph visualization wrapper */

import { useRef, useEffect, useCallback, useMemo } from 'react'
import cytoscape from 'cytoscape'
import type { Core, EventObject } from 'cytoscape'
import type { GraphResponse } from '@agentwiki/shared'

/** Edge type -> color + line style mapping */
const EDGE_STYLES: Record<string, { color: string; lineStyle: string }> = {
  'relates-to': { color: '#6b7280', lineStyle: 'solid' },
  'depends-on': { color: '#3b82f6', lineStyle: 'solid' },
  'extends': { color: '#22c55e', lineStyle: 'solid' },
  'references': { color: '#9ca3af', lineStyle: 'dashed' },
  'contradicts': { color: '#ef4444', lineStyle: 'dashed' },
  'implements': { color: '#a855f7', lineStyle: 'solid' },
}

/** Category -> node color mapping */
const CATEGORY_COLORS: Record<string, string> = {
  guide: '#3b82f6',
  reference: '#8b5cf6',
  tutorial: '#22c55e',
  api: '#f59e0b',
  concept: '#ec4899',
}
const DEFAULT_NODE_COLOR = '#6b7280'

/** Build Cytoscape stylesheet (stable reference) */
const CY_STYLE = [
  // Node styling
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'font-size': '10px',
      'font-family': 'Inter, system-ui, sans-serif',
      color: '#e5e7eb',
      'text-outline-color': '#111827',
      'text-outline-width': 1.5,
      'text-valign': 'bottom',
      'text-margin-y': 6,
      'text-max-width': '100px',
      'text-wrap': 'ellipsis',
      width: 'mapData(degree, 0, 20, 20, 50)',
      height: 'mapData(degree, 0, 20, 20, 50)',
      'background-color': DEFAULT_NODE_COLOR,
      'border-width': 1.5,
      'border-color': '#374151',
      'overlay-opacity': 0,
    },
  },
  // Node hover
  {
    selector: 'node:active, node:selected',
    style: {
      'border-color': '#60a5fa',
      'border-width': 2.5,
    },
  },
  // Explicit edge styling (default)
  {
    selector: 'edge',
    style: {
      width: 1.5,
      'line-color': '#6b7280',
      'target-arrow-color': '#6b7280',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.8,
      'curve-style': 'bezier',
      opacity: 0.7,
    },
  },
  // Implicit edges (similarity)
  {
    selector: 'edge[?implicit]',
    style: {
      'line-style': 'dotted',
      'line-color': '#4b5563',
      'target-arrow-shape': 'none',
      opacity: 0.5,
      width: 1,
    },
  },
  // Typed edge colors
  ...Object.entries(EDGE_STYLES).map(([type, style]) => ({
    selector: `edge[type="${type}"]`,
    style: {
      'line-color': style.color,
      'target-arrow-color': style.color,
      'line-style': style.lineStyle as 'solid' | 'dashed',
    },
  })),
  // Category node colors
  ...Object.entries(CATEGORY_COLORS).map(([cat, color]) => ({
    selector: `node[category="${cat}"]`,
    style: {
      'background-color': color,
    },
  })),
]

interface GraphCanvasProps {
  data: GraphResponse | undefined
  onNodeSelect?: (nodeId: string) => void
  onNodeNavigate?: (nodeId: string) => void
  className?: string
}

/** Convert GraphResponse to Cytoscape element definitions */
function toElements(data: GraphResponse) {
  return [
    ...data.nodes.map((n) => ({
      group: 'nodes' as const,
      data: {
        id: n.data.id,
        label: n.data.label,
        category: n.data.category ?? 'default',
        degree: n.data.degree ?? 0,
        summary: n.data.summary ?? '',
        tags: (n.data.tags ?? []).join(', '),
      },
    })),
    ...data.edges.map((e) => ({
      group: 'edges' as const,
      data: {
        id: e.data.id,
        source: e.data.source,
        target: e.data.target,
        type: e.data.type,
        implicit: e.data.implicit,
        weight: e.data.weight,
        score: e.data.score,
        context: e.data.context ?? '',
      },
    })),
  ]
}

export function GraphCanvas({ data, onNodeSelect, onNodeNavigate, className = '' }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const callbacksRef = useRef({ onNodeSelect, onNodeNavigate })
  callbacksRef.current = { onNodeSelect, onNodeNavigate }

  /** Initialize Cytoscape once */
  useEffect(() => {
    if (!containerRef.current) return

    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: CY_STYLE as never,
      layout: { name: 'preset' },
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.3,
    })

    // Event handlers use ref to avoid re-creating cy on callback changes
    cy.on('tap', 'node', (evt: EventObject) => {
      callbacksRef.current.onNodeSelect?.(evt.target.id())
    })
    cy.on('dbltap', 'node', (evt: EventObject) => {
      callbacksRef.current.onNodeNavigate?.(evt.target.id())
    })

    cyRef.current = cy

    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, []) // mount once

  /** Update elements in-place when data changes (preserve zoom/pan state) */
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !data) return

    const newElements = toElements(data)

    // Batch update: remove old elements, add new, re-run layout
    cy.elements().remove()
    cy.add(newElements)
    cy.layout({
      name: 'cose',
      animate: false,
      nodeRepulsion: () => 8000,
      idealEdgeLength: () => 120,
      gravity: 0.3,
      numIter: 300,
      nodeDimensionsIncludeLabels: true,
    } as never).run()
  }, [data])

  /** Fit graph to viewport */
  const handleFit = useCallback(() => {
    cyRef.current?.fit(undefined, 40)
  }, [])

  /** Zoom in */
  const handleZoomIn = useCallback(() => {
    const cy = cyRef.current
    if (cy) cy.zoom({ level: cy.zoom() * 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } })
  }, [])

  /** Zoom out */
  const handleZoomOut = useCallback(() => {
    const cy = cyRef.current
    if (cy) cy.zoom({ level: cy.zoom() / 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } })
  }, [])

  return (
    <div className={`relative flex-1 ${className}`}>
      <div ref={containerRef} className="h-full w-full" />

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1">
        <button
          onClick={handleZoomIn}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-2 text-neutral-300 hover:bg-surface-3 hover:text-neutral-100"
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-2 text-neutral-300 hover:bg-surface-3 hover:text-neutral-100"
          title="Zoom out"
        >
          &minus;
        </button>
        <button
          onClick={handleFit}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-2 text-xs text-neutral-300 hover:bg-surface-3 hover:text-neutral-100"
          title="Fit to screen"
        >
          &boxbox;
        </button>
      </div>

      {/* Legend — hidden on small phones to avoid overlap with zoom controls */}
      <div className="absolute bottom-4 left-4 hidden rounded-lg bg-surface-1/90 p-3 backdrop-blur-sm sm:block">
        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-neutral-500">Edge Types</div>
        <div className="flex flex-col gap-1">
          {Object.entries(EDGE_STYLES).map(([type, style]) => (
            <div key={type} className="flex items-center gap-2">
              <div className="h-0.5 w-4" style={{ backgroundColor: style.color, borderStyle: style.lineStyle === 'dashed' ? 'dashed' : 'solid' }} />
              <span className="text-[10px] text-neutral-400">{type}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <div className="h-0.5 w-4 border-t border-dotted border-neutral-600" />
            <span className="text-[10px] text-neutral-400">similarity</span>
          </div>
        </div>
      </div>
    </div>
  )
}
