import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PanelRightOpen } from 'lucide-react'
import { useTaskStore } from '@/stores/taskStore'
import { useMessageStore, EMPTY_MESSAGES } from '@/stores/messageStore'
import { useUiStore } from '@/stores/uiStore'
import { cn } from '@/lib/utils'
import { motion as motionPresets } from '@/styles/design-tokens'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import ChatMessage from '@/components/ChatMessage'
import StreamingMessage from '@/components/StreamingMessage'
import ChatInput from '@/components/ChatInput'
import FileBrowser from '../FileBrowser'

interface MainAreaProps {
  onTogglePanel: () => void
}

function WelcomeScreen() {
  return (
    <motion.div
      {...motionPresets.fadeIn}
      className="flex flex-col items-center justify-center h-full text-center py-20"
    >
      <div className="relative mb-6">
        <div className="absolute inset-0 scale-[2.5] rounded-full bg-[var(--accent)] opacity-[0.06] blur-2xl" />
        <div className="relative w-16 h-16 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center shadow-[var(--glow-accent)]">
          <span className="text-[var(--accent)] text-3xl font-bold tracking-tight">C</span>
        </div>
      </div>
      <h3 className="text-2xl font-semibold text-[var(--text-primary)] mb-1.5 tracking-tight">ClawWork</h3>
      <p className="text-sm text-[var(--text-muted)] mb-6">AI-powered task execution</p>
      <p className="text-[var(--text-secondary)] max-w-sm leading-relaxed text-sm">
        描述你的任务，AI 将帮你规划并执行。
        <br />
        过程中产生的文件会自动归档管理。
      </p>
    </motion.div>
  )
}

function ChatHeader({ onTogglePanel }: { onTogglePanel: () => void }) {
  const activeTask = useTaskStore((s) =>
    s.tasks.find((t) => t.id === s.activeTaskId),
  )

  return (
    <header className="titlebar-drag flex items-center justify-between h-12 px-5 border-b border-[var(--border)] flex-shrink-0">
      <div className="flex items-center gap-2.5">
        {activeTask ? (
          <>
            <h2 className="font-medium text-[var(--text-primary)] truncate">
              {activeTask.title || '新任务'}
            </h2>
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-md',
              activeTask.status === 'active'
                ? 'bg-[var(--accent-dim)] text-[var(--accent)]'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
            )}>
              {activeTask.status === 'active' ? '进行中' : '已完成'}
            </span>
          </>
        ) : (
          <h2 className="font-medium text-[var(--text-muted)]">ClawWork</h2>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onTogglePanel}
            className="titlebar-no-drag"
          >
            <PanelRightOpen size={18} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>切换上下文面板</TooltipContent>
      </Tooltip>
    </header>
  )
}

function ChatContent() {
  const activeTaskId = useTaskStore((s) => s.activeTaskId)
  const activeTask = useTaskStore((s) =>
    s.tasks.find((t) => t.id === s.activeTaskId),
  )
  const messages = useMessageStore((s) =>
    activeTaskId ? (s.messagesByTask[activeTaskId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES,
  )
  const streamingContent = useMessageStore((s) =>
    activeTaskId ? (s.streamingByTask[activeTaskId] ?? '') : '',
  )
  const highlightedId = useMessageStore((s) => s.highlightedMessageId)
  const setHighlightedMessage = useMessageStore((s) => s.setHighlightedMessage)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, streamingContent])

  return (
    <>
      <ScrollArea ref={scrollRef} className="flex-1 px-6 py-4">
        <div className="max-w-3xl mx-auto space-y-1">
          {!activeTask && <WelcomeScreen />}
          {activeTask && messages.length === 0 && !streamingContent && <WelcomeScreen />}
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              highlighted={msg.id === highlightedId}
              onHighlightDone={() => setHighlightedMessage(null)}
            />
          ))}
          {streamingContent && <StreamingMessage content={streamingContent} />}
        </div>
      </ScrollArea>
      <ChatInput />
    </>
  )
}

export default function MainArea({ onTogglePanel }: MainAreaProps) {
  const mainView = useUiStore((s) => s.mainView)

  return (
    <div className="flex flex-col h-full">
      <AnimatePresence mode="wait">
        {mainView === 'files' ? (
          <motion.div key="files" {...motionPresets.fadeIn} className="flex-1 min-h-0">
            <FileBrowser />
          </motion.div>
        ) : (
          <motion.div key="chat" {...motionPresets.fadeIn} className="flex flex-col flex-1 min-h-0">
            <ChatHeader onTogglePanel={onTogglePanel} />
            <ChatContent />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
