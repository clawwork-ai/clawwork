import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import i18n from '../i18n'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

function getRtf(): Intl.RelativeTimeFormat {
  const locale = i18n.language === 'zh' ? 'zh-CN' : 'en'
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
}

export function formatRelativeTime(date: Date): string {
  const diff = date.getTime() - Date.now()
  const rtf = getRtf()
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) {
      return rtf.format(Math.round(diff / ms), unit)
    }
  }
  return i18n.t('common.justNow')
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return String(tokens)
  if (tokens < 100_000) return `${(tokens / 1000).toFixed(1)}k`
  return `${(tokens / 1000).toFixed(0)}k`
}
