import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Brain, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { motion as motionPresets } from '@/styles/design-tokens';
import MarkdownContent from './MarkdownContent';

interface StreamingMessageProps {
  content: string;
  thinkingContent?: string;
}

export default function StreamingMessage({ content, thinkingContent }: StreamingMessageProps) {
  const { t } = useTranslation();
  const [thinkingOpen, setThinkingOpen] = useState(true);

  return (
    <motion.div
      initial={motionPresets.fadeIn.initial}
      animate={motionPresets.fadeIn.animate}
      transition={motionPresets.fadeIn.transition}
      className="flex gap-3.5 py-4"
    >
      <div className={cn(
        'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
        'bg-[var(--accent-dim)]',
      )}>
        <Bot size={16} className="text-[var(--accent)]" />
      </div>
      <div className="min-w-0 max-w-[80%]">
        {thinkingContent && (
          <div className="mb-2">
            <button
              onClick={() => setThinkingOpen((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs',
                'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] transition-colors',
              )}
            >
              <Brain size={12} className="text-[var(--accent)] animate-pulse" />
              <span>{t('chatMessage.thinkingProcess')}</span>
              <ChevronDown
                size={11}
                className={cn('transition-transform', thinkingOpen && 'rotate-180')}
              />
            </button>
            <AnimatePresence>
              {thinkingOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div className={cn(
                    'mt-1.5 px-3 py-2 rounded-lg text-xs leading-relaxed',
                    'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
                    'border-l-2 border-[var(--accent)] border-opacity-30',
                    'max-h-60 overflow-y-auto',
                  )}>
                    <MarkdownContent content={thinkingContent} showCursor={!content} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        {content && (
          <div className="leading-relaxed text-[var(--text-primary)]">
            <MarkdownContent content={content} showCursor />
          </div>
        )}
      </div>
    </motion.div>
  );
}
