/** Center panel: tab bar + editor area */

import { useAppStore } from '../../stores/app-store'
import { TabBar } from '../editor/tab-bar'
import { Editor } from '../editor/editor'
import { WelcomeScreen } from '../editor/welcome-screen'

export function MainPanel() {
  const { openTabs, activeTabId } = useAppStore()

  const activeTab = openTabs.find((t) => t.id === activeTabId) ?? null

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {openTabs.length > 0 && <TabBar />}
      <div className="flex-1 overflow-hidden">
        {activeTab ? (
          <Editor key={activeTab.documentId} documentId={activeTab.documentId} tabId={activeTab.id} />
        ) : (
          <WelcomeScreen />
        )}
      </div>
    </div>
  )
}
