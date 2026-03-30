/** Hook for navigating to documents with URL sync */

import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../stores/app-store'

interface DocRef {
  id: string
  title: string
  slug: string
}

export function useDocumentNavigation() {
  const navigate = useNavigate()
  const { openTab, setActiveTab, closeTab } = useAppStore()

  const openDocument = (doc: DocRef) => {
    const tabId = `tab-${doc.id}`
    openTab({ id: tabId, documentId: doc.id, title: doc.title })
    setActiveTab(tabId)
    navigate(`/doc/${doc.slug}`)
  }

  const closeDocument = (tabId: string) => {
    const { openTabs: tabs, activeTabId: activeId } = useAppStore.getState()
    const idx = tabs.findIndex((t) => t.id === tabId)
    const isActive = activeId === tabId
    closeTab(tabId)

    if (!isActive) return

    const remaining = tabs.filter((t) => t.id !== tabId)
    if (remaining.length === 0) {
      navigate('/')
    } else {
      // Navigate to adjacent tab
      const nextTab = idx > 0 ? remaining[idx - 1] : remaining[0]
      // Find the doc slug for the next tab — use documentId to construct a fallback
      navigate(`/doc/${nextTab.documentId}`)
    }
  }

  return { openDocument, closeDocument }
}
