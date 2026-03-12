import { type MouseEvent } from 'react'
import { motion } from 'framer-motion'
import { MessageSquare, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/utils'
import { useTaskStore } from '@/stores/taskStore'
import { useUiStore } from '@/stores/uiStore'
import { motion as motionPresets } from '@/styles/design-tokens'
import type { Task } from '@clawwork/shared'

interface TaskItemProps {
  task: Task
  active: boolean
  onContextMenu: (e: MouseEvent) => void
}

export default function TaskItem({ task, active, onContextMenu }: TaskItemProps) {
  const setActiveTask = useTaskStore((s) => s.setActiveTask)
  const clearUnread = useUiStore((s) => s.clearUnread)
  const hasUnread = useUiStore((s) => s.unreadTaskIds.has(task.id))
  const setMainView = useUiStore((s) => s.setMainView)

  const handleClick = (): void => {
    setActiveTask(task.id)
    clearUnread(task.id)
    setMainView('chat')
  }

  return (
    <motion.button
      {...motionPresets.listItem}
      whileHover={{ x: 2 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      onClick={handleClick}
      onContextMenu={onContextMenu}
      className={cn(
        'titlebar-no-drag w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors relative',
        active
          ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
      )}
    >
      {active && (
        <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[var(--accent)]" />
      )}
      <MessageSquare size={16} className="mt-0.5 flex-shrink-0 opacity-50" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="font-medium truncate flex-1">
            {task.title || '新任务'}
          </p>
          {hasUnread && (
            <Circle size={6} className="flex-shrink-0 fill-[var(--accent)] text-[var(--accent)]" />
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {task.status === 'completed' && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
              已完成
            </span>
          )}
          <p className="text-xs text-[var(--text-muted)]">
            {formatRelativeTime(new Date(task.updatedAt))}
          </p>
        </div>
      </div>
    </motion.button>
  )
}
