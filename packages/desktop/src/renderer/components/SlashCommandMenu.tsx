import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { SlashCommand } from '@/lib/slash-commands';

interface SlashCommandMenuProps {
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onHoverIndex: (index: number) => void;
  onClose: () => void;
  className?: string;
}

export default function SlashCommandMenu({
  commands,
  selectedIndex,
  onSelect,
  onHoverIndex,
  onClose,
  className,
}: SlashCommandMenuProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const selectedItemRef = useRef<HTMLLIElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <AnimatePresence>
      {commands.length > 0 && (
        <>
          {/* Backdrop — clicking outside closes */}
          <div
            className="fixed inset-0 z-40"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="listbox"
            aria-label="Slash commands"
            className={cn(
              'absolute bottom-full left-0 right-0 mb-1 z-50',
              'surface-elevated rounded-xl overflow-hidden',
              'border border-[var(--border-subtle)]',
              'shadow-[var(--shadow-elevated)]',
              className,
            )}
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
          >
            <ul ref={listRef} className="max-h-52 overflow-y-auto py-1">
              {commands.map((cmd, index) => (
                <li
                  key={cmd.name}
                  ref={index === selectedIndex ? selectedItemRef : undefined}
                  role="option"
                  aria-selected={index === selectedIndex}
                  className={cn(
                    'flex items-baseline gap-3 px-4 py-2 cursor-pointer select-none',
                    'transition-colors duration-75',
                    index === selectedIndex
                      ? 'bg-[var(--accent-soft)] text-[var(--fg-primary)]'
                      : 'text-[var(--fg-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--fg-primary)]',
                  )}
                  onMouseEnter={() => onHoverIndex(index)}
                  onMouseDown={(e) => {
                    // Prevent textarea blur before selection
                    e.preventDefault();
                    onSelect(cmd);
                  }}
                >
                  {/* Command name */}
                  <span className="font-mono text-[13px] font-medium text-[var(--accent)] shrink-0">
                    /{cmd.name}
                  </span>
                  {/* Description */}
                  <span className="text-xs truncate">{cmd.description}</span>
                  {/* Arg hint */}
                  {cmd.argHint && (
                    <span className="ml-auto text-xs font-mono text-[var(--fg-muted)] shrink-0">
                      {cmd.argHint}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="px-4 py-1.5 border-t border-[var(--border-subtle)] flex gap-3 text-[10px] text-[var(--fg-muted)]">
              <span><kbd className="font-mono">↑↓</kbd> navigate</span>
              <span><kbd className="font-mono">↵</kbd> select</span>
              <span><kbd className="font-mono">Esc</kbd> close</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
