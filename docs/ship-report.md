# SHIP Report v3.0

## Project

- Name: Clicky Windows
- Date: 2026-05-11
- Framework: SHIP Autopilot v3.0
- Scope: Phase 2 native Windows shell plus Worker scaffold

## Decision

SHIP WITH KNOWN ISSUES for Phase 2 native shell.

Native release build succeeds and the overlay now follows the physical Windows cursor. Do not call the full voice/screenshot Windows MVP shipped yet, because real audio capture, screen capture, provider calls, and TTS playback are still future phases.

## What Works

- React/Vite app runs on `http://127.0.0.1:5174`.
- Settings/control panel opens.
- Manual push-to-talk mock flow works.
- Overlay preview shows blue Clicky buddy and response bubble.
- Real native overlay window launches, stays always-on-top, and follows the physical cursor.
- Native overlay is configured as click-through.
- Native cursor metadata is emitted into the React status UI.
- Phase 2 native shortcut scaffold uses `ctrl+alt+space`.
- Microphone permission/device probe works from the control panel.
- Point tags are parsed out of user-visible text.
- Mock point animation reaches the highlighted target.
- Worker runs locally on `http://127.0.0.1:8789`.
- Worker `/health` and `/chat` mock routes verified.
- Native Tauri release build produces `apps/clicky-windows/src-tauri/target/release/clicky-windows.exe`.
- Native executable launch smoke passes: the `.exe` starts and stays running after 8 seconds.
- Native Phase 2 smoke verifies overlay movement from `664,444` to `1024,644`.
- Browser and Playwright QA pass for the mock Phase 1 flow.
- Browser Phase 2 smoke passes with Worker mock, mic probe, mock flow, hidden point tags, and no horizontal overflow.
- Unit tests, typecheck, lint, build, production audit, and Playwright smoke pass.

## Known Issues

- System tray behavior is scaffolded in Rust but still needs interactive user-facing QA.
- `Ctrl+Alt+Space` is the Phase 2 shortcut because Tauri global shortcuts require a non-modifier key; true bare `Ctrl+Alt` press-and-hold likely needs a lower-level keyboard hook.
- Full mic capture, screenshot capture, AssemblyAI streaming, Claude live response, ElevenLabs playback, and packaged installer remain future phases.
- Ports had to move from SHIPv3 defaults because other local apps already occupy 5173, 8787, and 8788.

## Evidence

- Desktop smoke screenshot: `docs/phase1-smoke.png`
- Mobile smoke screenshot: `docs/phase1-smoke-mobile.png`
- Phase 2 browser smoke screenshot: `docs/phase2-browser-smoke.png`
- Phase 2 native smoke screenshot: `docs/phase2-native-smoke.png`
- Phase 2 QA report: `docs/PHASE2_QA_REPORT.md`
- Test log: `docs/test-log.md`
- Security model: `docs/SECURITY.md`
- API contract: `docs/api-contract.md`

## Next Steps

1. Add real Windows audio capture.
2. Add all-monitor screenshot capture and metadata.
3. Feed capture output through the mock Worker route.
4. Wire real Worker secrets for AssemblyAI, Claude, and ElevenLabs.
