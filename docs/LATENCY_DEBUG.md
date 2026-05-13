# Clicky Latency Debug

Date: 2026-05-13

## Finding

The live delay is mostly not microphone capture.

From the local Worker log during the user's live test:

```txt
POST /transcribe 200 OK (1068ms)
POST /chat 200 OK (10004ms)
POST /tts 200 OK (3424ms)
```

Interpretation:

- ElevenLabs STT: about 1.1 seconds.
- OpenCode/Kimi chat with screen context: about 10.0 seconds.
- ElevenLabs TTS: about 3.4 seconds.

The largest latency source is the Kimi chat call, especially when Clicky sends screenshot context. TTS is the second largest delay. STT is comparatively small.

## Change Made

Clicky now records local stage timings for each live flow and prints them in the Worker status panel after the answer finishes:

```txt
Live flow completed. Timings: stop ..., STT ..., screen ..., model first ..., model total ..., TTS ..., first voice request ..., first audio ..., playback ..., total ...
```

Clicky also skips screenshot capture for simple conversational prompts such as:

- "are you there"
- "say hi"
- "hello Clicky"
- "can you hear me"

For screen-help prompts such as "where should I click", "help me with this app", or "what is on this screen", Clicky still captures and sends native screenshots.

## Phase 2B Voice Streaming

Clicky now streams speech sentence-by-sentence. The app sends the first complete model sentence to ElevenLabs while later model tokens are still arriving.

Watch these fields during live testing:

- `first voice request`: when the first completed sentence was sent to TTS.
- `first audio`: when the first ElevenLabs audio segment was ready.
- `TTS`: total TTS time across all streamed sentence segments.
- `playback`: total audio duration.

The important perceived-latency number is `first audio`. Total playback can still be long when the answer is long.

## Verification

Passing commands after the change:

```powershell
npm run test -w apps/clicky-windows
npm run build -w apps/clicky-windows
npm run tauri:build
npm run smoke:live-providers
```

The updated native executable was rebuilt at:

```txt
C:\Users\vikasmit\Downloads\vikas work\clicky\apps\clicky-windows\src-tauri\target\release\clicky-windows.exe
```
