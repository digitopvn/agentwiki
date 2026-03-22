/** Edge-swipe gesture hook for mobile drawer open/close */

import { useEffect, useRef, useCallback } from 'react'

interface SwipeGestureOptions {
  onSwipeLeft: () => void
  onSwipeRight: () => void
  edgeThreshold?: number // px from screen edge to trigger (default: 20)
  swipeThreshold?: number // min px horizontal movement (default: 50)
  enabled?: boolean
}

export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  edgeThreshold = 20,
  swipeThreshold = 50,
  enabled = true,
}: SwipeGestureOptions): void {
  const touchStartRef = useRef<{ x: number; y: number; isEdge: 'left' | 'right' | null; isBackdrop: boolean } | null>(null)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const target = e.target as HTMLElement
    // Ignore touches inside drawer panels (conflicts with scrolling content)
    if (target.closest('.drawer-left.drawer-open, .drawer-right.drawer-open')) {
      touchStartRef.current = null
      return
    }

    const touch = e.touches[0]
    const screenWidth = window.innerWidth
    let isEdge: 'left' | 'right' | null = null
    // Touches on backdrop allow close via swipe (isBackdrop flag)
    const isBackdrop = target.closest('.drawer-backdrop.drawer-open') !== null

    if (touch.clientX <= edgeThreshold) isEdge = 'left'
    else if (touch.clientX >= screenWidth - edgeThreshold) isEdge = 'right'

    touchStartRef.current = { x: touch.clientX, y: touch.clientY, isEdge, isBackdrop }
  }, [edgeThreshold])

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    const start = touchStartRef.current
    if (!start) return
    touchStartRef.current = null

    const touch = e.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y

    // Ensure horizontal swipe (angle < 30deg from horizontal)
    if (Math.abs(dy) > Math.abs(dx) * 0.577) return
    if (Math.abs(dx) < swipeThreshold) return

    if (start.isEdge === 'left' && dx > 0) {
      onSwipeRight() // Swipe right from left edge → open sidebar
    } else if (start.isEdge === 'right' && dx < 0) {
      onSwipeLeft() // Swipe left from right edge → open metadata
    } else if (start.isBackdrop) {
      // Swipe on backdrop to close — safe since backdrop has no scrollable content
      if (dx < 0) onSwipeLeft()
      else if (dx > 0) onSwipeRight()
    }
  }, [swipeThreshold, onSwipeLeft, onSwipeRight])

  useEffect(() => {
    if (!enabled) return
    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [enabled, handleTouchStart, handleTouchEnd])
}
