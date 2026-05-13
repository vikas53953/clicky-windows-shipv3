# Clicky Windows SHIPv3

Windows-native Clicky scaffold built from the SHIPv3 instructions in this folder.

## What Runs Now

- React/Vite control panel on `http://127.0.0.1:5174`.
- Mock push-to-talk flow.
- Blue Clicky overlay preview.
- Native Tauri overlay that follows the physical Windows cursor.
- Native overlay is click-through and always-on-top.
- Microphone permission/device probe from the control panel.
- Real microphone recording path with waveform level metering during listening.
- Speech-energy gated waveform: no waveform in idle or silent-listening states.
- One-press live talk flow: press Talk, speak, pause, and Clicky auto-sends after silence.
- Phase 2 global shortcut scaffold: `Ctrl+Alt+Space`.
- Worker live provider paths for OpenCode chat, ElevenLabs TTS, and ElevenLabs STT.
- Safe ElevenLabs voice health diagnostic at `/voice-health?deep=true`.
- Local voice fallback path: VoxCPM on localhost, then Voicebox/Chatterbox, then Windows speech synthesis.
- Settings controls for Clicky color and avatar.
- `Test Voice` button for the Worker-routed TTS path.
- Native Windows screenshot capture through the Tauri backend, without browser share picker in the packaged app.
- Mock streamed response with hidden point-tag parsing.
- Cloudflare Worker mock proxy on `http://127.0.0.1:8789`.

Ports `5173`, `8787`, and `8788` were already occupied by other local apps on this machine, so this workspace uses `5174` and `8789`.

## Commands

```powershell
npm install
npm run dev
npm run worker:dev
npm run smoke:phase1
npm run smoke:phase2
npm run smoke:phase2:native
npm run smoke:secrets
npm run smoke:shortcut
npm run smoke:style-controls
npm run smoke:voice-behavior
npm run smoke:voice-fallback
npm run smoke:voice-health
npm run check:voxcpm
npm run voxcpm:check-prereqs
npm run smoke:live-providers
npm run audit:goal
npm run configure:live-providers
npm test
npm run build
npm run tauri:build
```

Open the app at:

```txt
http://127.0.0.1:5174
```

Worker health:

```txt
http://127.0.0.1:8789/health
```

ElevenLabs voice health:

```txt
http://127.0.0.1:8789/voice-health?deep=true
```

## Native Tauri Status

The Tauri v2 scaffold exists under `apps/clicky-windows/src-tauri`, including tray and overlay-window setup. Phase 2 verifies the native overlay follows cursor movement in the built `.exe`.

Rust/Cargo are installed through Rustup:

```txt
rustc 1.95.0
cargo 1.95.0
```

Native build now succeeds:

```powershell
npm run tauri:build
```

The npm Tauri scripts automatically prepend `%USERPROFILE%\.cargo\bin`, so they work even when the current shell has not refreshed PATH after Rustup installation.

Built executable:

```txt
apps/clicky-windows/src-tauri/target/release/clicky-windows.exe
```

Latest QA:

```txt
docs/GOAL_AUDIT.md
docs/TESTING.md
docs/PHASE2_QA_REPORT.md
docs/phase2-browser-smoke.png
docs/phase2-native-smoke.png
docs/voice-behavior-smoke.png
docs/live-voice-fallback-smoke.png
```

Live provider setup:

```txt
docs/LIVE_PROVIDER_SETUP.md
docs/ELEVENLABS_RECOVERY.md
docs/VOXCPM_LOCAL_TTS.md
```

Current live-provider caveats:

```txt
OpenCode/Minimax and ElevenLabs live paths have been exercised locally through the Worker.
MiniMax M2.7 currently behaves as a text/tool model in this app, so raw screenshot image input is not sent on that route.
For true "see the whole screen" behavior, add a vision-capable model route or OCR/UI extraction path.
The dominant product gap is still UX: the tiny cursor-following overlay should become the main experience, and the large window should become settings/debug only.
```

Claude review handoff:

```txt
docs/CLAUDE_REVIEW_BRIEF.md
```

## Secrets

Do not put provider keys in the desktop app or chat.

For real Worker mode, configure Cloudflare Worker secrets:

```powershell
npx wrangler secret put OPENCODE_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ASSEMBLYAI_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler secret put ELEVENLABS_VOICE_ID
```

OpenAI OAuth from Codex/ChatGPT is not used as an app credential. Clicky defaults to OpenCode Zen MiniMax (`minimax-m2.7`) for live LLM calls and needs `OPENCODE_API_KEY` stored only in the Worker.
