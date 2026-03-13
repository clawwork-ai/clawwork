import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Moon, Sun, Globe, Star, Bug, Plus, Trash2, Pencil,
  CheckCircle2, XCircle, Loader2, Server, Crown,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { motion as motionPresets } from '@/styles/design-tokens'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useUiStore, type Language, type GatewayConnectionStatus } from '@/stores/uiStore'

interface SettingsProps {
  onClose: () => void
}

interface GatewayFormData {
  name: string
  url: string
  token: string
  password: string
}

interface GatewayServerConfig {
  id: string
  name: string
  url: string
  token?: string
  password?: string
  isDefault?: boolean
  color?: string
}

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
]

const EMPTY_FORM: GatewayFormData = { name: '', url: 'ws://127.0.0.1:18789', token: '', password: '' }

const STATUS_ICON: Record<GatewayConnectionStatus, { icon: typeof CheckCircle2; color: string }> = {
  connected: { icon: CheckCircle2, color: 'text-[var(--accent)]' },
  connecting: { icon: Loader2, color: 'text-[var(--warning)]' },
  disconnected: { icon: XCircle, color: 'text-[var(--danger)]' },
}

function GatewayCard({
  gw, status, isDefault, onEdit, onRemove, onSetDefault,
}: {
  gw: GatewayServerConfig
  status: GatewayConnectionStatus
  isDefault: boolean
  onEdit: () => void
  onRemove: () => void
  onSetDefault: () => void
}) {
  const { t } = useTranslation()
  const StatusIcon = STATUS_ICON[status].icon

  return (
    <motion.div
      layout
      {...motionPresets.listItem}
      className={cn(
        'rounded-xl p-4',
        'bg-[var(--bg-elevated)] shadow-[var(--shadow-card)]',
        'border transition-colors',
        isDefault ? 'border-[var(--accent)]/40' : 'border-[var(--border-subtle)]',
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
          status === 'connected'
            ? 'bg-[var(--accent-soft)]'
            : 'bg-[var(--bg-tertiary)]',
        )}>
          <Server size={16} className={status === 'connected' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-[var(--text-primary)] truncate">{gw.name}</span>
            {isDefault && (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--accent)] font-medium">
                <Crown size={10} />
                {t('settings.default')}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5 truncate">{gw.url}</p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <StatusIcon
              size={12}
              className={cn(STATUS_ICON[status].color, status === 'connecting' && 'animate-spin')}
            />
            <span className={cn('text-xs', STATUS_ICON[status].color)}>
              {t(`connection.${status}`)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {!isDefault && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={onSetDefault}>
                  <Crown size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('settings.setAsDefault')}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onEdit}>
                <Pencil size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('settings.edit')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onRemove}>
                <Trash2 size={14} className="text-[var(--danger)]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('settings.remove')}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </motion.div>
  )
}

export default function Settings({ onClose }: SettingsProps) {
  const { t } = useTranslation()
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)
  const language = useUiStore((s) => s.language)
  const setLanguage = useUiStore((s) => s.setLanguage)
  const gatewayStatusMap = useUiStore((s) => s.gatewayStatusMap)
  const setDefaultGatewayId = useUiStore((s) => s.setDefaultGatewayId)
  const setGatewayInfoMap = useUiStore((s) => s.setGatewayInfoMap)

  const [gateways, setGateways] = useState<GatewayServerConfig[]>([])
  const [defaultGwId, setDefaultGwId] = useState<string | null>(null)
  const [workspacePath, setWorkspacePath] = useState('')

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<GatewayFormData>(EMPTY_FORM)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadGateways = useCallback(async () => {
    const settings = await window.clawwork.getSettings()
    if (!settings) return
    const gwList = settings.gateways ?? []
    setGateways(gwList)
    setDefaultGwId(settings.defaultGatewayId ?? null)
    setWorkspacePath(settings.workspacePath || t('common.notConfigured'))
    // Sync uiStore so TaskItem badges and MainArea selector stay current
    const infoMap: Record<string, { id: string; name: string; color?: string }> = {}
    for (const gw of gwList) {
      infoMap[gw.id] = { id: gw.id, name: gw.name, color: gw.color }
    }
    setGatewayInfoMap(infoMap)
  }, [t, setGatewayInfoMap])

  useEffect(() => { loadGateways() }, [loadGateways])

  const handleThemeToggle = useCallback((next: 'dark' | 'light') => {
    setTheme(next)
    toast.success(t('settings.themeUpdated'))
  }, [setTheme, t])

  const openAddForm = useCallback(() => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }, [])

  const openEditForm = useCallback((gw: GatewayServerConfig) => {
    setEditingId(gw.id)
    setForm({ name: gw.name, url: gw.url, token: gw.token ?? '', password: gw.password ?? '' })
    setShowForm(true)
  }, [])

  const closeForm = useCallback(() => {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }, [])

  const handleTest = useCallback(async () => {
    try { new URL(form.url) } catch {
      toast.error(t('settings.invalidUrl'))
      return
    }
    setTesting(true)
    const res = await window.clawwork.testGateway(form.url, { token: form.token || undefined, password: form.password || undefined })
    setTesting(false)
    if (res.ok) {
      toast.success(t('settings.testSuccess'))
    } else {
      toast.error(t('settings.testFailed'), { description: res.error })
    }
  }, [form, t])

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) { toast.error(t('settings.nameRequired')); return }
    try { new URL(form.url) } catch { toast.error(t('settings.invalidUrl')); return }

    setSaving(true)
    if (editingId) {
      const res = await window.clawwork.updateGateway(editingId, {
        name: form.name.trim(),
        url: form.url.trim(),
        token: form.token.trim() || undefined,
        password: form.password.trim() || undefined,
      })
      if (res.ok) {
        toast.success(t('settings.gatewayUpdated'))
        closeForm()
        await loadGateways()
      } else {
        toast.error(res.error ?? 'Failed')
      }
    } else {
      const newGw: GatewayServerConfig = {
        id: crypto.randomUUID(),
        name: form.name.trim(),
        url: form.url.trim(),
        token: form.token.trim() || undefined,
        password: form.password.trim() || undefined,
      }
      const res = await window.clawwork.addGateway(newGw)
      if (res.ok) {
        toast.success(t('settings.gatewayAdded'))
        closeForm()
        await loadGateways()
      } else {
        toast.error(res.error ?? 'Failed')
      }
    }
    setSaving(false)
  }, [form, editingId, closeForm, loadGateways, t])

  const handleRemove = useCallback(async (gwId: string) => {
    const res = await window.clawwork.removeGateway(gwId)
    if (res.ok) {
      toast.success(t('settings.gatewayRemoved'))
      await loadGateways()
    } else {
      toast.error(res.error ?? 'Failed')
    }
  }, [loadGateways, t])

  const handleSetDefault = useCallback(async (gwId: string) => {
    const res = await window.clawwork.setDefaultGateway(gwId)
    if (res.ok) {
      setDefaultGatewayId(gwId)
      await loadGateways()
      toast.success(t('settings.defaultUpdated'))
    }
  }, [loadGateways, setDefaultGatewayId, t])

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

        {/* Gateways */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className={cn(sectionLabel, 'mb-0')}>{t('settings.gateways')}</p>
            <Button variant="soft" size="sm" onClick={openAddForm} className="titlebar-no-drag gap-1.5">
              <Plus size={14} />
              {t('settings.addGateway')}
            </Button>
          </div>

          <div className="space-y-2">
            <AnimatePresence>
              {gateways.map((gw) => (
                <GatewayCard
                  key={gw.id}
                  gw={gw}
                  status={gatewayStatusMap[gw.id] ?? 'disconnected'}
                  isDefault={gw.id === defaultGwId}
                  onEdit={() => openEditForm(gw)}
                  onRemove={() => handleRemove(gw.id)}
                  onSetDefault={() => handleSetDefault(gw.id)}
                />
              ))}
            </AnimatePresence>

            {gateways.length === 0 && !showForm && (
              <div className={cn(cardClass, 'flex flex-col items-center py-8')}>
                <Server size={32} className="text-[var(--text-muted)] opacity-40 mb-3" />
                <p className="text-sm text-[var(--text-muted)] mb-3">{t('settings.noGateways')}</p>
                <Button variant="soft" size="sm" onClick={openAddForm} className="titlebar-no-drag gap-1.5">
                  <Plus size={14} />
                  {t('settings.addFirstGateway')}
                </Button>
              </div>
            )}
          </div>

          {/* Add/Edit Form */}
          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                className="overflow-hidden"
              >
                <div className={cn(cardClass, 'space-y-4')}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {editingId ? t('settings.editGateway') : t('settings.addGateway')}
                    </span>
                    <Button variant="ghost" size="icon-sm" onClick={closeForm}>
                      <X size={14} />
                    </Button>
                  </div>
                  <div>
                    <label className="text-sm text-[var(--text-secondary)] mb-1.5 block">{t('settings.gatewayName')}</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder={t('settings.gatewayNamePlaceholder')}
                      className={cn(inputClass, 'w-full')}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-[var(--text-secondary)] mb-1.5 block">{t('settings.gatewayUrl')}</label>
                    <input
                      type="text"
                      value={form.url}
                      onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                      placeholder="ws://127.0.0.1:18789"
                      className={cn(inputClass, 'w-full')}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-[var(--text-secondary)] mb-1.5 block">Token</label>
                    <input
                      type="password"
                      value={form.token}
                      onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
                      placeholder={t('settings.tokenPlaceholder')}
                      className={cn(inputClass, 'w-full')}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-[var(--text-secondary)] mb-1.5 block">{t('settings.password')}</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      placeholder={t('settings.passwordPlaceholder')}
                      className={cn(inputClass, 'w-full')}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={handleTest} disabled={testing} className="titlebar-no-drag gap-1.5">
                      {testing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      {t('settings.testConnection')}
                    </Button>
                    <div className="flex-1" />
                    <Button variant="ghost" size="sm" onClick={closeForm} className="titlebar-no-drag">
                      {t('common.cancel')}
                    </Button>
                    <Button variant="default" size="sm" onClick={handleSave} disabled={saving} className="titlebar-no-drag gap-1.5">
                      {saving && <Loader2 size={14} className="animate-spin" />}
                      {editingId ? t('common.save') : t('settings.addGateway')}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
