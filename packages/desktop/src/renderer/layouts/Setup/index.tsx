import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FolderOpen, Loader2, Server, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { motion as motionPresets } from '@/styles/design-tokens'
import { Button } from '@/components/ui/button'
import logo from '@/assets/logo.png'

interface SetupProps {
  onSetupComplete: () => void
}

type Step = 'workspace' | 'gateway'

export default function Setup({ onSetupComplete }: SetupProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>('workspace')

  // Step 1: workspace
  const [path, setPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 2: gateway
  const [gwName, setGwName] = useState('Default Gateway')
  const [gwUrl, setGwUrl] = useState('ws://127.0.0.1:18789')
  const [gwToken, setGwToken] = useState('')
  const [gwPassword, setGwPassword] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null)
  const [saving, setSaving] = useState(false)

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

  const handleWorkspaceNext = async (): Promise<void> => {
    if (!path.trim()) {
      setError(t('setup.errSelectDir'))
      return
    }
    setLoading(true)
    setError('')
    const result = await window.clawwork.setupWorkspace(path.trim())
    setLoading(false)
    if (result.ok) {
      setStep('gateway')
      setError('')
    } else {
      setError(result.error ?? t('setup.errInitFailed'))
    }
  }

  const handleTestGateway = useCallback(async () => {
    try { new URL(gwUrl) } catch {
      setTestResult('fail')
      return
    }
    setTesting(true)
    setTestResult(null)
    const res = await window.clawwork.testGateway(gwUrl, {
      token: gwToken || undefined,
      password: gwPassword || undefined,
    })
    setTesting(false)
    setTestResult(res.ok ? 'success' : 'fail')
  }, [gwUrl, gwToken, gwPassword])

  const handleFinish = useCallback(async () => {
    if (!gwName.trim() || !gwUrl.trim()) {
      setError(t('settings.nameRequired'))
      return
    }
    try { new URL(gwUrl) } catch {
      setError(t('settings.invalidUrl'))
      return
    }
    setSaving(true)
    setError('')
    const gw = {
      id: crypto.randomUUID(),
      name: gwName.trim(),
      url: gwUrl.trim(),
      token: gwToken.trim() || undefined,
      password: gwPassword.trim() || undefined,
      isDefault: true,
    }
    const res = await window.clawwork.addGateway(gw)
    setSaving(false)
    if (res.ok) {
      onSetupComplete()
    } else {
      setError(res.error ?? 'Failed to add gateway')
    }
  }, [gwName, gwUrl, gwToken, gwPassword, onSetupComplete, t])

  const handleSkipGateway = useCallback(() => {
    onSetupComplete()
  }, [onSetupComplete])

  const inputClass = cn(
    'titlebar-no-drag flex-1 h-10 px-3.5 rounded-lg',
    'bg-[var(--bg-tertiary)] border border-[var(--border)]',
    'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
    'outline-none focus:border-[var(--border-accent)] transition-colors',
  )

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-primary)]">
      <div className="titlebar-drag fixed top-0 left-0 right-0 h-8 z-50" />

      <div className="flex flex-col items-center justify-center w-full px-6">
        <motion.div {...motionPresets.slideUp} className="w-full max-w-md space-y-8">
          {/* Logo + title */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="relative">
              <div className="absolute inset-0 scale-[2.5] rounded-full bg-[var(--accent)] opacity-[0.06] blur-2xl" />
              <img src={logo} alt="ClawWork" className="relative w-16 h-16 rounded-2xl shadow-[var(--glow-accent)]" />
            </div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)] tracking-tight">
              {t('setup.welcome')}
            </h1>
            <p className="text-[var(--text-muted)] leading-relaxed text-sm">
              {step === 'workspace' ? (
                <>{t('setup.desc1')}<br />{t('setup.desc2')}</>
              ) : (
                t('setup.gatewayDesc')
              )}
            </p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2">
            {(['workspace', 'gateway'] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors',
                  step === s
                    ? 'bg-[var(--accent)] text-black'
                    : s === 'workspace' && step === 'gateway'
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
                )}>
                  {s === 'workspace' && step === 'gateway' ? <CheckCircle2 size={14} /> : i + 1}
                </div>
                {i === 0 && (
                  <div className={cn(
                    'w-8 h-0.5 rounded',
                    step === 'gateway' ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]',
                  )} />
                )}
              </div>
            ))}
          </div>

          {/* Step content */}
          <AnimatePresence mode="wait">
            {step === 'workspace' ? (
              <motion.div
                key="workspace"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-elevated)] space-y-4">
                  <label className="font-medium text-[var(--text-secondary)] text-sm flex items-center gap-2">
                    <FolderOpen size={15} className="text-[var(--text-muted)]" />
                    {t('setup.workspaceDir')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={path}
                      onChange={(e) => { setPath(e.target.value); setError('') }}
                      className={inputClass}
                      placeholder={t('setup.selectDir')}
                    />
                    <Button
                      variant="outline"
                      onClick={handleBrowse}
                      className="titlebar-no-drag gap-1.5 h-10"
                    >
                      <FolderOpen size={15} />
                      {t('setup.browse')}
                    </Button>
                  </div>
                </div>

                <Button
                  onClick={handleWorkspaceNext}
                  disabled={loading || !path.trim()}
                  className="titlebar-no-drag w-full h-11 gap-2"
                >
                  {loading ? (
                    <><Loader2 size={16} className="animate-spin" />{t('setup.initializing')}</>
                  ) : (
                    <>{t('setup.next')}<ArrowRight size={16} /></>
                  )}
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="gateway"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-elevated)] space-y-4">
                  <label className="font-medium text-[var(--text-secondary)] text-sm flex items-center gap-2">
                    <Server size={15} className="text-[var(--text-muted)]" />
                    {t('setup.gatewayConfig')}
                  </label>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] mb-1 block">{t('settings.gatewayName')}</label>
                    <input
                      type="text"
                      value={gwName}
                      onChange={(e) => setGwName(e.target.value)}
                      placeholder="Default Gateway"
                      className={cn(inputClass, 'w-full')}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] mb-1 block">{t('settings.gatewayUrl')}</label>
                    <input
                      type="text"
                      value={gwUrl}
                      onChange={(e) => { setGwUrl(e.target.value); setTestResult(null) }}
                      placeholder="ws://127.0.0.1:18789"
                      className={cn(inputClass, 'w-full')}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] mb-1 block">Token</label>
                    <input
                      type="password"
                      value={gwToken}
                      onChange={(e) => { setGwToken(e.target.value); setTestResult(null) }}
                      placeholder={t('settings.tokenPlaceholder')}
                      className={cn(inputClass, 'w-full')}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] mb-1 block">{t('settings.password')}</label>
                    <input
                      type="password"
                      value={gwPassword}
                      onChange={(e) => { setGwPassword(e.target.value); setTestResult(null) }}
                      placeholder={t('settings.passwordPlaceholder')}
                      className={cn(inputClass, 'w-full')}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleTestGateway} disabled={testing} className="titlebar-no-drag gap-1.5">
                      {testing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      {t('settings.testConnection')}
                    </Button>
                    {testResult === 'success' && (
                      <span className="text-xs text-[var(--accent)] flex items-center gap-1">
                        <CheckCircle2 size={12} /> {t('settings.testSuccess')}
                      </span>
                    )}
                    {testResult === 'fail' && (
                      <span className="text-xs text-[var(--danger)]">{t('settings.testFailed')}</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setStep('workspace')}
                    className="titlebar-no-drag h-11 gap-1.5"
                  >
                    <ArrowLeft size={16} />
                    {t('setup.back')}
                  </Button>
                  <Button
                    onClick={handleFinish}
                    disabled={saving}
                    className="titlebar-no-drag flex-1 h-11 gap-2"
                  >
                    {saving ? (
                      <><Loader2 size={16} className="animate-spin" />{t('setup.initializing')}</>
                    ) : (
                      t('setup.getStarted')
                    )}
                  </Button>
                </div>
                <button
                  onClick={handleSkipGateway}
                  className="w-full text-center text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  {t('setup.skipGateway')}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <p className="text-sm text-[var(--danger)] text-center">{error}</p>
          )}
        </motion.div>
      </div>
    </div>
  )
}
