/** Horizontal tab bar for open documents */

import { useAppStore } from '../../stores/app-store'
import { TabItem } from './tab-item'
import { cn } from '../../lib/utils'

export function TabBar() {
  const { openTabs, activeTabId, theme } = useAppStore()
  const isDark = theme === 'dark'

  return (
    <div
      className={cn(
        'flex h-9 shrink-0 overflow-x-auto border-b',
        isDark ? 'border-white/[0.06] bg-surface-1' : 'border-neutral-200 bg-neutral-50',
      )}
    >
      {openTabs.map((tab) => (
        <TabItem key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
      ))}
    </div>
  )
}
