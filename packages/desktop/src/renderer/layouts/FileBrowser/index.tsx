import { useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useFileStore } from '@/stores/fileStore'
import { useTaskStore } from '@/stores/taskStore'
import { useMessageStore } from '@/stores/messageStore'
import { useUiStore } from '@/stores/uiStore'
import { cn } from '@/lib/utils'
import { motion as motionPresets } from '@/styles/design-tokens'
import { ScrollArea } from '@/components/ui/scroll-area'
import FileCard from '@/components/FileCard'
import FilePreview from '@/components/FilePreview'
import type { Artifact } from '@clawwork/shared'

function sortArtifacts(list: Artifact[], sortBy: 'date' | 'name' | 'type'): Artifact[] {
  const sorted = [...list]
  switch (sortBy) {
    case 'date':
      return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name))
    case 'type':
      return sorted.sort((a, b) => a.type.localeCompare(b.type))
  }
}

export default function FileBrowser() {
  const artifacts = useFileStore((s) => s.artifacts)
  const filterTaskId = useFileStore((s) => s.filterTaskId)
  const sortBy = useFileStore((s) => s.sortBy)
  const selectedId = useFileStore((s) => s.selectedArtifactId)
  const setArtifacts = useFileStore((s) => s.setArtifacts)
  const setFilterTaskId = useFileStore((s) => s.setFilterTaskId)
  const setSortBy = useFileStore((s) => s.setSortBy)
  const setSelectedArtifact = useFileStore((s) => s.setSelectedArtifact)

  const tasks = useTaskStore((s) => s.tasks)
  const setActiveTask = useTaskStore((s) => s.setActiveTask)
  const setMainView = useUiStore((s) => s.setMainView)
  const setHighlightedMessage = useMessageStore((s) => s.setHighlightedMessage)

  useEffect(() => {
    window.clawwork.listArtifacts().then((res) => {
      if (res.ok && res.result) {
        setArtifacts(res.result as unknown as Artifact[])
      }
    })
  }, [setArtifacts])

  const taskMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of tasks) m.set(t.id, t.title || '新任务')
    return m
  }, [tasks])

  const filtered = filterTaskId
    ? artifacts.filter((a) => a.taskId === filterTaskId)
    : artifacts

  const sorted = useMemo(() => sortArtifacts(filtered, sortBy), [filtered, sortBy])
  const selectedArtifact = useMemo(
    () => (selectedId ? artifacts.find((a) => a.id === selectedId) ?? null : null),
    [selectedId, artifacts],
  )

  const taskIdsWithArtifacts = useMemo(() => {
    const ids = new Set<string>()
    for (const a of artifacts) ids.add(a.taskId)
    return Array.from(ids)
  }, [artifacts])

  const handleNavigateToTask = useCallback((taskId: string, messageId: string) => {
    setActiveTask(taskId)
    setHighlightedMessage(messageId)
    setMainView('chat')
  }, [setActiveTask, setHighlightedMessage, setMainView])

  return (
    <div className="flex h-full">
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center gap-3 px-6 py-3 border-b border-[var(--border)] flex-shrink-0">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">文件管理</h2>
          <select
            value={filterTaskId ?? ''}
            onChange={(e) => setFilterTaskId(e.target.value || null)}
            className={cn(
              'h-7 px-2 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border)]',
              'text-xs text-[var(--text-secondary)] outline-none',
            )}
          >
            <option value="">全部任务</option>
            {taskIdsWithArtifacts.map((id) => (
              <option key={id} value={id}>{taskMap.get(id) ?? id}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date' | 'name' | 'type')}
            className={cn(
              'h-7 px-2 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border)]',
              'text-xs text-[var(--text-secondary)] outline-none',
            )}
          >
            <option value="date">按时间</option>
            <option value="name">按名称</option>
            <option value="type">按类型</option>
          </select>
        </header>

        <ScrollArea className="flex-1">
          <div className="px-6 py-4">
            {sorted.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-[var(--text-muted)]">暂无文件</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {sorted.map((a) => (
                  <FileCard
                    key={a.id}
                    artifact={a}
                    taskTitle={taskMap.get(a.taskId) ?? a.taskId}
                    selected={a.id === selectedId}
                    onClick={() => setSelectedArtifact(a.id === selectedId ? null : a.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <AnimatePresence>
        {selectedArtifact && (
          <motion.div
            {...motionPresets.slideIn}
            initial={{ opacity: 0, x: 16 }}
            exit={{ opacity: 0, x: 16 }}
            className="w-[360px] flex-shrink-0 border-l border-[var(--border)] bg-[var(--bg-secondary)]"
          >
            <FilePreview
              artifact={selectedArtifact}
              onClose={() => setSelectedArtifact(null)}
              onNavigateToTask={handleNavigateToTask}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
