/** Reactive hook to detect mobile viewport (< 768px) */

import { useSyncExternalStore } from 'react'

const MOBILE_QUERY = '(max-width: 767px)'

/** Hoisted MQL instance — avoids re-allocation on every subscribe/getSnapshot call */
const mql = typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY) : null

function subscribe(callback: () => void) {
  if (!mql) return () => {}
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function getSnapshot() {
  return mql?.matches ?? false
}

function getServerSnapshot() {
  return false
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
