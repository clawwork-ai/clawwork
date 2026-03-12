import { useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { motion } from 'framer-motion';
import type { Message } from '@clawwork/shared';
import { Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion as motionPresets } from '@/styles/design-tokens';
import ToolCallCard from './ToolCallCard';

interface ChatMessageProps {
  message: Message;
  highlighted?: boolean;
  onHighlightDone?: () => void;
}

export default function ChatMessage({ message, highlighted, onHighlightDone }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!highlighted || !ref.current) return;
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = setTimeout(() => onHighlightDone?.(), 2000);
    return () => clearTimeout(timer);
  }, [highlighted, onHighlightDone]);

  if (isSystem) {
    return (
      <div className="flex justify-center py-3">
        <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      initial={motionPresets.listItem.initial}
      animate={motionPresets.listItem.animate}
      transition={motionPresets.listItem.transition}
      className={cn(
        'flex gap-3.5 py-4',
        isUser && 'flex-row-reverse',
        highlighted && 'animate-highlight rounded-lg',
      )}
    >
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser ? 'bg-[var(--bg-tertiary)]' : 'bg-[var(--accent-dim)]',
        )}
      >
        {isUser ? (
          <User size={16} className="text-[var(--text-secondary)]" />
        ) : (
          <Bot size={16} className="text-[var(--accent)]" />
        )}
      </div>

      <div className={cn('min-w-0 max-w-[80%]', isUser && 'text-right')}>
        <div
          className={cn(
            'inline-block leading-relaxed rounded-2xl px-4 py-3',
            isUser
              ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
              : 'text-[var(--text-primary)]',
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose-chat">
              <Markdown rehypePlugins={[rehypeHighlight]}>
                {message.content}
              </Markdown>
            </div>
          )}
        </div>
        {message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
