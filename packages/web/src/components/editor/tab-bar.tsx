/** Horizontal tab bar for open documents */

import { useAppStore } from '../../stores/app-store'
import { TabItem } from './tab-item'

export function TabBar() {
  const { openTabs, activeTabId } = useAppStore()

  return (
    <div className="flex h-9 shrink-0 overflow-x-auto border-b border-neutral-800 bg-neutral-900">
      {openTabs.map((tab) => (
        <TabItem key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
      ))}
    </div>
  )
}
