import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PanelRightOpen, RotateCcw, Archive, Plus, Server, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '@/stores/taskStore'
import { useMessageStore, EMPTY_MESSAGES } from '@/stores/messageStore'
import { useUiStore, type GatewayInfo } from '@/stores/uiStore'
import { cn, formatRelativeTime } from '@/lib/utils'
import { motion as motionPresets } from '@/styles/design-tokens'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  DropdownMenu, DropdownMenuTrigger,
  DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
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
  const gatewayInfoMap = useUiStore((s) => s.gatewayInfoMap)
  const defaultGatewayId = useUiStore((s) => s.defaultGatewayId)
  const createTask = useTaskStore((s) => s.createTask)
  const gateways = Object.values(gatewayInfoMap)
  const hasMultiple = gateways.length > 1
  const [selectedGwId, setSelectedGwId] = useState(defaultGatewayId ?? gateways[0]?.id ?? '')

  // Sync when defaultGatewayId loads asynchronously
  useEffect(() => {
    if (defaultGatewayId && !selectedGwId) {
      setSelectedGwId(defaultGatewayId)
    }
  }, [defaultGatewayId, selectedGwId])

  const selectedGw = gatewayInfoMap[selectedGwId]

  const handleCreate = useCallback(() => {
    createTask(hasMultiple ? selectedGwId : undefined)
  }, [createTask, hasMultiple, selectedGwId])

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

      <div className="mt-8 flex items-center gap-2">
        {hasMultiple && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-1.5 text-sm">
                <Server size={14} />
                <span className="max-w-[120px] truncate">{selectedGw?.name ?? t('mainArea.selectGateway')}</span>
                <ChevronDown size={12} className="opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              {gateways.map((gw) => (
                <DropdownMenuItem
                  key={gw.id}
                  onClick={() => setSelectedGwId(gw.id)}
                  className={cn(gw.id === selectedGwId && 'font-medium text-[var(--accent)]')}
                >
                  <Server size={12} className="mr-2 flex-shrink-0" />
                  {gw.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button variant="soft" onClick={handleCreate} className="gap-2">
          <Plus size={16} />
          {t('common.newTask')}
        </Button>
      </div>

      <a
        href="https://github.com/clawwork-ai/clawwork"
        target="_blank"
        rel="noreferrer"
        className="mt-6 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
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
  const gatewayInfoMap = useUiStore((s) => s.gatewayInfoMap)
  const hasMultipleGateways = Object.keys(gatewayInfoMap).length > 1
  const gwInfo = activeTask ? gatewayInfoMap[activeTask.gatewayId] : undefined

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
            {hasMultipleGateways && gwInfo && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
                    style={gwInfo.color ? { borderLeft: `2px solid ${gwInfo.color}` } : undefined}
                  >
                    <Server size={10} />
                    <span className="max-w-[80px] truncate">{gwInfo.name}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{gwInfo.name}</TooltipContent>
              </Tooltip>
            )}
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

function ArchivedTasks() {
  const { t } = useTranslation()
  const archivedTasks = useTaskStore((s) =>
    s.tasks.filter((task) => task.status === 'archived'),
  )
  const setActiveTask = useTaskStore((s) => s.setActiveTask)
  const updateTaskStatus = useTaskStore((s) => s.updateTaskStatus)
  const setMainView = useUiStore((s) => s.setMainView)

  const handleReactivate = (taskId: string): void => {
    updateTaskStatus(taskId, 'active')
  }

  const handleOpenTask = (taskId: string): void => {
    setActiveTask(taskId)
    setMainView('chat')
  }

  return (
    <div className="flex flex-col h-full pt-14">
      <header className="flex items-center gap-2.5 h-12 px-5 border-b border-[var(--border)] flex-shrink-0">
        <Archive size={18} className="text-[var(--text-muted)]" />
        <h2 className="font-medium text-[var(--text-primary)]">{t('leftNav.archivedChats')}</h2>
        <span className="text-xs text-[var(--text-muted)]">({archivedTasks.length})</span>
      </header>
      <ScrollArea className="flex-1 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          {archivedTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Archive size={40} className="text-[var(--text-muted)] opacity-40 mb-4" />
              <p className="text-sm text-[var(--text-muted)]">{t('archived.empty')}</p>
            </div>
          ) : (
            <AnimatePresence>
              {archivedTasks.map((task) => (
                <motion.div
                  key={task.id}
                  {...motionPresets.listItem}
                  exit={{ opacity: 0, x: -8 }}
                  layout
                  className="flex items-center gap-3 px-4 py-3 mb-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] hover:border-[var(--border-accent)] transition-colors cursor-pointer group"
                  onClick={() => handleOpenTask(task.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {task.title || t('common.noTitle')}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {formatRelativeTime(new Date(task.updatedAt))}
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        onClick={(e) => { e.stopPropagation(); handleReactivate(task.id) }}
                      >
                        <RotateCcw size={14} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('contextMenu.reactivate')}</TooltipContent>
                  </Tooltip>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>
    </div>
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
        ) : mainView === 'archived' ? (
          <motion.div key="archived" {...motionPresets.fadeIn} className="flex-1 min-h-0">
            <ArchivedTasks />
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
