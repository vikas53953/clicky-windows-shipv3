# Milestones

## M0 Discovery

Status: PASS

- Workspace inspected.
- SHIPv3 docs found.
- No existing app scaffold, lockfile, or git repo found.
- Node/npm found.
- Rust/Cargo were missing initially, then installed through Rustup.

## M1 Phase 1 Mock Shell

Status: PASS for web mock and native build

- npm workspace scaffolded.
- React/Vite app created.
- State machine and point-tag parser tested.
- Settings panel and overlay preview implemented.
- Mock push-to-talk flow verified with Playwright.
- Tauri v2 scaffold created and native release build verified.

## M2 Worker Scaffold

Status: PASS for mock Worker

- Cloudflare Worker scaffolded.
- `/health`, `/chat`, `/tts`, and `/transcribe-token` implemented.
- Local Worker mock verified on port 8789.
- Real provider calls require Worker secrets.

## M3 Native Capture Pipeline

Status: PARTIAL PASS

- Native overlay window follows the physical Windows cursor.
- Overlay is click-through, transparent, and always-on-top.
- Native cursor metadata reaches the React status UI.
- Phase 2 global shortcut scaffold is registered as `ctrl+alt+space`.
- Microphone permission/device probe is implemented.
- Pending: real audio capture, all-monitor screenshot capture, AssemblyAI streaming, Claude live response, and ElevenLabs playback.
