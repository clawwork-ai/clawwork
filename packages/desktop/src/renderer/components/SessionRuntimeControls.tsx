import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cpu, Zap, ChevronDown, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useUiStore } from '@/stores/uiStore';
import { useTaskStore } from '@/stores/taskStore';
import { formatTokenCompact, formatContextPercent } from '@/lib/session-runtime';
import { toast } from 'sonner';

export default function SessionRuntimeControls() {
  const { t } = useTranslation();
  const [patching, setPatching] = useState(false);

  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const activeTask = useTaskStore((s) => s.tasks.find((t) => t.id === activeTaskId));
  const runtime = useTaskStore((s) => activeTaskId ? s.taskRuntimes[activeTaskId] : undefined);
  const setTaskRuntime = useTaskStore((s) => s.setTaskRuntime);

  const defaultGatewayId = useUiStore((s) => s.defaultGatewayId);
  const gatewayId = activeTask?.gatewayId ?? defaultGatewayId;
  const modelCatalog = useUiStore((s) => gatewayId ? s.modelCatalogMap[gatewayId] ?? [] : []);

  const handlePatch = useCallback(async (patch: { model?: string; thinkingLevel?: string }) => {
    if (!activeTask || !gatewayId || patching) return;
    setPatching(true);
    try {
      const res = await window.clawwork.patchSession(gatewayId, activeTask.sessionKey, patch);
      if (res.ok && res.result) {
        // Assume patch applied; update local optimistic state
        if (runtime) {
          setTaskRuntime(activeTask.id, {
            ...runtime,
            model: patch.model ?? runtime.model,
            thinkingLevel: patch.thinkingLevel ?? runtime.thinkingLevel,
          });
        }
        toast.success(t('chatHeader.runtimeUpdated'));
      } else {
        toast.error(t('errors.updateFailed'), { description: (res as any).error });
      }
    } catch (err) {
      toast.error(t('errors.updateFailed'));
    } finally {
      setPatching(false);
    }
  }, [activeTask, gatewayId, patching, runtime, setTaskRuntime, t]);

  if (!activeTask || !runtime) return null;

  const currentModelLabel = modelCatalog.find((m) => m.id === runtime.model)?.label ?? runtime.model ?? t('common.unknown');
  const isThinkingOff = runtime.thinkingLevel === 'off' || !runtime.thinkingLevel;

  return (
    <div className="flex items-center gap-1.5 ml-3">
      {/* Model Picker */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs font-medium bg-[var(--bg-tertiary)] hover:bg-[var(--bg-elevated)] border border-transparent hover:border-[var(--border-subtle)] text-[var(--text-secondary)] gap-1.5 rounded-md"
            disabled={patching}
          >
            <Cpu size={12} className="opacity-70" />
            <span className="max-w-[100px] truncate">{currentModelLabel}</span>
            <ChevronDown size={10} className="opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 max-h-80 overflow-y-auto">
          <div className="px-2 py-1.5 text-xs text-[var(--text-muted)] font-normal">{t('chatHeader.selectModel')}</div>
          <DropdownMenuSeparator />
          {modelCatalog.map((m) => (
            <DropdownMenuItem
              key={m.id}
              onClick={() => handlePatch({ model: m.id })}
              className="text-xs py-1.5 justify-between"
            >
              <span className="truncate">{m.label}</span>
              {runtime.model === m.id && <Check size={12} className="text-[var(--accent)]" />}
            </DropdownMenuItem>
          ))}
          {modelCatalog.length === 0 && (
            <div className="text-xs text-center py-2 text-[var(--text-muted)]">
              {t('common.noModels')}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Thinking Level */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 px-2 text-xs font-medium gap-1.5 rounded-md border ${
              !isThinkingOff
                ? 'bg-[var(--accent-dim)] text-[var(--accent)] border-[var(--accent)]/20'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-transparent hover:bg-[var(--bg-elevated)] hover:border-[var(--border-subtle)]'
            }`}
            disabled={patching}
          >
            <Zap size={12} className={!isThinkingOff ? 'text-[var(--accent)]' : 'opacity-70'} />
            <span className="capitalize">{runtime.thinkingLevel || 'Off'}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          {['off', 'low', 'medium', 'high'].map((level) => (
            <DropdownMenuItem
              key={level}
              onClick={() => handlePatch({ thinkingLevel: level })}
              className="text-xs py-1.5 justify-between capitalize"
            >
              <span>{level}</span>
              {(runtime.thinkingLevel === level || (isThinkingOff && level === 'off')) && (
                <Check size={12} className="text-[var(--accent)]" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Usage Indicator */}
      {(runtime.totalTokens != null || runtime.contextPercent != null) && (
        <div className="flex items-center gap-2 ml-1 text-[10px] text-[var(--text-muted)] bg-[var(--bg-secondary)] px-2 h-6 rounded-md border border-[var(--border-subtle)]">
          {runtime.totalTokens != null && (
            <span>{formatTokenCompact(runtime.totalTokens)} tk</span>
          )}
          {runtime.totalTokens != null && runtime.contextPercent != null && (
            <span className="w-px h-2.5 bg-[var(--border)]" />
          )}
          {runtime.contextPercent != null && (
            <span className={runtime.contextPercent > 90 ? 'text-[var(--warning)]' : ''}>
              {formatContextPercent(runtime.contextPercent)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}