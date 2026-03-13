import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { X, Moon, Sun, Globe, Star, Bug } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { motion as motionPresets } from '@/styles/design-tokens'
import { Button } from '@/components/ui/button'
import { useUiStore, type Language } from '@/stores/uiStore'

interface SettingsProps {
  onClose: () => void
}

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
]

export default function Settings({ onClose }: SettingsProps) {
  const { t } = useTranslation()
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)
  const language = useUiStore((s) => s.language)
  const setLanguage = useUiStore((s) => s.setLanguage)
  const [gatewayUrl, setGatewayUrl] = useState('ws://127.0.0.1:18789')
  const [bootstrapToken, setBootstrapToken] = useState('')
  const [workspacePath, setWorkspacePath] = useState('')

  useEffect(() => {
    window.clawwork.getSettings().then((settings) => {
      if (!settings) return
      setWorkspacePath(settings.workspacePath || t('common.notConfigured'))
      if (settings.gatewayUrl) setGatewayUrl(settings.gatewayUrl)
      if (settings.bootstrapToken) setBootstrapToken(settings.bootstrapToken)
    })
  }, [t])

  const handleThemeToggle = useCallback((next: 'dark' | 'light') => {
    setTheme(next)
    toast.success('Theme updated')
  }, [setTheme])

  const handleSaveConnection = useCallback(() => {
    try {
      new URL(gatewayUrl)
    } catch {
      toast.error('Invalid URL format')
      return
    }
    const updates: Record<string, string> = { gatewayUrl }
    if (bootstrapToken.trim()) {
      updates.bootstrapToken = bootstrapToken.trim()
    }
    window.clawwork.updateSettings(updates).then(() => {
      toast.success('Reconnecting...')
    })
  }, [gatewayUrl, bootstrapToken])

  const sectionLabel = 'text-xs text-[var(--text-tertiary,var(--text-muted))] uppercase tracking-wider mb-3'
  const cardClass = cn(
    'rounded-xl p-5',
    'bg-[var(--bg-elevated)] shadow-[var(--shadow-card)]',
    'border border-[var(--border-subtle)]',
  )
  const inputClass = cn(
    'flex-1 h-10 px-3 py-2 rounded-md',
    'bg-[var(--bg-tertiary)] border border-[var(--border)]',
    'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
    'outline-none ring-accent-focus transition-colors',
  )

  return (
    <motion.div {...motionPresets.fadeIn} className="flex flex-col h-full">
      <header className="flex items-center justify-between h-12 px-4 border-b border-[var(--border)] flex-shrink-0">
        <h2 className="font-medium text-[var(--text-primary)]">{t('common.settings')}</h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} className="titlebar-no-drag">
          <X size={16} />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Theme */}
        <section>
          <p className={sectionLabel}>{t('settings.appearance')}</p>
          <div className={cn(cardClass, 'space-y-4')}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--text-primary)]">{t('settings.theme')}</span>
              <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
                {(['dark', 'light'] as const).map((themeVal) => (
                  <button
                    key={themeVal}
                    onClick={() => handleThemeToggle(themeVal)}
                    className={cn(
                      'flex items-center gap-1.5 px-3.5 py-1.5 text-sm transition-colors',
                      theme === themeVal
                        ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
                    )}
                  >
                    {themeVal === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
                    {themeVal === 'dark' ? 'Dark' : 'Light'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe size={14} className="text-[var(--text-muted)]" />
                <span className="text-sm text-[var(--text-primary)]">Language</span>
              </div>
              <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.value}
                    onClick={() => setLanguage(lang.value)}
                    className={cn(
                      'flex items-center gap-1.5 px-3.5 py-1.5 text-sm transition-colors',
                      language === lang.value
                        ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
                    )}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Connection */}
        <section>
          <p className={sectionLabel}>{t('settings.connection')}</p>
          <div className={cn(cardClass, 'space-y-4')}>
            <div>
              <label className="text-sm text-[var(--text-secondary)] mb-2 block">{t('settings.gatewayUrl')}</label>
              <input
                type="text"
                value={gatewayUrl}
                onChange={(e) => setGatewayUrl(e.target.value)}
                placeholder="ws://127.0.0.1:18789"
                className={cn(inputClass, 'w-full')}
              />
            </div>
            <div>
              <label className="text-sm text-[var(--text-secondary)] mb-2 block">Token</label>
              <input
                type="password"
                value={bootstrapToken}
                onChange={(e) => setBootstrapToken(e.target.value)}
                placeholder={t('settings.tokenPlaceholder')}
                className={cn(inputClass, 'w-full')}
              />
            </div>
            <div className="flex justify-end">
              <Button variant="soft" onClick={handleSaveConnection} className="titlebar-no-drag">
                {t('settings.saveAndReconnect')}
              </Button>
            </div>
          </div>
        </section>

        {/* Workspace */}
        <section>
          <p className={sectionLabel}>{t('settings.storage')}</p>
          <div className={cardClass}>
            <label className="text-sm text-[var(--text-secondary)] mb-2 block">{t('settings.workspace')}</label>
            <div className={cn(
              'h-10 px-3 flex items-center rounded-md',
              'bg-[var(--bg-tertiary)] border border-[var(--border)]',
              'text-[var(--text-primary)] text-sm',
            )}>
              {workspacePath}
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1.5">{t('settings.workspaceHint')}</p>
          </div>
        </section>

        {/* About */}
        <section>
          <p className={sectionLabel}>{t('settings.about')}</p>
          <div className={cn(cardClass, 'space-y-4')}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--text-secondary)]">{t('settings.version')}</span>
              <span className="text-sm text-[var(--text-primary)] font-mono">v0.1.0</span>
            </div>
            <div className="flex flex-col gap-2">
              <a
                href="https://github.com/clawwork-ai/clawwork"
                target="_blank"
                rel="noreferrer"
                className={cn(
                  'flex items-center justify-center gap-2 h-9 px-4 rounded-lg text-sm font-medium transition-colors',
                  'bg-[var(--accent)] text-[var(--bg-primary)]',
                  'hover:bg-[var(--accent-hover)] active:scale-[0.98]',
                )}
              >
                <Star size={14} />
                {t('settings.githubStar')}
              </a>
              <a
                href="https://github.com/clawwork-ai/clawwork/issues/new"
                target="_blank"
                rel="noreferrer"
                className={cn(
                  'flex items-center justify-center gap-2 h-9 px-4 rounded-lg text-sm font-medium transition-colors',
                  'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)]',
                  'hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] active:scale-[0.98]',
                )}
              >
                <Bug size={14} />
                {t('settings.submitIssue')}
              </a>
            </div>
          </div>
        </section>
      </div>
    </motion.div>
  )
}
