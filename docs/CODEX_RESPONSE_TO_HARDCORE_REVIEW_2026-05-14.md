# Codex Response To Hardcore Review - May 14, 2026

## Review Findings Verified

Claude's highest-severity findings were checked against the repo. These were confirmed:

- Anthropic streaming was raw upstream SSE and not normalized to Clicky's frontend chunk format.
- Conversation memory was missing; each voice turn was effectively standalone.
- MiniMax M2.7 cannot receive raw screenshot image input in the current OpenCode route.
- The screen-capture decision was too conservative and skipped screenshots for many normal prompts.
- The large settings/debug window still dominates the UX compared with Farza's cursor-first Clicky.
- Request timeouts, basic rate limits, and request size limits were not present.
- The shortcut code had a dead `toggle` phase path for native events.

## Fixes Applied In This Follow-Up

- Normalized Anthropic SSE into `data: {"type":"chunk","text":"..."}` events.
- Added frontend conversation history and forwards the last turns to the Worker.
- Worker now forwards prior conversation messages to Anthropic, OpenAI Responses, and OpenCode chat-completions routes.
- Added a local time/date tool path so "what time is it" does not require the model to guess.
- Added request timeouts for chat, STT, and TTS calls.
- Improved transcript arbitration so a very short/noisy ElevenLabs transcript does not always override a richer WebView transcript.
- Changed screenshot intent so Clicky captures by default except for tiny greetings/check-ins.
- Added a visible warning when the active model cannot receive raw screenshot images.
- Added Worker request size checks for chat screenshots and audio uploads.
- Added basic per-IP Worker rate limiting for chat, TTS, and transcription routes.
- Tightened CORS when `ALLOWED_ORIGINS` is configured while still preserving Tauri origins.
- Removed the unused native shortcut `toggle` phase from the frontend type/handler.
- Made the native overlay dynamically resize: small buddy-only window while idle/listening, larger only when a response bubble is needed.
- Improved the floating overlay: no redundant "Clicky" label in the bubble, buddy breathing/listening/thinking/speaking animations, and larger cursor-adjacent marker.

## Tests Added

- Anthropic stream normalization test.
- Conversation history forwarding test through the Anthropic request body.
- Current-time Worker tool test.
- Strict CORS behavior test.
- Oversized screenshot batch rejection test.
- Model screenshot capability test.
- Short-provider-transcript arbitration test.

## Still Pending

These review items are real but not solved in this patch:

- Full overlay-first product inversion: main window should become settings/debug only, and the tray should expose a tiny quick popover.
- True screen vision for the default model: either route to a vision-capable model or add OCR/UI extraction for MiniMax.
- Full browser/computer-use tool loop with confirmation UX.
- Major refactor of `worker/src/index.ts` into provider/tool/voice/router modules.
- Major refactor of `App.tsx` into focused hooks.
- Barge-in timing guarantee under 100ms.
- Tauri store migration away from `localStorage`.
- One real E2E test that launches the app, exercises talk/mock response, and verifies overlay behavior.

## Current Verification

```powershell
npm run test -w apps/clicky-windows
npm run test -w worker
npm run lint
cargo test --manifest-path apps/clicky-windows/src-tauri/Cargo.toml
npm run build
npm run tauri:build
npm run smoke:phase2:native
npm run smoke:secrets
```

All commands passed after this patch. The first packaged build attempt failed because the old `clicky-windows.exe` was still running and locked the file; after stopping that Clicky process, the packaged build passed.
