# Testing Notes

## Commands

```powershell
npm install
npm test
npm run typecheck
npm run build
npm run dev
npm run worker:dev
npm run tauri:build
npm run audit:goal
npm run smoke:phase1
npm run smoke:phase2
npm run smoke:phase2:native
npm run smoke:secrets
npm run smoke:shortcut
npm run smoke:style-controls
npm run smoke:voice-behavior
npm run smoke:voice-fallback
npm run smoke:voice-health
npm run run:live-clicky
npm run smoke:live-providers
```

## Expected Checks

- Unit tests pass for point-tag parsing.
- Unit tests pass for Clicky state transitions.
- Unit tests pass for native status helpers.
- Worker tests pass for CORS and mock routes.
- Vite build succeeds for the desktop UI.
- Worker TypeScript build succeeds.
- Tauri native release build succeeds.
- Browser smoke verifies the mock flow and microphone permission probe.
- Native smoke verifies the release `.exe` launches and the overlay window follows cursor movement.
- Shortcut smoke verifies `Ctrl+Alt+Space` starts and sends the rendered mock flow.
- Style smoke verifies Clicky color/avatar settings persist after reload.
- Voice behavior smoke verifies the waveform stays hidden in idle/silent states.
- Component tests verify the waveform appears only while listening with active speech.
- Secret smoke verifies source/docs/scripts do not contain API-key shaped values.
- Voice health smoke verifies whether ElevenLabs is usable or externally blocked.

## Browser Smoke

1. Run `npm run dev`.
2. Open `http://127.0.0.1:5174`.
3. Press the manual talk button.
4. In live mode, speak and pause; Clicky should auto-send after silence. In mock mode, press Send.
5. Watch the state move through transcribing, capturing, thinking, speaking, and pointing.
6. Confirm raw `[POINT:...]` tags are not visible.
7. Toggle settings and confirm the status panel updates.

Worker health in this workspace uses `http://127.0.0.1:8789/health` because ports 8787 and 8788 are occupied by other local processes.

## Native Smoke

Run:

```powershell
npm run tauri:build
npm run smoke:phase2:native
```

The native smoke starts the built `.exe`, moves the Windows cursor, verifies the overlay rectangle moves, captures `docs/phase2-native-smoke.png`, and stops only the process it launched.

## Live Provider Smoke

Only run this after `worker/.dev.vars` or Cloudflare Worker secrets are configured with `MOCK_MODE=false`, `LLM_PROVIDER=opencode`, `OPENCODE_API_KEY`, and `ELEVENLABS_API_KEY`.

For the safest local path, run the one-shot helper below. It prompts for the keys without echoing them, starts the Worker in live mode, runs the Kimi plus ElevenLabs smoke, then launches the native Clicky executable.

```powershell
npm run run:live-clicky
```

Manual path:

```powershell
npm run configure:live-providers
npm run worker:dev
npm run smoke:live-providers
```

This spends one short ElevenLabs TTS request and one short OpenCode chat request. It writes `docs/live-tts-smoke.mp3`.

Current known provider result in this workspace:

```txt
OpenCode/Kimi smoke passed.
ElevenLabs voice health: detected_unusual_activity.
```

When ElevenLabs is blocked, `npm run audit:goal` exits non-zero and reports `BLOCKED_EXTERNAL`, not a local app failure.

## Full App Live Flow

After `worker/.dev.vars` exists and `npm run worker:dev` is running in live mode:

1. Run `.\apps\clicky-windows\src-tauri\target\release\clicky-windows.exe`.
2. Open the tray menu and choose `Show Clicky`.
3. Turn off `Mock mode`.
4. Press the talk button or use `Ctrl+Alt+Space`.
5. Speak and pause; Clicky should auto-send after silence.

Expected behavior:

- Microphone records after explicit action.
- Browser/WebView speech recognition provides the transcript when supported.
- Native Tauri screen capture captures the current monitor context without a browser picker.
- Worker streams the Kimi response.
- Worker returns ElevenLabs audio and the app plays it when ElevenLabs is usable.
- If ElevenLabs is blocked, Clicky keeps text visible and tries Windows speech.

Kimi note: the current OpenCode Kimi path uses chat-completions. The app captures screenshots, but visual understanding depends on OpenCode/Kimi support for image input on that endpoint.
