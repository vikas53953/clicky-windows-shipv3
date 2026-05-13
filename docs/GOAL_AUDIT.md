# Clicky Windows Goal Audit

Date: 2026-05-13

Objective:

Make Clicky Windows feel like the real Hey Clicky product: closer visual identity, cursor-adjacent companion, voice waveform while talking, color/avatar controls, native screen capture without picker, ElevenLabs STT, and verified live/native QA.

## Audit Result

Status: complete.

Reason: local/native/product requirements are implemented and verified, OpenCode/Kimi is verified live, and the renewed ElevenLabs subscription/key now passes hosted TTS and STT smoke tests.

Recovery runbook remains available at `docs/ELEVENLABS_RECOVERY.md` if ElevenLabs blocks the account again later.

## Requirement Checklist

| Requirement | Artifact | Evidence | Status |
| --- | --- | --- | --- |
| HeyClicky-style visual identity | `apps/clicky-windows/src/components/ClickyMark.tsx`, `apps/clicky-windows/src/styles.css` | Browser visual QA screenshot in `C:\Users\vikasmit\AppData\Local\Temp\clicky-qa\clicky-render-listening.png`; default Classic avatar uses tiny cursor-style mark and glow | Pass |
| Cursor-adjacent companion | `apps/clicky-windows/src-tauri/src/main.rs`, `apps/clicky-windows/src/components/FloatingClickyOverlay.tsx` | `npm run smoke:phase2:native` passed; overlay rect moved after cursor movement | Pass |
| Voice waveform while talking | `apps/clicky-windows/src/App.tsx`, `apps/clicky-windows/src/services/voiceCapture.ts`, `apps/clicky-windows/src/components/VoiceWaveform.tsx`, `apps/clicky-windows/src/components/FloatingClickyOverlay.test.tsx`, `scripts/smoke-voice-behavior.mjs` | `npm run smoke:voice-behavior` passed and verified idle/listening/ready render `0` `.voice-waveform` nodes; `FloatingClickyOverlay` test verifies the waveform renders only when `voiceActive` is true while listening | Pass |
| Color/avatar controls | `apps/clicky-windows/src/components/SettingsPanel.tsx`, `apps/clicky-windows/src/services/workerClient.ts`, `scripts/smoke-style-controls.mjs` | `npm run smoke:style-controls` passed and verified Rose color plus Spark avatar persist in `localStorage` after reload | Pass |
| Press-and-hold Talk button | `apps/clicky-windows/src/components/SettingsPanel.tsx`, `apps/clicky-windows/src/App.tsx`, `scripts/smoke-phase1.mjs`, `scripts/smoke-phase2.mjs`, `scripts/smoke-voice-behavior.mjs` | Talk now starts recording on pointer down and sends on pointer up; browser smokes use the same hold/release gesture and pass | Pass |
| Shortcut behavior | `apps/clicky-windows/src/App.tsx`, `apps/clicky-windows/src-tauri/src/main.rs`, `scripts/smoke-shortcut.mjs` | `Ctrl+Alt+Space` now uses press-and-hold semantics; native emits `started` on key down and `ended` on release; `npm run smoke:shortcut` passed | Pass |
| Native screen capture without browser picker | `apps/clicky-windows/src-tauri/src/main.rs`, `apps/clicky-windows/src/services/screenCapture.ts` | `C:\Users\vikasmit\.cargo\bin\cargo.exe test` passed `capture_screens_returns_jpeg_payload_without_browser_picker` and returned JPEG screen payloads | Pass |
| Worker-routed Kimi/OpenCode LLM | `worker/src/index.ts`, `scripts/smoke-live-providers.mjs` | `npm run smoke:live-providers` printed `OpenCode/Kimi smoke passed: Clicky live OpenCode path is working.` | Pass |
| ElevenLabs TTS route | `worker/src/index.ts`, `apps/clicky-windows/src/services/workerClient.ts`, `scripts/smoke-live-providers.mjs` | `npm run smoke:live-providers` passed; ElevenLabs generated `docs/live-tts-smoke.mp3` with 24,285 bytes in the audit run | Pass |
| ElevenLabs STT route | `worker/src/index.ts`, `apps/clicky-windows/src/services/workerClient.ts`, `scripts/smoke-live-providers.mjs` | `npm run smoke:live-providers` passed; the ElevenLabs STT route transcribed the generated audio as `Clicky live voice test.` | Pass |
| ElevenLabs voice diagnostics | `worker/src/index.ts`, `worker/test/worker.test.ts`, `apps/clicky-windows/src/services/workerClient.ts`, `scripts/smoke-voice-health.mjs` | `/voice-health?deep=true` returned `ok: true`, `status: tts_reachable`, and `message: ElevenLabs TTS probe passed.` | Pass |
| Local voice fallback | `apps/clicky-windows/src/App.tsx`, `apps/clicky-windows/src/services/audioPlayback.ts`, `tools/voxcpm_openai_server.py`, `scripts/run-voxcpm-local.ps1`, `scripts/check-voxcpm-local.mjs`, `docs/VOICE_PROVIDER_REPLACEMENT.md`, `docs/VOXCPM_LOCAL_TTS.md` | `npm run smoke:voice-fallback` passed against a live Worker and verified the voice path is handled without leaking the long ElevenLabs remediation text; `Test Voice` now checks `/voice-health?deep=true` before falling back locally; VoxCPM is now the first local TTS fallback before Voicebox/Chatterbox and Windows speech; `npm run voxcpm:install` created `.venv-voxcpm` and installed `voxcpm`; `/health` and CORS `OPTIONS /v1/audio/speech` pass; `npm run check:voxcpm` timed out after 180 seconds because VoxCPM is running on CPU with no CUDA detected | Wired, too slow on current machine |
| TipTour-style workflow guidance | `apps/clicky-windows/src/services/workflowPlan.ts`, `apps/clicky-windows/src/services/clickySession.ts`, `apps/clicky-windows/src/components/StatusRail.tsx`, `worker/src/index.ts`, `docs/TIPTOUR_REFERENCE_NOTES.md` | TipTour reference inspected from `https://github.com/milind-soni/tiptour-macos`; Clicky now parses hidden `<CLICKY_PLAN>...</CLICKY_PLAN>` blocks, hides raw JSON, and renders a teaching checklist; `npm run smoke:phase1` verifies the plan appears and raw plan markup does not leak | Pass |
| Verified browser QA | Browser/IAB and Playwright screenshots | Desktop, listening, post-mock, and mobile screenshots captured in `C:\Users\vikasmit\AppData\Local\Temp\clicky-qa` | Pass |
| Verified native QA | `scripts/smoke-phase2-native.ps1` | `npm run smoke:phase2:native` passed after release build | Pass |
| Provider-key security | Worker-only secret flow, `scripts/smoke-secret-scan.mjs` | `worker/.dev.vars` remains local/gitignored; `npm run smoke:secrets` passed with no API-key shaped values in source/docs/scripts | Pass |

## Latest Verification Commands

Passing:

```powershell
npm run lint
npm run test
npm run build
npm run tauri:build
npm run smoke:phase1
npm run smoke:phase2
npm run smoke:phase2:native
npm run smoke:secrets
npm run smoke:shortcut
npm run smoke:style-controls
npm run smoke:voice-behavior
npm run smoke:voice-fallback
npm run smoke:voice-health
npm run smoke:live-providers
npm run voxcpm:check-prereqs
C:\Users\vikasmit\.cargo\bin\cargo.exe test
```

One-command audit:

```powershell
npm run audit:goal
```

Observed audit result:

```txt
PASS             Type/lint
PASS             Unit tests
PASS             Web + Worker build
PASS             Phase 1 shell smoke
PASS             Phase 2 browser smoke
PASS             Phase 2 native overlay smoke
PASS             Source secret scan
PASS             Shortcut smoke
PASS             Style controls smoke
PASS             Voice waveform behavior smoke
PASS             Live voice fallback smoke
PASS             ElevenLabs voice health
PASS             Native screenshot Rust test
PASS             Live providers
AUDIT RESULT: COMPLETE.
```

Observed live provider result:

```txt
OpenCode/Kimi smoke passed: Clicky live OpenCode path is working.
Live provider smoke passed. TTS bytes: 24285. Audio: docs/live-tts-smoke.mp3. STT: Clicky live voice test.. Chat: Clicky live OpenCode path is working.
```

## Completion Gate

This goal can be treated as complete for the current MVP scope because:

1. ElevenLabs hosted TTS and STT now pass.
2. OpenCode/Kimi passes through the Worker.
3. Native overlay following, native screenshot capture, shortcut behavior, visual style controls, waveform gating, and source secret scan all pass.
4. The release executable was rebuilt at `apps/clicky-windows/src-tauri/target/release/clicky-windows.exe`.
