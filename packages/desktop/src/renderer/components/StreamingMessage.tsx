import { motion } from 'framer-motion';
import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion as motionPresets } from '@/styles/design-tokens';
import MarkdownContent from './MarkdownContent';

interface StreamingMessageProps {
  content: string;
}

export default function StreamingMessage({ content }: StreamingMessageProps) {
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
        <div className="leading-relaxed text-[var(--text-primary)]">
          <MarkdownContent content={content} showCursor />
        </div>
      </div>
    </motion.div>
  );
}
