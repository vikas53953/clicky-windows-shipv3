# Clicky Windows - Codex Build Instructions

## Mission

Build a Windows version of Clicky inside this SHIPv3 workspace.

Clicky is a Windows desktop AI companion that lives near the cursor, listens via push-to-talk, captures current screen context, sends the transcript plus screenshots to an AI model through a secure proxy, speaks the response, and visually points at UI elements on screen.

Use the original open-source Clicky repo only as reference architecture:
https://github.com/farzaa/clicky

Also reference:
https://www.heyclicky.com/
https://x.com/heyclicky

Do not try to compile the macOS Swift/AppKit code on Windows. Treat it as product/spec reference only.

## First Principle

Use the SHIPv3 framework already present in this folder.

Before writing code:
1. Inspect the full workspace.
2. Identify SHIPv3 conventions, project layout, package manager, build commands, component patterns, routing, configs, docs, and test conventions.
3. Do not replace SHIPv3 with another framework.
4. If SHIPv3 does not already include a desktop app pattern, add the Windows desktop app as a clean sub-app/module while preserving SHIPv3 conventions.
5. Document assumptions in `docs/ASSUMPTIONS.md`.

## Windows Architecture

Prefer this architecture unless the local SHIPv3 framework clearly requires something else:

- Desktop app: Tauri v2 plus React/TypeScript frontend plus Rust backend commands.
- Windows shell: system tray app, hidden by default, settings/control panel opened from tray.
- Global push-to-talk: `Ctrl+Alt` by default, configurable later.
- Screen capture: Windows-compatible screenshot capture for all monitors.
- Overlay: transparent, always-on-top, click-through overlay window that renders a blue Clicky buddy, response bubble, spinner/waveform, and pointing animations.
- Mic/audio capture: reliable Windows microphone capture, ideally Rust backend using `cpal` or a proven equivalent.
- STT: AssemblyAI streaming via short-lived token from Cloudflare Worker.
- LLM: Claude vision/chat via Cloudflare Worker.
- TTS: ElevenLabs via Cloudflare Worker.
- Worker: Cloudflare Worker with `/chat`, `/tts`, and `/transcribe-token`.

Do not use Python plus tkinter as the main implementation unless SHIPv3 explicitly requires it.

## Security And Privacy Rules

1. Never ship API keys in the Windows desktop app.
2. Anthropic, AssemblyAI, and ElevenLabs keys live only in Cloudflare Worker secrets.
3. Desktop app talks only to the Worker, not directly to model, STT, or TTS APIs.
4. Add `.env.example`; never create or commit real `.env` secrets.
5. Do not log API keys, auth headers, screenshots, transcripts, or audio blobs.
6. Screenshots and audio are captured only after explicit user action: hotkey or button press.
7. No passive recording. No always-on screen streaming.
8. Make privacy behavior clear in the UI.
9. Default to ephemeral screenshots/audio. Do not persist them unless a debug flag is explicitly enabled.
10. Add `docs/SECURITY.md` explaining key handling, data flow, privacy posture, and threat model.

## Product Behavior

The Windows MVP must support:

- System tray with Show Clicky, Settings, Test Worker Connection, and Quit.
- Push-to-talk with default `Ctrl+Alt`.
- Manual record button in the control panel.
- Fresh screen context after explicit user action.
- Worker-routed Claude response streaming.
- Hidden `[POINT:x,y:label:screenN]` parsing and pointer animation.
- Optional ElevenLabs voice output through Worker `/tts`.
- Settings for Worker URL, model name, voice toggle, shortcut, show Clicky, debug mode, clear conversation, and privacy note.

## State Machine

Render UI from a clear state machine:

- `idle`
- `listening`
- `transcribing`
- `capturing_screen`
- `thinking`
- `speaking`
- `pointing`
- `error`

## Current Build Scope

Phase 1 must make the Windows shell and mock flow work before wiring real AssemblyAI, Claude, and ElevenLabs.

Required first deliverables:
1. Inspect the folder and identify SHIPv3 structure.
2. Create `docs/CLICKY_WINDOWS_PLAN.md`.
3. Create or update `docs/SECURITY.md`.
4. Scaffold the Windows desktop app and Worker in the right SHIPv3 structure.
5. Implement Phase 1 MVP: system tray scaffold, settings panel, transparent overlay concept, blue Clicky buddy visual, mock push-to-talk flow, mock streamed response, and mock point-tag animation.
6. Add `.env.example` and Worker config examples.
7. Run install/build/lint/test commands that make sense for this workspace.
8. Summarize changed files, commands run, what works, pending work, and exact next Windows command.
