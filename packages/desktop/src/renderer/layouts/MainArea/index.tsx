import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PanelRightOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
import ThinkingIndicator from '@/components/ThinkingIndicator'
import ChatInput from '@/components/ChatInput'
import ImageLightbox from '@/components/ImageLightbox'
import FileBrowser from '../FileBrowser'
import logo from '@/assets/logo.png'

const STICK_TO_BOTTOM_THRESHOLD_PX = 60

interface MainAreaProps {
  onTogglePanel: () => void
}

function WelcomeScreen() {
  const { t } = useTranslation()
  return (
    <motion.div
      {...motionPresets.fadeIn}
      className="flex flex-col items-center justify-center h-full text-center py-20"
    >
      <div className="relative mb-6">
        <div className="absolute inset-0 scale-[2.5] rounded-full bg-[var(--accent)] opacity-[0.06] blur-2xl" />
        <img src={logo} alt="ClawWork" className="relative w-16 h-16 rounded-2xl shadow-[var(--glow-accent)]" />
      </div>
      <h3 className="text-2xl font-semibold text-[var(--text-primary)] mb-1.5 tracking-tight">ClawWork</h3>
      <p className="text-sm text-[var(--text-muted)] mb-6">{t('mainArea.welcomeSubtitle')}</p>
      <p className="text-[var(--text-secondary)] max-w-sm leading-relaxed text-sm">
        {t('mainArea.welcomeDesc1')}
        <br />
        {t('mainArea.welcomeDesc2')}
      </p>
      <a
        href="https://github.com/clawwork-ai/clawwork"
        target="_blank"
        rel="noreferrer"
        className="mt-8 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
      >
        {t('mainArea.starOnGithub')} ⭐
      </a>
    </motion.div>
  )
}

function ChatHeader({ onTogglePanel }: { onTogglePanel: () => void }) {
  const { t } = useTranslation()
  const activeTask = useTaskStore((s) =>
    s.tasks.find((task) => task.id === s.activeTaskId),
  )

  return (
    <header className="titlebar-drag flex items-center justify-between h-12 px-5 border-b border-[var(--border)] flex-shrink-0">
      <div className="flex items-center gap-2.5">
        {activeTask ? (
          <>
            <h2 className="font-medium text-[var(--text-primary)] truncate">
              {activeTask.title || t('common.newTask')}
            </h2>
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-md',
              activeTask.status === 'active'
                ? 'bg-[var(--accent-dim)] text-[var(--accent)]'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
            )}>
              {activeTask.status === 'active' ? t('common.inProgress') : t('common.completed')}
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
        <TooltipContent>{t('mainArea.toggleContextPanel')}</TooltipContent>
      </Tooltip>
    </header>
  )
}

function ChatContent() {
  const activeTaskId = useTaskStore((s) => s.activeTaskId)
  const activeTask = useTaskStore((s) =>
    s.tasks.find((task) => task.id === s.activeTaskId),
  )
  const messages = useMessageStore((s) =>
    activeTaskId ? (s.messagesByTask[activeTaskId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES,
  )
  const streamingContent = useMessageStore((s) =>
    activeTaskId ? (s.streamingByTask[activeTaskId] ?? '') : '',
  )
  const highlightedId = useMessageStore((s) => s.highlightedMessageId)
  const setHighlightedMessage = useMessageStore((s) => s.setHighlightedMessage)
  const isProcessing = useMessageStore((s) =>
    activeTaskId ? s.processingTasks.has(activeTaskId) : false,
  )
  const viewportRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const closeLightbox = useCallback(() => setLightboxSrc(null), [])

  const handleScroll = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    stickToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_THRESHOLD_PX
  }, [])

  useEffect(() => {
    if (!stickToBottom.current) return
    const el = viewportRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, streamingContent, isProcessing])

  return (
    <>
      <ScrollArea viewportRef={viewportRef} className="flex-1 px-6 py-4" onScrollCapture={handleScroll}>
        <div className="max-w-3xl mx-auto space-y-1">
          {!activeTask && <WelcomeScreen />}
          {activeTask && messages.length === 0 && !streamingContent && <WelcomeScreen />}
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              highlighted={msg.id === highlightedId}
              onHighlightDone={() => setHighlightedMessage(null)}
              onImageClick={setLightboxSrc}
            />
          ))}
          {streamingContent && <StreamingMessage content={streamingContent} />}
          <AnimatePresence>
            {isProcessing && !streamingContent && <ThinkingIndicator />}
          </AnimatePresence>
        </div>
      </ScrollArea>
      <ChatInput />
      <ImageLightbox src={lightboxSrc} onClose={closeLightbox} />
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
