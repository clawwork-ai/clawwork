import { useState, type MouseEvent } from 'react'
import { Plus, Search, FolderOpen, Settings } from 'lucide-react'
import { useTaskStore } from '@/stores/taskStore'
import { useUiStore } from '@/stores/uiStore'
import { useTaskContextMenu } from '@/components/ContextMenu'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import TaskItem from './TaskItem'
import type { TaskStatus } from '@clawwork/shared'

export default function LeftNav() {
  const tasks = useTaskStore((s) => s.tasks)
  const activeTaskId = useTaskStore((s) => s.activeTaskId)
  const createTask = useTaskStore((s) => s.createTask)
  const updateTaskStatus = useTaskStore((s) => s.updateTaskStatus)
  const mainView = useUiStore((s) => s.mainView)
  const setMainView = useUiStore((s) => s.setMainView)
  const settingsOpen = useUiStore((s) => s.settingsOpen)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)

  const { items, isOpen, openMenu, closeMenu } = useTaskContextMenu(updateTaskStatus)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)

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
        <Button variant="soft" onClick={createTask} className="titlebar-no-drag w-full gap-2">
          <Plus size={16} /> 新任务
        </Button>
        <div className="titlebar-no-drag relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="搜索任务…"
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-accent)] transition-colors"
          />
        </div>
      </div>

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
          <FolderOpen size={16} className="opacity-60" /> 文件管理
        </button>
      </div>

      <ScrollArea className="flex-1 px-4">
        <div className="space-y-0.5">
          {visibleTasks.length === 0 && (
            <p className="text-xs text-[var(--text-muted)] text-center py-8">
              点击「新任务」开始
            </p>
          )}
          {activeTasks.length > 0 && (
            <>
              <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] px-3 py-2">
                进行中 ({activeTasks.length})
              </p>
              {activeTasks.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  active={t.id === activeTaskId}
                  onContextMenu={(e) => handleContextMenu(e, t.id, t.status)}
                />
              ))}
            </>
          )}
          {completedTasks.length > 0 && (
            <>
              <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] px-3 py-2 mt-3">
                已完成 ({completedTasks.length})
              </p>
              {completedTasks.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  active={t.id === activeTaskId}
                  onContextMenu={(e) => handleContextMenu(e, t.id, t.status)}
                />
              ))}
            </>
          )}
        </div>
      </ScrollArea>

      <div className="flex-shrink-0 px-4 py-3 border-t border-[var(--border)]">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={cn(
                'titlebar-no-drag w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                settingsOpen
                  ? 'bg-[var(--accent-dim)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
              )}
            >
              <Settings size={16} className="opacity-60" /> 设置
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">应用设置</TooltipContent>
        </Tooltip>
      </div>

      <DropdownMenu
        open={isOpen}
        onOpenChange={(open) => { if (!open) closeMenu() }}
      >
        <DropdownMenuTrigger className="sr-only" />
        <DropdownMenuContent
          style={menuPos ? { position: 'fixed', left: menuPos.x, top: menuPos.y } : undefined}
        >
          {items.map((item) => (
            <DropdownMenuItem
              key={item.label}
              danger={item.danger}
              onClick={() => { item.action(); closeMenu() }}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
