import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { GATEWAY_WS_PORT } from '@clawwork/shared'
import { cn } from '@/lib/utils'
import { motion as motionPresets } from '@/styles/design-tokens'
import { Button } from '@/components/ui/button'

interface SettingsProps {
  onClose: () => void
}

function ReadonlyField({ label, value, hint }: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="space-y-1.5">
      <label className="font-medium text-[var(--text-secondary)]">
        {label}
      </label>
      <div className={cn(
        'h-10 px-3.5 flex items-center rounded-lg',
        'bg-[var(--bg-tertiary)] border border-[var(--border)]',
        'text-[var(--text-primary)]',
      )}>
        {value}
      </div>
      <p className="text-xs text-[var(--text-muted)]">{hint}</p>
    </div>
  )
}

export default function Settings({ onClose }: SettingsProps) {
  const [workspacePath, setWorkspacePath] = useState('')

  useEffect(() => {
    window.clawwork.getWorkspacePath().then((p) => {
      setWorkspacePath(p ?? '未配置')
    })
  }, [])

  const gatewayUrl = `ws://127.0.0.1:${GATEWAY_WS_PORT}`

  return (
    <motion.div {...motionPresets.fadeIn} className="flex flex-col h-full">
      <header className="flex items-center justify-between h-12 px-4 border-b border-[var(--border)] flex-shrink-0">
        <h2 className="font-medium text-[var(--text-primary)]">设置</h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} className="titlebar-no-drag">
          <X size={16} />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        <ReadonlyField
          label="工作空间"
          value={workspacePath}
          hint="AI 产物保存位置"
        />
        <ReadonlyField
          label="连接"
          value={gatewayUrl}
          hint="Gateway 服务器地址"
        />
        <div className="space-y-1.5">
          <label className="font-medium text-[var(--text-secondary)]">
            版本
          </label>
          <p className="text-[var(--text-primary)]">
            ClawWork v0.1.0
          </p>
        </div>
      </div>
    </motion.div>
  )
}
