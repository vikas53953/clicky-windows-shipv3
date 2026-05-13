# Voice Provider Replacement

## Current Decision

Clicky now treats ElevenLabs as optional for the spoken answer path:

1. Use local WebView speech recognition immediately when it already produced a transcript.
2. Use ElevenLabs STT only when local recognition is empty.
3. Use ElevenLabs TTS for the best hosted voice when the Worker key/account is valid.
4. If ElevenLabs TTS fails, try a local VoxCPM OpenAI-compatible speech endpoint on `http://127.0.0.1:8000/v1/audio/speech`.
5. If VoxCPM is not running, try a local Voicebox/Chatterbox service on `http://127.0.0.1:17493`.
6. If Voicebox is not running, use Windows local speech synthesis as a last-resort fallback.

This keeps Clicky responsive even when the ElevenLabs account is expired, disabled, or out of credits.

## Recommended Open-Source Replacement

The strongest ElevenLabs-style local option for this Clicky build is now VoxCPM:

- Repo: `https://github.com/OpenBMB/VoxCPM`
- License: Apache 2.0.
- Category: local neural TTS.
- Language fit: VoxCPM2 documents 30 supported languages, including Turkish.
- Integration fit: it can be served behind an OpenAI-compatible `/audio/speech` API, which lets Clicky treat it like a local speech provider.

Documented VoxCPM2 languages:

```txt
Arabic, Burmese, Chinese, Danish, Dutch, English, Finnish, French, German, Greek,
Hebrew, Hindi, Indonesian, Italian, Japanese, Khmer, Korean, Lao, Malay,
Norwegian, Polish, Portuguese, Russian, Spanish, Swahili, Swedish, Tagalog,
Thai, Turkish, Vietnamese
```

Documented Chinese dialects:

```txt
Sichuanese, Cantonese, Wu, Northeastern Mandarin, Henan dialect, Shaanxi dialect,
Shandong dialect, Tianjin dialect, Minnan
```

Recommended path:

- TTS replacement: VoxCPM locally for multilingual voices, especially Turkish.
- Secondary TTS replacement: Voicebox locally, backed by Chatterbox Turbo.
- STT replacement: whisper.cpp or a Voicebox transcription endpoint if available in the installed build.
- Runtime shape: keep OpenCode/Kimi through the Worker, keep keys out of the app, and run local voice on localhost only.

## Local VoxCPM Hook

The desktop app now tries this first when ElevenLabs TTS is blocked:

```txt
POST http://127.0.0.1:8000/v1/audio/speech
```

Override it with:

```txt
VITE_CLICKY_VOXCPM_URL=http://127.0.0.1:8000/v1
VITE_CLICKY_VOXCPM_MODEL=openbmb/VoxCPM2
VITE_CLICKY_VOXCPM_VOICE=default
```

The request shape is OpenAI-compatible:

```json
{
  "model": "openbmb/VoxCPM2",
  "input": "Clicky voice test.",
  "voice": "default"
}
```

No provider keys are sent to VoxCPM. Only the assistant response text is sent to localhost.

## Local Voicebox Hook

The desktop app tries this after VoxCPM:

```txt
POST http://127.0.0.1:17493/speak
```

Override the URL with:

```txt
VITE_CLICKY_VOICEBOX_URL=http://127.0.0.1:17493
```

No provider keys are sent to Voicebox. Only the assistant response text is sent.

## Ollama Check

Local machine check:

```txt
ollama version: 0.23.1
installed models: nomic-embed-text, deepseek-v4-flash:cloud, moondream, gemma3:4b, qwen3.5:cloud, qwen3:4b, gpt-oss:20b
```

None of the installed Ollama models are text-to-speech models.

Online check:

- There are community Orpheus TTS model entries for Ollama/GGUF.
- The visible multilingual Orpheus Ollama tags cover languages such as German, English, French, Hindi, Italian/Spanish, Korean, and Chinese; I did not find a Turkish Ollama tag that is ready in the same way VoxCPM2 is.
- Ollama's normal API surface is still text/chat/embedding/generate focused, not a clean built-in ElevenLabs-style speech API.
- I am not using Ollama as Clicky's first local TTS path because the community Orpheus flow usually needs extra audio-token decoding/vocoder glue before it becomes a real WAV/MP3 voice service.

Decision: keep Ollama in the research bucket for now. Use VoxCPM first because it is a closer fit for Clicky's local speech output and Turkish support.

## Remaining Work

- Add a first-class local STT sidecar so Clicky does not depend on WebView recognition or ElevenLabs STT.
- Add a settings control for the voice engine after the local sidecar is stable.
- Package or bootstrap the local voice runtime for Windows so the user does not need to install it manually.
