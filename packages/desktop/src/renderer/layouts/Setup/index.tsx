import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { FolderOpen, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion as motionPresets } from '@/styles/design-tokens'
import { Button } from '@/components/ui/button'

interface SetupProps {
  onSetupComplete: () => void
}

export default function Setup({ onSetupComplete }: SetupProps) {
  const [path, setPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    window.clawwork.getDefaultWorkspacePath().then(setPath)
  }, [])

  const handleBrowse = async (): Promise<void> => {
    const selected = await window.clawwork.browseWorkspace()
    if (selected) {
      setPath(selected)
      setError('')
    }
  }

  const handleSetup = async (): Promise<void> => {
    if (!path.trim()) {
      setError('请选择工作空间目录')
      return
    }
    setLoading(true)
    setError('')
    const result = await window.clawwork.setupWorkspace(path.trim())
    setLoading(false)
    if (result.ok) {
      onSetupComplete()
    } else {
      setError(result.error ?? '初始化失败')
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-primary)]">
      <div className="titlebar-drag fixed top-0 left-0 right-0 h-8 z-50" />

      <div className="flex flex-col items-center justify-center w-full px-6">
        <motion.div {...motionPresets.slideUp} className="w-full max-w-md space-y-8">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="relative">
              <div className="absolute inset-0 scale-[2.5] rounded-full bg-[var(--accent)] opacity-[0.06] blur-2xl" />
              <div className="relative w-16 h-16 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center shadow-[var(--glow-accent)]">
                <span className="text-[var(--accent)] text-3xl font-bold tracking-tight">C</span>
              </div>
            </div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)] tracking-tight">
              欢迎使用 ClawWork
            </h1>
            <p className="text-[var(--text-muted)] leading-relaxed text-sm">
              AI 产物将保存到工作空间目录，
              <br />
              并通过 Git 自动版本管理。
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-elevated)] space-y-4">
            <label className="font-medium text-[var(--text-secondary)] text-sm">
              工作空间目录
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={path}
                onChange={(e) => { setPath(e.target.value); setError('') }}
                className={cn(
                  'titlebar-no-drag flex-1 h-10 px-3.5 rounded-lg',
                  'bg-[var(--bg-tertiary)] border border-[var(--border)]',
                  'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
                  'outline-none focus:border-[var(--border-accent)] transition-colors',
                )}
                placeholder="选择目录…"
              />
              <Button
                variant="outline"
                onClick={handleBrowse}
                className="titlebar-no-drag gap-1.5 h-10"
              >
                <FolderOpen size={15} />
                浏览…
              </Button>
            </div>
          </div>

          <Button
            onClick={handleSetup}
            disabled={loading || !path.trim()}
            className="titlebar-no-drag w-full h-11 gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                初始化中…
              </>
            ) : (
              '开始使用'
            )}
          </Button>

          {error && (
            <p className="text-sm text-[var(--danger)] text-center">{error}</p>
          )}
        </motion.div>
      </div>
    </div>
  )
}
