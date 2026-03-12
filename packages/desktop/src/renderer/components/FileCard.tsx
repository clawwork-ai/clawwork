import { motion } from 'framer-motion';
import { FileText, FileCode, Image, File } from 'lucide-react';
import type { Artifact, ArtifactType } from '@clawwork/shared';
import { cn, formatRelativeTime, formatFileSize } from '@/lib/utils';
import { motion as motionPresets } from '@/styles/design-tokens';

interface FileCardProps {
  artifact: Artifact;
  taskTitle: string;
  selected: boolean;
  onClick: () => void;
}

function getIcon(type: ArtifactType, name: string) {
  if (type === 'image') return Image;
  if (type === 'code') return FileCode;
  if (name.endsWith('.md') || name.endsWith('.txt')) return FileText;
  return File;
}

export default function FileCard({ artifact, taskTitle, selected, onClick }: FileCardProps) {
  const Icon = getIcon(artifact.type, artifact.name);

  return (
    <motion.button
      onClick={onClick}
      {...motionPresets.scale}
      className={cn(
        'w-full text-left rounded-lg border p-3 transition-colors',
        selected
          ? 'border-[var(--border-accent)] bg-[var(--accent-dim)]'
          : 'border-[var(--border)] hover:bg-[var(--bg-hover)]',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-md bg-[var(--bg-tertiary)] flex items-center justify-center">
          <Icon size={18} className="text-[var(--text-muted)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--text-primary)] truncate">
            {artifact.name}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {formatFileSize(artifact.size)}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] text-[var(--text-muted)] truncate max-w-[120px]">
              {taskTitle}
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">·</span>
            <span className="text-[10px] text-[var(--text-muted)]">
              {formatRelativeTime(new Date(artifact.createdAt))}
            </span>
          </div>
        </div>
      </div>
    </motion.button>
  );
}
