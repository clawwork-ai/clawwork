import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import LeftNav from './layouts/LeftNav'
import MainArea from './layouts/MainArea'
import RightPanel from './layouts/RightPanel'
import Setup from './layouts/Setup'
import Settings from './layouts/Settings'
import { useUiStore } from './stores/uiStore'
import { useGatewayEventDispatcher } from './hooks/useGatewayDispatcher'
import { cn } from '@/lib/utils'
import { TooltipProvider } from '@/components/ui/tooltip'

export default function App() {
  const [ready, setReady] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)

  const rightPanelOpen = useUiStore((s) => s.rightPanelOpen)
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel)
  const setRightPanelOpen = useUiStore((s) => s.setRightPanelOpen)
  const settingsOpen = useUiStore((s) => s.settingsOpen)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)

  useGatewayEventDispatcher()

  useEffect(() => {
    window.clawwork.isWorkspaceConfigured().then((configured) => {
      if (configured) {
        setReady(true)
      } else {
        setNeedsSetup(true)
      }
    })
  }, [])

  if (needsSetup) {
    return (
      <TooltipProvider>
        <Setup onSetupComplete={() => { setNeedsSetup(false); setReady(true) }} />
      </TooltipProvider>
    )
  }

  if (!ready) return null

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-[var(--bg-primary)]">
        <div className="titlebar-drag fixed top-0 left-0 right-0 h-8 z-50" />

        <aside
          className={cn(
            'flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg-secondary)]',
          )}
          style={{ width: 260 }}
        >
          <LeftNav />
        </aside>

        <main className="flex-1 min-w-0 flex flex-col">
          {settingsOpen ? (
            <Settings onClose={() => setSettingsOpen(false)} />
          ) : (
            <MainArea onTogglePanel={toggleRightPanel} />
          )}
        </main>

        <AnimatePresence>
          {rightPanelOpen && !settingsOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
              className={cn(
                'flex-shrink-0 border-l border-[var(--border)] bg-[var(--bg-secondary)] overflow-hidden',
              )}
            >
              <RightPanel onClose={() => setRightPanelOpen(false)} />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  )
}
