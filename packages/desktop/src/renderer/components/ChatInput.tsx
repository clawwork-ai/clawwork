import { useRef, useCallback, useState, useEffect, type KeyboardEvent, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Paperclip, X, ChevronDown, Cpu, Brain } from 'lucide-react';
import type { MessageImageAttachment } from '@clawwork/shared';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion as motionPresets } from '@/styles/design-tokens';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger,
  DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useTaskStore } from '../stores/taskStore';
import { useMessageStore } from '../stores/messageStore';
import { useUiStore } from '../stores/uiStore';

interface PendingImage {
  file: File;
  previewUrl: string; // blob URL for display
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = 'image/png,image/jpeg,image/gif,image/webp';

/** Validate and create blob preview URLs for image files. Returns accepted images. */
function processImageFiles(files: File[]): PendingImage[] {
  const accepted: PendingImage[] = [];
  for (const file of files) {
    if (file.size > MAX_IMAGE_SIZE) {
      toast.error(`${file.name} exceeds 5MB limit`);
      continue;
    }
    if (!file.type.startsWith('image/')) {
      toast.error(`${file.name} is not an image`);
      continue;
    }
    accepted.push({ file, previewUrl: URL.createObjectURL(file) });
  }
  return accepted;
}

/** Read a File as base64 (no data URL prefix). */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1]);
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

const THINKING_LEVELS = ['off', 'low', 'medium', 'high'] as const;
type ThinkingLevel = typeof THINKING_LEVELS[number];

const THINKING_LABEL_KEYS: Record<ThinkingLevel, string> = {
  off: 'chatInput.thinkingOff',
  low: 'chatInput.thinkingLow',
  medium: 'chatInput.thinkingMedium',
  high: 'chatInput.thinkingHigh',
};

export default function ChatInput() {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);

  const activeTask = useTaskStore((s) =>
    s.tasks.find((t) => t.id === s.activeTaskId),
  );

  const addMessage = useMessageStore((s) => s.addMessage);
  const setProcessing = useMessageStore((s) => s.setProcessing);
  const updateTaskTitle = useTaskStore((s) => s.updateTaskTitle);
  const isOffline = useUiStore((s) => {
    if (!activeTask) return false;
    const gwStatus = s.gatewayStatusMap[activeTask.gatewayId];
    return gwStatus === 'disconnected' || gwStatus === undefined;
  });

  const modelCatalog = useUiStore((s) => s.modelCatalog);
  const currentModel = activeTask?.model;
  const currentThinking = (activeTask?.thinkingLevel ?? 'off') as ThinkingLevel;
  const modelLabel = currentModel
    ? modelCatalog.find((m) => m.id === currentModel)?.name ?? currentModel.split('/').pop() ?? currentModel
    : modelCatalog[0]?.name ?? 'Default';

  const handleModelChange = useCallback((modelId: string) => {
    if (!activeTask) return;
    const { updateTaskMetadata } = useTaskStore.getState();
    updateTaskMetadata(activeTask.id, { model: modelId });
    // OpenClaw sessions.patch uses `modelOverride` (provider/model format), not `model`
    window.clawwork.patchSession(activeTask.gatewayId, activeTask.sessionKey, { modelOverride: modelId }).catch(() => {
      toast.error('Failed to update model');
    });
  }, [activeTask]);

  const handleThinkingChange = useCallback((level: ThinkingLevel) => {
    if (!activeTask) return;
    const { updateTaskMetadata } = useTaskStore.getState();
    updateTaskMetadata(activeTask.id, { thinkingLevel: level === 'off' ? undefined : level });
    // OpenClaw accepts "off" | "low" | "medium" | "high" as thinkingLevel string
    window.clawwork.patchSession(activeTask.gatewayId, activeTask.sessionKey, { thinkingLevel: level }).catch(() => {
      toast.error('Failed to update thinking level');
    });
  }, [activeTask]);

  // Revoke blob URLs on cleanup
  useEffect(() => {
    return () => {
      pendingImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup only on unmount
  }, []);

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const accepted = processImageFiles(Array.from(files));
    if (accepted.length) {
      setPendingImages((prev) => [...prev, ...accepted]);
    }
    e.target.value = '';
  }, []);

  const removeImage = useCallback((index: number) => {
    setPendingImages((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleSend = useCallback(async () => {
    const textarea = textareaRef.current;
    if (!textarea || !activeTask || isOffline) return;

    const content = textarea.value.trim();
    if (!content && !pendingImages.length) return;

    textarea.value = '';
    textarea.style.height = 'auto';
    const images = [...pendingImages];
    setPendingImages([]);

    // Store preview data URLs in message for chat display
    const msgImages: MessageImageAttachment[] | undefined = images.length
      ? images.map((img) => ({ fileName: img.file.name, dataUrl: img.previewUrl }))
      : undefined;

    addMessage(activeTask.id, 'user', content || '', msgImages);
    setProcessing(activeTask.id, true);

    if (!activeTask.title) {
      const titleSource = content || (images.length ? `[${t('chatInput.image')}]` : '');
      const title = titleSource.slice(0, 30).replace(/\n/g, ' ').trim();
      updateTaskTitle(activeTask.id, title + (titleSource.length > 30 ? '\u2026' : ''));
    }

    try {
      // Read base64 only at send time
      const attachments = images.length
        ? await Promise.all(images.map(async (img) => ({
            mimeType: img.file.type || 'image/png',
            fileName: img.file.name,
            content: await readAsBase64(img.file),
          })))
        : undefined;
      const result = await window.clawwork.sendMessage(activeTask.gatewayId, activeTask.sessionKey, content || '', attachments);
      if (result && !result.ok) {
        setProcessing(activeTask.id, false);
        const msg = result.error || t('errors.sendFailed');
        addMessage(activeTask.id, 'system', `${t('errors.sendFailed')}: ${msg}`);
        toast.error('Failed to send message', { description: msg });
      }
    } catch (err) {
      setProcessing(activeTask.id, false);
      const msg = err instanceof Error ? err.message : String(err);
      addMessage(activeTask.id, 'system', `${t('errors.sendFailed')}: ${msg}`);
      toast.error('Failed to send message', { description: msg });
    }
  }, [activeTask, addMessage, setProcessing, updateTaskTitle, isOffline, pendingImages, t]);;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (!imageFiles.length) return;
    e.preventDefault();

    const accepted = processImageFiles(imageFiles);
    if (accepted.length) {
      setPendingImages((prev) => [...prev, ...accepted]);
    }
  }, []);

  const disabled = !activeTask || isOffline;
  const placeholder = isOffline
    ? t('chatInput.offlineReadOnly')
    : !activeTask
      ? t('chatInput.createTaskFirst')
      : t('chatInput.describeTask');

  return (
    <div className="flex-shrink-0 px-6 pb-5">
      <div className="max-w-3xl mx-auto">
        {/* Image preview strip */}
        <AnimatePresence>
          {pendingImages.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex gap-2 mb-2 overflow-x-auto pb-1"
            >
              {pendingImages.map((img, i) => (
                <motion.div
                  key={`${img.file.name}-${i}`}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative flex-shrink-0 group"
                >
                  <img
                    src={img.previewUrl}
                    alt={img.file.name}
                    className="h-16 w-16 rounded-lg object-cover border border-[var(--border-subtle)]"
                  />
                  <button
                    onClick={() => removeImage(i)}
                    className={cn(
                      'absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full',
                      'bg-[var(--bg-elevated)] border border-[var(--border-subtle)]',
                      'flex items-center justify-center',
                      'opacity-0 group-hover:opacity-100 transition-opacity',
                      'text-[var(--text-muted)] hover:text-[var(--danger)]',
                    )}
                  >
                    <X size={10} />
                  </button>
                  <span className="absolute bottom-0 left-0 right-0 text-[9px] text-center text-[var(--text-muted)] bg-black/50 rounded-b-lg truncate px-1">
                    {img.file.name}
                  </span>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Model & Thinking toolbar */}
        {activeTask && !isOffline && (
          <div className="flex items-center gap-1.5 mb-1.5">
            {/* Model selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={cn(
                  'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs',
                  'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                  'hover:bg-[var(--bg-hover)] transition-colors',
                )}>
                  <Cpu size={12} className="flex-shrink-0" />
                  <span className="max-w-[100px] truncate">{modelLabel}</span>
                  <ChevronDown size={10} className="opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-60 overflow-y-auto">
                {modelCatalog.map((m) => (
                  <DropdownMenuItem
                    key={m.id}
                    onClick={() => handleModelChange(m.id)}
                    className={cn(m.id === currentModel && 'font-medium text-[var(--accent)]')}
                  >
                    <span className="truncate">{m.name ?? m.id}</span>
                    {m.provider && (
                      <span className="ml-auto pl-2 text-[10px] text-[var(--text-muted)]">{m.provider}</span>
                    )}
                  </DropdownMenuItem>
                ))}
                {modelCatalog.length === 0 && (
                  <DropdownMenuItem disabled>
                    <span className="text-[var(--text-muted)] italic">No models available</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenuSeparator className="h-4 w-px mx-0.5" />

            {/* Thinking level selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={cn(
                  'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs',
                  'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                  'hover:bg-[var(--bg-hover)] transition-colors',
                  currentThinking !== 'off' && 'text-[var(--accent)]',
                )}>
                  <Brain size={12} className="flex-shrink-0" />
                  <span>{t(THINKING_LABEL_KEYS[currentThinking])}</span>
                  <ChevronDown size={10} className="opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {THINKING_LEVELS.map((level) => (
                  <DropdownMenuItem
                    key={level}
                    onClick={() => handleThinkingChange(level)}
                    className={cn(level === currentThinking && 'font-medium text-[var(--accent)]')}
                  >
                    {t(THINKING_LABEL_KEYS[level])}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        <div className={cn(
          'flex items-end gap-2',
          'bg-[var(--bg-elevated)] rounded-2xl p-3.5',
          'border border-[var(--border-subtle)]',
          'shadow-[var(--shadow-elevated)]',
          'ring-accent-focus transition-all duration-200',
          isOffline && 'opacity-60',
        )}>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Attach button */}
          <motion.div
            whileHover={motionPresets.scale.whileHover}
            whileTap={motionPresets.scale.whileTap}
            transition={motionPresets.scale.transition}
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <Paperclip size={16} />
            </Button>
          </motion.div>

          <textarea
            ref={textareaRef}
            rows={1}
            placeholder={placeholder}
            disabled={disabled}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            onPaste={handlePaste}
            className={cn(
              'flex-1 resize-none bg-transparent',
              'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
              'outline-none max-h-40 disabled:opacity-50',
            )}
          />
          <motion.div
            whileHover={motionPresets.scale.whileHover}
            whileTap={motionPresets.scale.whileTap}
            transition={motionPresets.scale.transition}
          >
            <Button
              variant="soft"
              size="icon"
              onClick={handleSend}
              disabled={disabled}
              className="rounded-xl"
            >
              <Send size={16} />
            </Button>
          </motion.div>
        </div>
        <p className="text-xs text-[var(--text-muted)] text-center mt-2.5 tracking-wide">
          {isOffline
            ? t('chatInput.offlineHint')
            : t('chatInput.poweredBy')}
        </p>
      </div>
    </div>
  );
}
