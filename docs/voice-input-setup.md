# Voice Input Setup

> **Status:** Beta — tested on macOS only.

ClawWork supports hold-Space-to-dictate via a local [whisper.cpp](https://github.com/ggerganov/whisper.cpp) sidecar. No cloud API is involved; all transcription runs on your machine.

## Prerequisites

1. **Install whisper-cpp** (provides the `whisper-cli` binary):

   ```bash
   brew install whisper-cpp
   ```

2. **Download a Whisper model.** The `large-v3-turbo` model offers a good balance of speed and accuracy. You can substitute any GGML-format Whisper model that fits your hardware:

   | Model | Size | Notes |
   |-------|------|-------|
   | `ggml-tiny.bin` | ~75 MB | Fastest, lowest accuracy |
   | `ggml-base.bin` | ~142 MB | Good for quick tests |
   | `ggml-small.bin` | ~466 MB | Reasonable quality |
   | `ggml-medium.bin` | ~1.5 GB | Better quality |
   | `ggml-large-v3-turbo.bin` | ~1.6 GB | Recommended |
   | `ggml-large-v3.bin` | ~3.1 GB | Best accuracy, slower |

   ```bash
   mkdir -p ~/models/whisper
   cd ~/models/whisper
   curl -LO https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin
   ```

## Model Search Paths

ClawWork looks for models in the following directories (first match wins):

- `~/models/whisper/`
- `/opt/homebrew/share/whisper-cpp/models/`
- `~/.local/share/whisper-cpp/models/`

## Usage

1. Open a task in ClawWork.
2. **Hold Space** in the chat input to start recording.
3. **Release Space** to stop recording and begin transcription.
4. The transcript is inserted at the cursor position. It is never sent automatically.

A short Space press still types a normal space.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Mic button shows "unsupported" | Verify `whisper-cli` is on your PATH: `which whisper-cli` |
| "Microphone access was denied" | Grant microphone permission in **System Settings → Privacy & Security → Microphone** |
| Transcription is slow | Use a smaller model (`ggml-base.bin` or `ggml-small.bin`) |
| Wrong language detected | whisper.cpp auto-detects language. For best results, speak clearly in one language per recording |
