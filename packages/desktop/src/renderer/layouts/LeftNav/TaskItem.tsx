import { type MouseEvent } from 'react'
import { motion } from 'framer-motion'
import { MessageSquare, Circle, Loader2, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/utils'
import { useTaskStore } from '@/stores/taskStore'
import { useMessageStore } from '@/stores/messageStore'
import { useUiStore } from '@/stores/uiStore'
import { motion as motionPresets } from '@/styles/design-tokens'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import type { Task } from '@clawwork/shared'

interface TaskItemProps {
  task: Task
  active: boolean
  onContextMenu: (e: MouseEvent) => void
}

export default function TaskItem({ task, active, onContextMenu }: TaskItemProps) {
  const { t } = useTranslation()
  const setActiveTask = useTaskStore((s) => s.setActiveTask)
  const clearUnread = useUiStore((s) => s.clearUnread)
  const hasUnread = useUiStore((s) => s.unreadTaskIds.has(task.id))
  const setMainView = useUiStore((s) => s.setMainView)
  const isStreaming = useMessageStore((s) => !!s.streamingByTask[task.id])
  const gwInfo = useUiStore((s) => s.gatewayInfoMap[task.gatewayId])
  const multiGateway = useUiStore((s) => Object.keys(s.gatewayInfoMap).length > 1)

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
            {task.title || t('common.newTask')}
          </p>
          {isStreaming ? (
            <Loader2 size={12} className="flex-shrink-0 animate-spin text-[var(--accent)]" />
          ) : hasUnread ? (
            <Circle size={6} className="flex-shrink-0 fill-[var(--accent)] text-[var(--accent)]" />
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {task.status === 'completed' && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
              {t('common.completed')}
            </span>
          )}
          {multiGateway && gwInfo && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)] max-w-[80px] truncate"
                  style={gwInfo.color ? { borderLeft: `2px solid ${gwInfo.color}` } : undefined}
                >
                  <Server size={9} className="flex-shrink-0 opacity-60" />
                  {gwInfo.name}
                </span>
              </TooltipTrigger>
              <TooltipContent>{gwInfo.name}</TooltipContent>
            </Tooltip>
          )}
          <p className="text-xs text-[var(--text-muted)]">
            {formatRelativeTime(new Date(task.updatedAt))}
          </p>
        </div>
      </div>
    </motion.button>
  )
}
