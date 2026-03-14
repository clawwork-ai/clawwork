import { useState, useEffect, useRef, type MouseEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Search, FolderOpen, Settings, Archive, Bot, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '@/stores/taskStore'
import { useUiStore } from '@/stores/uiStore'
import { useTaskContextMenu } from '@/components/ContextMenu'
import SearchResults, { type SearchResult } from '@/components/SearchResults'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu, DropdownMenuTrigger,
  DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import TaskItem from './TaskItem'
import ConnectionStatus from './ConnectionStatus'
import type { TaskStatus } from '@clawwork/shared'

export default function LeftNav() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const activeTaskId = useTaskStore((s) => s.activeTaskId)
  const createTask = useTaskStore((s) => s.createTask)
  const setActiveTask = useTaskStore((s) => s.setActiveTask)
  const updateTaskStatus = useTaskStore((s) => s.updateTaskStatus)
  const mainView = useUiStore((s) => s.mainView)
  const setMainView = useUiStore((s) => s.setMainView)
  const settingsOpen = useUiStore((s) => s.settingsOpen)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const gwStatusMap = useUiStore((s) => s.gatewayStatusMap)
  const agentCatalog = useUiStore((s) => s.agentCatalog)
  const hasMultipleAgents = agentCatalog.length > 1

  // Aggregate: if any gateway connected → connected; any connecting → connecting; else disconnected
  const gwStatusValues = Object.values(gwStatusMap)
  const aggregatedGwStatus: 'connected' | 'connecting' | 'disconnected' =
    gwStatusValues.some((s) => s === 'connected') ? 'connected'
    : gwStatusValues.some((s) => s === 'connecting') ? 'connecting'
    : 'disconnected'

  const { items, isOpen, openMenu, closeMenu } = useTaskContextMenu(updateTaskStatus)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    clearTimeout(timerRef.current)
    if (!searchQuery.trim()) { setSearchResults([]); return }
    timerRef.current = setTimeout(async () => {
      const resp = await window.clawwork.globalSearch(searchQuery)
      if (resp.ok && resp.results) setSearchResults(resp.results)
    }, 300)
    return () => clearTimeout(timerRef.current)
  }, [searchQuery])

  const handleSelectResult = (result: SearchResult): void => {
    setSearchQuery('')
    setSearchResults([])
    if (result.type === 'artifact') {
      setMainView('files')
    } else {
      setMainView('chat')
      const targetId = result.type === 'task' ? result.id : result.taskId
      if (targetId) setActiveTask(targetId)
    }
  }

  const handleContextMenu = (e: MouseEvent, taskId: string, status: TaskStatus): void => {
    setMenuPos({ x: e.clientX, y: e.clientY })
    openMenu(e, taskId, status)
  }

  const visibleTasks = tasks.filter((t) => t.status !== 'archived')
  const activeTasks = visibleTasks.filter((t) => t.status === 'active')
  const completedTasks = visibleTasks.filter((t) => t.status === 'completed')

  return (
    <div className="flex flex-col h-full pt-14 relative">
      <div className="px-4 pb-3 space-y-2 flex-shrink-0">
        {hasMultipleAgents ? (
          <div className="titlebar-no-drag flex items-center gap-0.5">
            <Button variant="soft" onClick={() => createTask()} className="flex-1 gap-2 rounded-r-none">
              <Plus size={16} /> {t('common.newTask')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="soft" className="px-1.5 rounded-l-none border-l border-[var(--border)]">
                  <ChevronDown size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[160px]">
                {agentCatalog.map((agent) => (
                  <DropdownMenuItem key={agent.id} onClick={() => createTask(undefined, agent.id)}>
                    {agent.identity?.emoji ? (
                      <span className="mr-2 text-base leading-none">{agent.identity.emoji}</span>
                    ) : (
                      <Bot size={12} className="mr-2 flex-shrink-0" />
                    )}
                    {agent.name ?? agent.id}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <Button variant="soft" onClick={() => createTask()} className="titlebar-no-drag w-full gap-2">
            <Plus size={16} /> {t('common.newTask')}
          </Button>
        )}
        <div className="titlebar-no-drag relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('leftNav.searchTasks')}
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-accent)] transition-colors"
          />
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        <AnimatePresence>
          {searchQuery.trim() && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-10 bg-[var(--bg-elevated)] border-t border-[var(--border)]"
            >
              <SearchResults results={searchResults} onSelect={handleSelectResult} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col h-full">
          <div className="px-4 pb-2 flex-shrink-0">
            <button
              onClick={() => setMainView('files')}
              className={cn(
                'titlebar-no-drag w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                mainView === 'files'
                  ? 'bg-[var(--accent-dim)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
              )}
            >
              <FolderOpen size={16} className="opacity-60" /> {t('common.fileManager')}
            </button>
          </div>

          <ScrollArea className="flex-1 px-4">
            <div className="space-y-0.5">
              {visibleTasks.length === 0 && (
                <p className="text-xs text-[var(--text-muted)] text-center py-8">
                  {t('leftNav.emptyHint')}
                </p>
              )}
              {activeTasks.length > 0 && (
                <>
                  <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] px-3 py-2">
                    {t('common.inProgress')} ({activeTasks.length})
                  </p>
                  {activeTasks.map((task) => (
                    <TaskItem key={task.id} task={task} active={task.id === activeTaskId}
                      onContextMenu={(e) => handleContextMenu(e, task.id, task.status)} />
                  ))}
                </>
              )}
              {completedTasks.length > 0 && (
                <>
                  <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] px-3 py-2 mt-3">
                    {t('common.completed')} ({completedTasks.length})
                  </p>
                  {completedTasks.map((task) => (
                    <TaskItem key={task.id} task={task} active={task.id === activeTaskId}
                      onContextMenu={(e) => handleContextMenu(e, task.id, task.status)} />
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      <div className="flex-shrink-0 px-4 py-3 border-t border-[var(--border)] space-y-1">
        <button
          onClick={() => setMainView('archived')}
          className={cn(
            'titlebar-no-drag w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
            mainView === 'archived'
              ? 'bg-[var(--accent-dim)] text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
          )}
        >
          <Archive size={16} className="opacity-60" /> {t('leftNav.archivedChats')}
        </button>
        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                className={cn(
                  'titlebar-no-drag flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                  settingsOpen
                    ? 'bg-[var(--accent-dim)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
                )}
              >
                <Settings size={16} className="opacity-60" /> {t('common.settings')}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{t('leftNav.appSettings')}</TooltipContent>
          </Tooltip>
          <div className="ml-auto">
            <ConnectionStatus gatewayStatus={aggregatedGwStatus} />
          </div>
        </div>
      </div>

      <DropdownMenu open={isOpen} onOpenChange={(open) => { if (!open) closeMenu() }}>
        <DropdownMenuTrigger className="sr-only" />
        <DropdownMenuContent
          style={menuPos ? { position: 'fixed', left: menuPos.x, top: menuPos.y } : undefined}
        >
          {items.map((item) => (
            <DropdownMenuItem key={item.label} danger={item.danger}
              onClick={() => { item.action(); closeMenu() }}>
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
