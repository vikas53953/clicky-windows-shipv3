# Clicky Windows SHIPv3 Plan

## Discovery Summary

This folder began as a SHIPv3 prompt workspace, not an existing codebase. The only source files were the SHIP Autopilot v3 framework and the SHIP SDLC gate checklist. No project-specific package manager, routing, component, or desktop conventions existed yet.

## SHIPv3 Mapping

- Package manager: npm, matching SHIPv3 defaults.
- Frontend: React plus Vite plus TypeScript, wrapped by Tauri v2 for Windows.
- Styling: CSS variables with production UI components for Phase 1; Tailwind can be added later if SHIPv3 requires utility styling across a larger app.
- Icons: lucide-react.
- Backend/proxy: Cloudflare Worker TypeScript.
- Ports: Vite on 5174 and Worker on 8789 for this machine because 5173, 8787, and 8788 are already occupied.
- Docs: SHIPv3 gate evidence lives under `docs/`.

## File Map

```txt
apps/
  clicky-windows/
    src/
      components/        React UI components for settings, overlay, status, and mock flow
      services/          State machine, point-tag parsing, Worker client, Tauri bridge
      tauri/             Browser-safe adapters around optional Tauri APIs
      test/              Vitest setup
    src-tauri/
      src/               Rust Tauri shell scaffold for tray, overlay, hotkey, and commands
worker/
  src/
    index.ts             Cloudflare Worker routes
  test/
    worker.test.ts       Worker behavior tests
docs/
  CLICKY_WINDOWS_PLAN.md Current plan
  SECURITY.md            Security and privacy model
  TESTING.md             Verification steps
  ship-report.md         Honest SHIPv3 status
```

## Phase 1 Deliverable

Phase 1 builds a runnable mock shell:

1. Settings/control panel in React.
2. Browser-testable overlay preview with a blue Clicky buddy.
3. Mock push-to-talk flow using the same state machine planned for native hotkeys.
4. Mock streamed response that includes point tags internally but hides raw tags from users.
5. Animated pointer target in the overlay preview.
6. Tauri v2 Rust scaffold for tray and overlay windows.
7. Worker scaffold with `/chat`, `/tts`, and `/transcribe-token`.

## Phase 2 Deliverable

Phase 2 moved the shell toward the real Windows Clicky behavior:

1. Native overlay window follows the physical cursor.
2. Overlay is always-on-top, click-through, and rendered as a compact buddy plus bubble.
3. Rust emits cursor metadata to React.
4. React status rail distinguishes browser preview from native runtime.
5. Microphone permission/device probe is available from the control panel.
6. Native global shortcut scaffold uses `ctrl+alt+space`.
7. Browser and native smoke scripts verify the Phase 2 behavior.

## Current Implemented State

The current workspace is past the original Phase 2 plan:

1. Real browser/WebView microphone recording is wired for live mode.
2. Speech recognition is used locally when the WebView provides a transcript.
3. Speech-energy gating hides the waveform until the user is actually speaking.
4. Live Talk is one-press: press Talk, speak, pause, and Clicky auto-sends after silence.
5. Native Tauri screenshot capture returns compressed JPEG monitor context without a browser picker.
6. OpenCode/Kimi is verified live through the Worker.
7. ElevenLabs routes are wired, and `/voice-health?deep=true` gives sanitized live voice diagnostics.
8. Local voice fallback tries Windows speech synthesis if Worker-routed ElevenLabs fails.
9. TipTour-style hidden workflow plans are supported in teaching mode: model text can include `<CLICKY_PLAN>...</CLICKY_PLAN>`, Clicky strips the raw block from visible text, and the status rail renders a checklist.
10. `npm run audit:goal` runs the full local/native verification set and labels ElevenLabs as `BLOCKED_EXTERNAL` while the current key/account is blocked.

## Later Phases

1. Recover or replace the ElevenLabs account/key so TTS and STT live-provider smokes pass.
2. Promote a local open-source STT path if ElevenLabs is no longer the desired voice provider.
3. Build the Windows equivalent of TipTour's `ElementResolver`: Windows UI Automation first, browser DOM/CDP second, `[POINT:...]` fallback last.
4. Add a focus-highlight brush equivalent to TipTour's `Ctrl+Shift` highlight mode.
5. Add a lower-level Windows keyboard hook if true bare `Ctrl+Alt` press-and-hold is required.
6. Package signed Windows builds after privacy/security gates pass.

## Risks

- Windows click-through overlay needs native validation, because browser preview cannot prove OS-level hit testing.
- ElevenLabs currently returns `401 detected_unusual_activity`; local/native Clicky passes audit, but ElevenLabs STT/TTS cannot be marked complete until the provider block is fixed.
- Global `Ctrl+Alt` press-and-hold behavior may need a native plugin or Rust-side keyboard hook if the JavaScript plugin only reports discrete shortcut events.
- TipTour-style action plans are teaching-only for now. Autopilot mouse/keyboard execution should stay off until explicit approval, permission, targeting, and rollback gates exist.
