import type { CreateVoiceSessionHandlers, VoiceSession } from '@/lib/voice/types';

const TARGET_SAMPLE_RATE = 16000;

export function createWhisperSttSession(
  handlers: CreateVoiceSessionHandlers,
): VoiceSession | null {
  if (!navigator.mediaDevices?.getUserMedia) return null;

  let stream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let processor: ScriptProcessorNode | null = null;
  let chunks: Float32Array[] = [];
  let stopped = false;

  function cleanup(): void {
    if (processor) {
      processor.disconnect();
      processor.onaudioprocess = null;
      processor = null;
    }
    if (source) {
      source.disconnect();
      source = null;
    }
    if (audioContext) {
      void audioContext.close();
      audioContext = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    chunks = [];
  }

  return {
    start: () => {
      stopped = false;
      navigator.mediaDevices
        .getUserMedia({ audio: { channelCount: 1 } })
        .then((mediaStream) => {
          if (stopped) {
            mediaStream.getTracks().forEach((t) => t.stop());
            return;
          }
          stream = mediaStream;
          audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
          source = audioContext.createMediaStreamSource(stream);
          processor = audioContext.createScriptProcessor(4096, 1, 1);
          processor.onaudioprocess = (e) => {
            const data = e.inputBuffer.getChannelData(0);
            chunks.push(new Float32Array(data));
          };
          source.connect(processor);
          processor.connect(audioContext.destination);
        })
        .catch((err) => {
          handlers.onError(err instanceof Error ? err.message : 'mic-access-failed');
        });
    },

    stop: () => {
      stopped = true;
      const captured = chunks;
      const capturedContext = audioContext;
      cleanup();

      if (captured.length === 0) {
        handlers.onEnd();
        return;
      }

      const sampleRate = capturedContext?.sampleRate ?? TARGET_SAMPLE_RATE;
      const wav = encodeWav(captured, sampleRate);

      window.clawwork
        .transcribeAudio(wav)
        .then((result) => {
          if (result.ok && result.transcript) {
            handlers.onFinalResult(result.transcript);
          } else {
            handlers.onError(result.error ?? 'transcription-failed');
          }
        })
        .catch((err) => {
          handlers.onError(err instanceof Error ? err.message : 'transcription-failed');
        })
        .finally(() => {
          handlers.onEnd();
        });
    },

    destroy: () => {
      stopped = true;
      cleanup();
    },
  };
}

function encodeWav(chunks: Float32Array[], sampleRate: number): ArrayBuffer {
  let totalLength = 0;
  for (const chunk of chunks) totalLength += chunk.length;

  const pcm = new Int16Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const s = Math.max(-1, Math.min(1, chunk[i]));
      pcm[offset++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
  }

  const dataLength = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  const pcmBytes = new Uint8Array(pcm.buffer);
  new Uint8Array(buffer).set(pcmBytes, 44);

  return buffer;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
