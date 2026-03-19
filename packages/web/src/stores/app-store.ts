/** Zustand global app store: tabs, sidebar/panel collapse, theme */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Tab {
  id: string
  documentId: string
  title: string
  isDirty: boolean
}

interface AppState {
  // Tabs
  openTabs: Tab[]
  activeTabId: string | null
  openTab: (tab: Omit<Tab, 'isDirty'>) => void
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  markTabDirty: (tabId: string, dirty: boolean) => void
  updateTabTitle: (tabId: string, title: string) => void

  // Panel visibility
  sidebarCollapsed: boolean
  metadataPanelCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  setMetadataPanelCollapsed: (collapsed: boolean) => void

  // Mobile drawer state
  mobileSidebarOpen: boolean
  mobileMetadataOpen: boolean
  setMobileSidebarOpen: (open: boolean) => void
  setMobileMetadataOpen: (open: boolean) => void

  // Theme
  theme: 'dark' | 'light'
  toggleTheme: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Tabs
      openTabs: [],
      activeTabId: null,

      openTab: (tab) => {
        const { openTabs } = get()
        const existing = openTabs.find((t) => t.documentId === tab.documentId)
        if (existing) {
          set({ activeTabId: existing.id })
          return
        }
        set({
          openTabs: [...openTabs, { ...tab, isDirty: false }],
          activeTabId: tab.id,
        })
      },

      closeTab: (tabId) => {
        const { openTabs, activeTabId } = get()
        const idx = openTabs.findIndex((t) => t.id === tabId)
        const filtered = openTabs.filter((t) => t.id !== tabId)
        let nextActive = activeTabId
        if (activeTabId === tabId) {
          // Switch to adjacent tab
          if (filtered.length === 0) {
            nextActive = null
          } else if (idx > 0) {
            nextActive = filtered[idx - 1].id
          } else {
            nextActive = filtered[0].id
          }
        }
        set({ openTabs: filtered, activeTabId: nextActive })
      },

      setActiveTab: (tabId) => set({ activeTabId: tabId }),

      markTabDirty: (tabId, dirty) =>
        set((s) => ({
          openTabs: s.openTabs.map((t) => (t.id === tabId ? { ...t, isDirty: dirty } : t)),
        })),

      updateTabTitle: (tabId, title) =>
        set((s) => ({
          openTabs: s.openTabs.map((t) => (t.id === tabId ? { ...t, title } : t)),
        })),

      // Panels
      sidebarCollapsed: false,
      metadataPanelCollapsed: false,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setMetadataPanelCollapsed: (collapsed) => set({ metadataPanelCollapsed: collapsed }),

      // Mobile drawers
      mobileSidebarOpen: false,
      mobileMetadataOpen: false,
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open, mobileMetadataOpen: false }),
      setMobileMetadataOpen: (open) => set({ mobileMetadataOpen: open, mobileSidebarOpen: false }),

      // Theme
      theme: 'dark',
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
    }),
    {
      name: 'agentwiki-app',
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        metadataPanelCollapsed: s.metadataPanelCollapsed,
        theme: s.theme,
      }),
    },
  ),
)
