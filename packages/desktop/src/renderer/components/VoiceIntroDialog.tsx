import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface VoiceIntroDialogProps {
  open: boolean
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}

export default function VoiceIntroDialog({ open, onConfirm, onCancel }: VoiceIntroDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onCancel() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('voiceInput.introTitle')}</DialogTitle>
          <DialogDescription>{t('voiceInput.introDescription')}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-3">
            <p className="text-sm font-medium text-[var(--text-primary)]">{t('voiceInput.introStepHold')}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{t('voiceInput.introStepInsert')}</p>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">{t('voiceInput.introStepBeta')}</p>
        </div>

        <DialogFooter className="mt-6">
          <Button variant="ghost" onClick={onCancel}>
            {t('voiceInput.introSkip')}
          </Button>
          <Button variant="soft" onClick={() => void onConfirm()}>
            {t('voiceInput.introConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
