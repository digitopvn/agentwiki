/** Main 3-panel shell: sidebar | editor | metadata */

import { useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAppStore } from '../../stores/app-store'
import { useDocumentBySlug, useCreateDocument } from '../../hooks/use-documents'
import { useKeyboardShortcuts, type ShortcutDefinition } from '../../hooks/use-keyboard-shortcuts'
import { Sidebar } from './sidebar'
import { MainPanel } from './main-panel'
import { MetadataPanel } from './metadata-panel'
import { CommandPalette } from '../command-palette/command-palette'
import { cn } from '../../lib/utils'
import { apiClient } from '../../lib/api-client'

export function Layout() {
  const { theme, openTab, setActiveTab, openTabs, activeTabId, closeTab, sidebarCollapsed, setSidebarCollapsed, metadataPanelCollapsed, setMetadataPanelCollapsed } = useAppStore()
  const navigate = useNavigate()
  const createDocument = useCreateDocument()
  const { slug } = useParams<{ slug: string }>()
  const { data: slugDoc } = useDocumentBySlug(slug)

  // Hydrate tab from URL slug
  useEffect(() => {
    if (!slugDoc) return
    const tabId = `tab-${slugDoc.id}`
    const alreadyOpen = openTabs.some((t) => t.documentId === slugDoc.id)
    if (!alreadyOpen) {
      openTab({ id: tabId, documentId: slugDoc.id, title: slugDoc.title })
    }
    setActiveTab(tabId)
  }, [slugDoc])

  // Keyboard shortcuts
  const handleNewDoc = useCallback(async () => {
    const doc = await createDocument.mutateAsync({ title: 'Untitled' })
    const tabId = `tab-${doc.id}`
    openTab({ id: tabId, documentId: doc.id, title: doc.title })
    setActiveTab(tabId)
    navigate(`/doc/${doc.slug}`)
  }, [createDocument, openTab, setActiveTab, navigate])

  const shortcuts = useMemo<ShortcutDefinition[]>(() => [
    { keys: 'ctrl+n', action: handleNewDoc },
    { keys: 'ctrl+\\', action: () => setSidebarCollapsed(!sidebarCollapsed) },
    { keys: 'ctrl+.', action: () => setMetadataPanelCollapsed(!metadataPanelCollapsed) },
    { keys: 'ctrl+s', action: async () => {
      const activeTab = openTabs.find((t) => t.id === activeTabId)
      if (!activeTab) return
      try { await apiClient.post(`/api/documents/${activeTab.documentId}/versions`) } catch {}
    }},
    { keys: 'ctrl+shift+[', action: () => {
      const idx = openTabs.findIndex((t) => t.id === activeTabId)
      if (idx > 0) {
        setActiveTab(openTabs[idx - 1].id)
        navigate(`/doc/${openTabs[idx - 1].documentId}`)
      }
    }},
    { keys: 'ctrl+shift+]', action: () => {
      const idx = openTabs.findIndex((t) => t.id === activeTabId)
      if (idx < openTabs.length - 1) {
        setActiveTab(openTabs[idx + 1].id)
        navigate(`/doc/${openTabs[idx + 1].documentId}`)
      }
    }},
  ], [handleNewDoc, sidebarCollapsed, metadataPanelCollapsed, openTabs, activeTabId, setSidebarCollapsed, setMetadataPanelCollapsed, setActiveTab, navigate])

  useKeyboardShortcuts(shortcuts)

  // Apply theme class to document root
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
      root.classList.remove('light')
    } else {
      root.classList.add('light')
      root.classList.remove('dark')
    }
  }, [theme])

  return (
    <div
      className={cn(
        'flex h-screen overflow-hidden font-sans antialiased',
        theme === 'dark' ? 'bg-surface-0 text-neutral-100' : 'bg-neutral-50 text-neutral-900',
      )}
    >
      <Sidebar />
      <MainPanel />
      <MetadataPanel />
      <CommandPalette />
    </div>
  )
}
