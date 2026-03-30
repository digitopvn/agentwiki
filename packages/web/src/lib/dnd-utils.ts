/** Drag & drop utilities for sidebar folder tree */

import { useMemo } from 'react'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'
import type { FolderTree } from '../hooks/use-folders'

export type DragItemType = 'folder' | 'document'

export interface DragData {
  type: DragItemType
  id: string
  name: string
  parentId: string | null
}

/**
 * Check if `targetId` is a descendant of `dragId` in the folder tree.
 * Used to prevent dropping a parent folder into its own child (cycle).
 */
export function isDescendant(
  dragId: string,
  targetId: string,
  folders: FolderTree[],
): boolean {
  const map = buildFolderMap(folders)
  const dragNode = map.get(dragId)
  if (!dragNode) return false
  return hasDescendant(dragNode, targetId)
}

function hasDescendant(node: FolderTree, targetId: string): boolean {
  for (const child of node.children) {
    if (child.id === targetId) return true
    if (hasDescendant(child, targetId)) return true
  }
  return false
}

/**
 * Filter right-clicks from drag listeners so context menu still works.
 * @dnd-kit PointerSensor fires on any pointerdown including right-click.
 */
export function useLeftClickDragListeners(listeners: SyntheticListenerMap | undefined) {
  return useMemo(() => {
    if (!listeners) return undefined
    const { onPointerDown, ...rest } = listeners
    return {
      ...rest,
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return // only left-click
        ;(onPointerDown as (e: React.PointerEvent) => void)?.(e)
      },
    }
  }, [listeners])
}

/** Build a flat lookup map from nested folder tree */
function buildFolderMap(folders: FolderTree[]): Map<string, FolderTree> {
  const map = new Map<string, FolderTree>()
  function walk(nodes: FolderTree[]) {
    for (const node of nodes) {
      map.set(node.id, node)
      walk(node.children)
    }
  }
  walk(folders)
  return map
}
