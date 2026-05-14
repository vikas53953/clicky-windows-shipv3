# Security And Privacy

## Principle

Clicky Windows must never place Anthropic, OpenAI, OpenCode, AssemblyAI, or ElevenLabs API keys in the desktop app. The desktop app talks only to a Cloudflare Worker proxy.

## Secret Handling

- Desktop app env values are limited to safe local configuration such as Worker URL and mock mode.
- Real provider keys belong in Cloudflare Worker secrets:
  - `ANTHROPIC_API_KEY`
  - `OPENAI_API_KEY`
  - `OPENCODE_API_KEY`
  - `ASSEMBLYAI_API_KEY`
  - `ELEVENLABS_API_KEY`
  - `ELEVENLABS_VOICE_ID`
- ChatGPT/Codex/OpenAI OAuth sessions are not used as app credentials. Live model calls require a provider API key stored as a Worker secret.
- `.env`, `.dev.vars`, and generated build output are ignored.
- Example files contain placeholders only.

## Data Flow

```txt
User hotkey/button
  -> local mic capture and explicit screenshot capture
  -> desktop app sends transcript plus compressed screen context to Worker
  -> Worker calls provider APIs with secrets
  -> Worker streams sanitized response/audio back
  -> desktop app renders text, voice, and point animation

When ElevenLabs TTS is unavailable, the app may try the built-in Windows speech engine. That fallback receives only the assistant response text, not screenshots, audio blobs, or provider keys.
```

## Privacy Posture

- No passive recording.
- No always-on screen streaming.
- Capture happens only after explicit user action.
- Screenshots, transcripts, and audio are ephemeral by default.
- Debug mode must not persist screenshots, transcripts, or audio unless a later explicit debug-storage design is approved.
- Logs must avoid API keys, auth headers, screenshots, transcripts, and audio blobs.

## Threat Model

| Risk | Mitigation |
| --- | --- |
| API key leak through desktop bundle | Provider keys only exist in Worker secrets. |
| User screen/audio captured unexpectedly | Capture starts only on hotkey/button action and visible listening state. |
| Sensitive data in logs | Worker and desktop code avoid logging request payloads and auth headers. |
| Untrusted origins use the Worker | CORS allows configured local origins only. |
| Large screenshots exceed model limits | Later capture phase must resize/compress before sending. |
| Unsafe model guidance | System prompt refuses secrets, passwords, private data, and destructive actions. |
| Voice-provider outage | Use local speech recognition when already available, then fall back to Windows speech only for spoken output. |

## Current Status

Phase 2 has native overlay/cursor behavior. Live ElevenLabs and OpenCode Worker routes are scaffolded, but provider calls are only live after the user configures Worker secrets locally or in Cloudflare.

## Verification

Run this source scan before sharing or packaging:

```powershell
npm run smoke:secrets
```

It scans source, docs, and scripts for API-key shaped values while ignoring local gitignored secret files such as `worker/.dev.vars`.
