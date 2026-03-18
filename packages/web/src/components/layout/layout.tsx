/** Main 3-panel shell: sidebar | editor | metadata */

import { useEffect } from 'react'
import { useAppStore } from '../../stores/app-store'
import { Sidebar } from './sidebar'
import { MainPanel } from './main-panel'
import { MetadataPanel } from './metadata-panel'
import { CommandPalette } from '../command-palette/command-palette'
import { cn } from '../../lib/utils'

export function Layout() {
  const { theme } = useAppStore()

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
        'flex h-screen overflow-hidden',
        theme === 'dark' ? 'bg-neutral-950 text-neutral-100' : 'bg-white text-neutral-900',
      )}
    >
      <Sidebar />
      <MainPanel />
      <MetadataPanel />
      <CommandPalette />
    </div>
  )
}
