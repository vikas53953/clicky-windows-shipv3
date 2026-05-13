# Phase 2 QA Report

Date: 2026-05-11

## Scope

Phase 2 moved Clicky from a web-style mock shell toward the real Windows companion behavior:

- Native overlay window follows the physical Windows cursor.
- Overlay is click-through, always-on-top, and rendered as a compact Clicky buddy plus bubble.
- Native cursor metadata is emitted from Rust to React.
- Native shortcut scaffold is registered as `ctrl+alt+space`.
- React control panel shows native runtime, cursor, overlay, shortcut, and microphone status.
- Microphone probe verifies permission/device access without recording persistently.
- Phase 2 browser and native smoke scripts were added.

## QA Results

PASS: `npm run typecheck -w apps/clicky-windows`

PASS: `npm test -w apps/clicky-windows`

- 3 test files passed.
- 7 tests passed.

PASS: `npm run build -w apps/clicky-windows`

PASS: `npm run typecheck -w worker`

PASS: `npm test -w worker`

- 1 test file passed.
- 3 tests passed.

PASS: `npm run tauri:build`

- Built executable: `apps/clicky-windows/src-tauri/target/release/clicky-windows.exe`

PASS: `npm run smoke:phase2`

- Browser automation confirmed Phase 2 UI, Worker mock, microphone permission probe, mock press-to-talk flow, hidden point tags, and no desktop horizontal overflow.
- Screenshot: `docs/phase2-browser-smoke.png`

PASS: `npm run smoke:phase2:native`

- Native automation launched the release `.exe`.
- Verified Clicky stayed running.
- Verified the overlay window moved after cursor movement: `664,444` to `1024,644`.
- Captured real desktop screenshot: `docs/phase2-native-smoke.png`

## What Is Real Now

- A native Windows Tauri process builds and launches.
- The floating overlay is a real desktop window, not only a browser preview.
- The overlay follows the physical cursor at runtime.
- The overlay no longer blocks clicks because native click-through is enabled.
- The control panel can test mock Worker connectivity.
- The control panel can probe microphone permission/device access.
- The mock interaction flow still exercises the same state machine planned for real voice/screen/AI flow.

## Honest Gaps

- `Ctrl+Alt+Space` is used for Phase 2 because Tauri global shortcuts require a non-modifier key. True bare `Ctrl+Alt` press-and-hold likely needs a lower-level Windows keyboard hook.
- Microphone capture is now real browser/WebView audio recording with live level metering, but end-to-end speech-to-text depends on ElevenLabs `/transcribe`.
- Native screen capture is implemented through Tauri/Rust and should not show the browser screen-share picker in the packaged app.
- OpenCode/Kimi is wired through the Worker and live `/chat` was verified.
- ElevenLabs `/tts` and `/transcribe` routes are wired, but the current configured ElevenLabs key is returning `401 detected_unusual_activity`, so full live voice in/out is externally blocked until the account/key is usable.
- The app still performs visual pointing only. It does not control mouse clicks or keyboard actions.

## 2026-05-12 Visual And Live Recheck

PASS: HeyClicky visual reference reviewed from `https://www.heyclicky.com/`.

PASS: Cursor buddy is now a tiny glow mark instead of a large rounded square.

PASS: Voice waveform renders beside Clicky during ready/listening states.

PASS: Color and avatar settings render and persist locally.

PASS: Browser visual QA completed at desktop and 390px mobile widths.

PASS: `npm run smoke:phase1`

PASS: `npm run smoke:phase2`

PASS: `npm run smoke:phase2:native`

PASS: `npm run tauri:build`

PASS: Rust native screen-capture smoke test

- Command: `cargo test --manifest-path apps/clicky-windows/src-tauri/Cargo.toml capture_screens_returns_jpeg_payload_without_browser_picker -- --nocapture`
- Result: 1 test passed and returned at least one JPEG screenshot payload through the native capture helper.

PARTIAL: `npm run smoke:live-providers`

- Worker live mode is reachable.
- OpenCode/Kimi chat route works.
- ElevenLabs TTS/STT currently fail with provider response `401 detected_unusual_activity`.

## Next Phase Recommendation

Build the capture pipeline next:

1. Add real Windows audio capture.
2. Add all-monitor screenshot capture plus cursor/monitor metadata.
3. Send screenshot metadata through the mock Worker route first.
4. Then wire AssemblyAI token flow, Claude streaming, and ElevenLabs playback through the Worker.
