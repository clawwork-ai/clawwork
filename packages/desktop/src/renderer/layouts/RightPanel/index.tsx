import { motion } from 'framer-motion'
import { X, FileText, GitBranch, CheckSquare, Square, Loader2, Cpu, ArrowUp, ArrowDown, Brain } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '@/stores/taskStore'
import { useMessageStore, EMPTY_MESSAGES } from '@/stores/messageStore'
import { cn, formatTokenCount } from '@/lib/utils'
import { motion as motionPresets } from '@/styles/design-tokens'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { ProgressStep, Artifact } from '@clawwork/shared'

interface RightPanelProps {
  onClose: () => void
}

function extractProgressSteps(messages: { role: string; content: string }[]): ProgressStep[] {
  const steps: ProgressStep[] = []
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue
    const lines = msg.content.split('\n')
    for (const line of lines) {
      const checked = line.match(/^\s*[-*]\s*\[x\]\s+(.+)/i)
      if (checked) {
        steps.push({ label: checked[1].trim(), status: 'completed' })
        continue
      }
      const unchecked = line.match(/^\s*[-*]\s*\[\s\]\s+(.+)/)
      if (unchecked) {
        steps.push({ label: unchecked[1].trim(), status: 'pending' })
        continue
      }
      const numbered = line.match(/^\s*\d+\.\s+(.+)/)
      if (numbered && lines.filter((l) => /^\s*\d+\./.test(l)).length >= 3) {
        steps.push({ label: numbered[1].trim(), status: 'pending' })
      }
    }
  }
  return steps
}

function collectArtifacts(messages: { artifacts: Artifact[] }[]): Artifact[] {
  return messages.flatMap((m) => m.artifacts)
}

function StepIcon({ status }: { status: ProgressStep['status'] }) {
  switch (status) {
    case 'completed':
      return <CheckSquare size={15} className="text-[var(--accent)] flex-shrink-0" />
    case 'in_progress':
      return <Loader2 size={15} className="animate-spin text-[var(--accent)] flex-shrink-0" />
    case 'pending':
      return <Square size={15} className="text-[var(--text-muted)] flex-shrink-0" />
  }
}

export default function RightPanel({ onClose }: RightPanelProps) {
  const { t } = useTranslation()
  const activeTaskId = useTaskStore((s) => s.activeTaskId)
  const activeTask = useTaskStore((s) =>
    s.tasks.find((task) => task.id === s.activeTaskId),
  )
  const messages = useMessageStore((s) =>
    activeTaskId ? (s.messagesByTask[activeTaskId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES,
  )

  const steps = extractProgressSteps(messages)
  const artifacts = collectArtifacts(messages)
  const doneCount = steps.filter((s) => s.status === 'completed').length

  return (
    <div className="flex flex-col h-full pt-10">
      <div className="flex items-center justify-between px-4 h-12 border-b border-[var(--border)] flex-shrink-0">
        <h3 className="font-medium text-[var(--text-primary)]">{t('rightPanel.context')}</h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X size={16} />
        </Button>
      </div>

      <Tabs defaultValue="progress" className="flex flex-col flex-1 min-h-0">
        <TabsList className="mx-4 mt-2">
          <TabsTrigger value="progress">{t('rightPanel.progress')}</TabsTrigger>
          <TabsTrigger value="artifacts">{t('rightPanel.artifacts')}</TabsTrigger>
          <TabsTrigger value="git">Git</TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          <TabsContent value="progress" className="p-4">
            {activeTask && (activeTask.model || activeTask.inputTokens != null) && (
              <div className="mb-3 p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] space-y-2">
                {activeTask.model && (
                  <div className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                    <Cpu size={13} className="text-[var(--text-muted)] flex-shrink-0" />
                    <span className="truncate">{activeTask.model}</span>
                  </div>
                )}
                {activeTask.thinkingLevel && activeTask.thinkingLevel !== 'off' && (
                  <div className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                    <Brain size={13} className="text-[var(--text-muted)] flex-shrink-0" />
                    <span>{t('chatInput.thinking')}: {t(`chatInput.thinking${activeTask.thinkingLevel.charAt(0).toUpperCase()}${activeTask.thinkingLevel.slice(1)}`)}</span>
                  </div>
                )}
                {(activeTask.inputTokens != null || activeTask.outputTokens != null) && (
                  <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                    {activeTask.inputTokens != null && (
                      <span className="inline-flex items-center gap-0.5">
                        <ArrowUp size={10} />
                        {t('rightPanel.inputTokens')}: {formatTokenCount(activeTask.inputTokens)}
                      </span>
                    )}
                    {activeTask.outputTokens != null && (
                      <span className="inline-flex items-center gap-0.5">
                        <ArrowDown size={10} />
                        {t('rightPanel.outputTokens')}: {formatTokenCount(activeTask.outputTokens)}
                      </span>
                    )}
                  </div>
                )}
                {activeTask.contextTokens != null && activeTask.contextTokens > 0 && (
                  <div className="text-xs text-[var(--text-muted)]">
                    <div className="flex items-center justify-between mb-1">
                      <span>{t('rightPanel.contextUsage')}</span>
                      <span>{Math.round((activeTask.contextTokens / 200_000) * 100)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                        style={{ width: `${Math.min(100, (activeTask.contextTokens / 200_000) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            {steps.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] text-center py-4">{t('rightPanel.noProgress')}</p>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-[var(--text-muted)] mb-2">
                  {t('rightPanel.xOfYCompleted', { done: doneCount, total: steps.length })}
                </p>
                {steps.map((step, i) => (
                  <motion.div
                    key={i}
                    {...motionPresets.listItem}
                    className={cn(
                      'flex items-start gap-2 px-2 py-1.5 rounded text-sm text-[var(--text-secondary)]',
                    )}
                  >
                    <StepIcon status={step.status} />
                    <span className={step.status === 'completed' ? 'line-through opacity-60' : ''}>
                      {step.label}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="artifacts" className="p-4">
            <div className="space-y-1.5">
              {artifacts.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] text-sm text-[var(--text-secondary)]">
                    <FileText size={15} className="opacity-60" />
                  <span className="truncate">{t('common.noFiles')}</span>
                </div>
              ) : (
                artifacts.map((a) => (
                  <button
                    key={a.id}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-tertiary)]',
                      'text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors text-left',
                    )}
                    title={a.filePath}
                  >
                    <FileText size={15} className="opacity-60 flex-shrink-0" />
                    <span className="truncate flex-1">{a.name}</span>
                  </button>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="git" className="p-4">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] text-sm text-[var(--text-secondary)]">
              <GitBranch size={15} className="opacity-60" />
              <span className="truncate">{t('rightPanel.noCommits')}</span>
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  )
}
