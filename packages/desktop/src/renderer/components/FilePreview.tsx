import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Markdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { X, ExternalLink, Loader2 } from 'lucide-react';
import type { Artifact } from '@clawwork/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion as motionPresets } from '@/styles/design-tokens';

interface FilePreviewProps {
  artifact: Artifact;
  onClose: () => void;
  onNavigateToTask: (taskId: string, messageId: string) => void;
}

function isImage(mime: string): boolean {
  return mime.startsWith('image/');
}

function isMarkdown(mime: string, name: string): boolean {
  return mime === 'text/markdown' || name.endsWith('.md');
}

function isCode(mime: string): boolean {
  const codeMimes = [
    'text/typescript', 'text/javascript', 'application/json',
    'text/html', 'text/css', 'text/plain',
  ];
  return codeMimes.includes(mime);
}

function langFromName(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1);
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', html: 'html', css: 'css', sql: 'sql',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    sh: 'bash', yaml: 'yaml', yml: 'yaml', xml: 'xml', toml: 'toml',
  };
  return map[ext] ?? '';
}

export default function FilePreview({ artifact, onClose, onNavigateToTask }: FilePreviewProps) {
  const [content, setContent] = useState<string | null>(null);
  const [encoding, setEncoding] = useState<'utf-8' | 'base64'>('utf-8');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setContent(null);
    window.clawwork.readArtifactFile(artifact.localPath).then((res) => {
      if (res.ok && res.result) {
        const r = res.result as { content: string; encoding: string };
        setContent(r.content);
        setEncoding(r.encoding as 'utf-8' | 'base64');
      } else {
        setError(res.error ?? 'failed to read file');
      }
      setLoading(false);
    });
  }, [artifact.localPath]);

  return (
    <motion.div className="flex flex-col h-full" {...motionPresets.slideIn}>
      <header className={cn(
        'flex items-center justify-between px-4 h-11 border-b border-[var(--border)] flex-shrink-0',
      )}>
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-medium text-[var(--text-primary)] truncate">
            {artifact.name}
          </h3>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onNavigateToTask(artifact.taskId, artifact.messageId)}
            title="跳转到源消息"
          >
            <ExternalLink size={14} />
          </Button>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X size={16} />
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={20} className="animate-spin text-[var(--text-muted)]" />
            </div>
          )}
          {error && (
            <p className="text-sm text-[var(--danger)] text-center py-8">{error}</p>
          )}
          {!loading && !error && content !== null && (
            <PreviewContent
              content={content}
              encoding={encoding}
              mimeType={artifact.mimeType}
              name={artifact.name}
            />
          )}
        </div>
      </ScrollArea>
    </motion.div>
  );
}

function PreviewContent({ content, encoding, mimeType, name }: {
  content: string;
  encoding: string;
  mimeType: string;
  name: string;
}) {
  if (isImage(mimeType) && encoding === 'base64') {
    return (
      <div className="flex items-center justify-center">
        <img
          src={`data:${mimeType};base64,${content}`}
          alt={name}
          className="max-w-full max-h-[60vh] rounded-lg object-contain"
        />
      </div>
    );
  }

  if (isMarkdown(mimeType, name)) {
    return (
      <div className="prose-chat max-w-none">
        <Markdown rehypePlugins={[rehypeHighlight]}>{content}</Markdown>
      </div>
    );
  }

  if (isCode(mimeType)) {
    const lang = langFromName(name);
    const fenced = lang ? `\`\`\`${lang}\n${content}\n\`\`\`` : `\`\`\`\n${content}\n\`\`\``;
    return (
      <div className="prose-chat max-w-none">
        <Markdown rehypePlugins={[rehypeHighlight]}>{fenced}</Markdown>
      </div>
    );
  }

  if (encoding === 'utf-8') {
    return (
      <pre className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap break-words">
        {content}
      </pre>
    );
  }

  return (
    <p className="text-sm text-[var(--text-muted)] text-center py-8">
      无法预览此文件类型 ({mimeType})
    </p>
  );
}
