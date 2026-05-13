# Test Log

## 2026-05-11

### Toolchain

- `node --version`: `v24.11.0`
- `npm --version`: `11.6.1`
- Initial `rustc --version`: command not found
- Initial `cargo --version`: command not found
- After Rustup install: `rustc 1.95.0 (59807616e 2026-04-14)`
- After Rustup install: `cargo 1.95.0 (f2d3ce0bd 2026-03-21)`
- Active toolchain: `stable-x86_64-pc-windows-msvc (default)`
- Added `scripts/run-tauri.mjs` so npm Tauri scripts prepend `%USERPROFILE%\.cargo\bin` automatically in stale shells.

### Install

- `npm install`: PASS, 0 vulnerabilities in install output.

### Red Test

- `npm test`: FAIL before implementation.
- Expected failure: missing `./pointTags` and `./clickySession` modules.

### Unit Tests

- `npm test`: PASS.
- App: 2 test files, 5 tests passed.
- Worker: 1 test file, 3 tests passed.

### Typecheck And Build

- `npm run typecheck`: PASS.
- `npm run lint`: PASS. Current lint script is TypeScript strict checking.
- `npm run build`: PASS.
- `npm run audit:prod`: PASS, 0 vulnerabilities.

### Browser Smoke

- Browser plugin local navigation tool was not exposed, so Playwright/Chromium fallback was used.
- `npm run smoke:phase1`: PASS.
- Desktop screenshot: `docs/phase1-smoke.png`.
- Mobile screenshot: `docs/phase1-smoke-mobile.png`.
- Mobile overflow at 390px: `0`.

### Worker Local

- `npm run worker:dev`: PASS after switching Worker dev port to 8789.
- Wrangler config uses `compatibility_date = "2026-05-10"` because Wrangler rejected `2026-05-11` as future/unsupported.
- `GET http://127.0.0.1:8789/health`: PASS with `{"ok":true,"mode":"mock","message":"Clicky Worker reachable."}`.
- `POST http://127.0.0.1:8789/chat`: PASS with mock SSE chunks and point tag.

### Security Grep

- `rg -n "API_KEY|sk-|OPENAI|ANTHROPIC|ASSEMBLYAI|ELEVENLABS" apps\clicky-windows\src apps\clicky-windows\dist`: CLEAN.

### Native Tauri

- Initial `npm run tauri:build`: FAIL because Cargo was not on PATH.
- After Rustup install, next scaffold issue: Cargo manifest declared a missing library target.
- Fixed `apps/clicky-windows/src-tauri/Cargo.toml`.
- Next issue: Tauri required `icons/icon.ico`.
- Generated `apps/clicky-windows/src-tauri/icons/icon.ico`.
- Final `npm run tauri:build`: PASS.
- Built executable: `apps/clicky-windows/src-tauri/target/release/clicky-windows.exe`.

### Phase 1 QA Pass

- Browser plugin smoke: PASS.
- Browser plugin proof: URL `http://127.0.0.1:5174/`, title `Clicky Windows`, app content present, Worker button works, mock talk flow reaches final response, raw point tags hidden, 0 browser console warnings/errors.
- Playwright matrix: PASS.
- Desktop flow: listening state, Worker mock status, final pointing state, Clicky buddy visible, raw point tags hidden.
- Controls: Show Clicky hides/re-shows buddy, Clear conversation resets transcript/response.
- Mobile viewport: 390x844, horizontal overflow `0`.
- Worker endpoints: `/health`, `/chat`, `/tts`, `/transcribe-token` PASS in mock mode.
- Native executable launch: PASS. `clicky-windows.exe` stayed running after 8 seconds and was then stopped by the test.

### Phase 2 Native Shell QA

- `npm run typecheck -w apps/clicky-windows`: PASS.
- `npm test -w apps/clicky-windows`: PASS, 3 test files and 7 tests.
- `npm run build -w apps/clicky-windows`: PASS.
- `npm run typecheck -w worker`: PASS.
- `npm test -w worker`: PASS, 1 test file and 3 tests.
- `npm run tauri:build`: PASS.
- Built executable: `apps/clicky-windows/src-tauri/target/release/clicky-windows.exe`.
- `npm run smoke:phase2`: PASS.
- Browser smoke verified Phase 2 label, Worker mock, fake-device microphone permission flow, mock push-to-talk, hidden raw point tags, and no horizontal overflow.
- Browser smoke screenshot: `docs/phase2-browser-smoke.png`.
- `npm run smoke:phase2:native`: PASS.
- Native smoke launched the release `.exe`, verified the overlay window followed cursor movement from `664,444` to `1024,644`, captured the desktop, and stopped only the launched test process.
- Native smoke screenshot: `docs/phase2-native-smoke.png`.
- Root `npm run lint`: PASS.
- Root `npm run test`: PASS, 4 total test files and 10 total tests.
- Root `npm run build`: PASS.
- `npm run audit:prod`: PASS, 0 vulnerabilities.
- Secret assignment grep for provider API keys: CLEAN.
- Long `sk-*` token grep: CLEAN.

### Live Provider Wiring

- Added OpenAI live chat path through Worker `/chat` using the Responses API.
- Added Worker `LLM_PROVIDER=openai` and `OPENAI_MODEL` support.
- Added OpenCode live chat path through Worker `/chat`.
- Default live LLM provider config is now `LLM_PROVIDER=opencode`.
- Default OpenCode setup is now MiniMax M2.7: `OPENCODE_API_MODE=chat_completions`, `OPENCODE_BASE_URL=https://opencode.ai/zen/v1`, and `OPENCODE_MODEL=minimax-m2.7`.
- OpenCode GPT-style setup remains supported with `OPENCODE_API_MODE=responses`, `OPENCODE_BASE_URL=https://opencode.ai/zen/v1`, and a GPT model such as `gpt-5.4-mini`.
- Added ElevenLabs `/voices` route for voice discovery without exposing `ELEVENLABS_API_KEY`.
- Added `npm run smoke:live-providers` for one short OpenCode request plus one short ElevenLabs TTS request.
- Added `npm run configure:live-providers` to prompt locally for keys and write gitignored `worker/.dev.vars`.
- `npm run typecheck -w worker`: PASS after live provider wiring.
- `npm test -w worker`: PASS, 1 test file and 5 tests.
- Root `npm run lint`: PASS after live provider wiring.
- Root `npm run test`: PASS, 4 test files and 12 total tests.
- Root `npm run build`: PASS after live provider wiring.
- `npm run audit:prod`: PASS, 0 vulnerabilities.
- Long `sk-*` token grep: CLEAN.
- `node --check scripts/smoke-live-providers.mjs`: PASS.
- `scripts/configure-live-providers.ps1` parse check: PASS.
- After OpenCode switch, `npm run typecheck -w worker`: PASS.
- After OpenCode switch, `npm test -w worker`: PASS, 1 test file and 6 tests.
- After OpenCode switch, root `npm run lint`: PASS.
- After OpenCode switch, root `npm run test`: PASS, 4 test files and 13 total tests.
- After OpenCode switch, root `npm run build`: PASS.
- After OpenCode switch, `npm run audit:prod`: PASS, 0 vulnerabilities.
- After OpenCode switch, repo scan for pasted OpenCode/ElevenLabs secret patterns: CLEAN.
- Live provider smoke was not run because keys are not available in the safe Worker secret path during this run; pasted chat secrets were not written into source/tool logs.

### Kimi Switch

- Switched default OpenCode model from GPT-style Responses mode to Kimi.
- New default: `OPENCODE_MODEL=minimax-m2.7`.
- New default API mode: `OPENCODE_API_MODE=chat_completions`.
- New default base URL: `OPENCODE_BASE_URL=https://opencode.ai/zen/v1`.
- `npm run typecheck -w worker`: PASS.
- `npm test -w worker`: PASS, 1 test file and 6 tests.
- Root `npm run lint`: PASS.
- Root `npm run test`: PASS, 4 test files and 13 total tests.
- Root `npm run build`: PASS.
- `worker/.dev.vars` was not present, so no local secret file needed migration.

### Live App Pipeline

- Added live frontend pipeline for explicit push-to-talk flow.
- Microphone path now records audio with `MediaRecorder`.
- Speech-to-text path uses browser/WebView speech recognition when available, with an honest fallback transcript when unavailable.
- Screen path prompts for explicit screen capture with `getDisplayMedia`, resizes to JPEG, and sends the screenshot payload to the Worker request.
- Chat path streams Worker `/chat` chunks into the Clicky state machine.
- TTS path calls Worker `/tts` and plays the returned ElevenLabs audio blob when live mode is configured.
- Kimi caveat: OpenCode Go/Kimi is wired through chat-completions, so image understanding depends on provider/model support. The app captures screenshots, but Kimi may not use visual pixels the way a vision model would.
- `npm run typecheck -w apps/clicky-windows`: PASS.
- `npm test -w apps/clicky-windows`: PASS, 3 test files and 7 tests.
- `npm run typecheck -w worker`: PASS.
- `npm test -w worker`: PASS, 1 test file and 6 tests.
- Root `npm run build`: PASS.
- `npm run smoke:phase2`: PASS.
- `npm run tauri:build`: PASS.
- `npm run smoke:phase2:native`: PASS, overlay moved from `52,52` to `1024,644`.
- Root `npm run lint`: PASS.
- Root `npm run test`: PASS, 4 test files and 13 total tests.
- `npm run audit:prod`: PASS, 0 vulnerabilities.
- Secret scan for pasted key patterns: CLEAN.
- Live provider smoke was not run because secrets are not present in `worker/.dev.vars`; writing pasted chat keys into command/file logs was intentionally avoided.

### Visual Refinement And Live Runner

- Reduced the native follow-along Clicky overlay from a large bubble to a small idle companion.
- Idle overlay no longer shows the `Ready near your cursor` text bubble.
- Active text bubble still appears during listening, thinking, speaking, pointing, or error states.
- Added `npm run run:live-clicky` to prompt locally for live provider keys, start the Worker, run the Kimi plus ElevenLabs smoke, and launch the native executable.
- Worker live-runner logs now write to `docs/logs/live-worker.out.log` and `docs/logs/live-worker.err.log`.
- `node --check scripts/smoke-live-providers.mjs`: PASS.
- `scripts/configure-live-providers.ps1` parse check: PASS.
- `scripts/run-live-clicky-session.ps1` parse check: PASS.
- `npm run typecheck -w apps/clicky-windows`: PASS.
- `npm test -w apps/clicky-windows`: PASS, 3 test files and 7 tests.
- `npm run typecheck -w worker`: PASS.
- `npm test -w worker`: PASS, 1 test file and 6 tests.
- `npm run build`: PASS.
- `npm run tauri:build`: PASS.
- `npm run smoke:phase2:native`: PASS, overlay moved from `664,444` to `1024,644`.
- Visual proof screenshot: `docs/phase2-native-smoke.png`.
- Root `npm run lint`: PASS.
- Root `npm run test`: PASS, 4 test files and 13 total tests.
- `npm run audit:prod`: PASS, 0 vulnerabilities.
- Secret pattern scan found only the local prompt script variables and placeholder docs; no pasted provider secrets were found in source or build outputs.

### Live Runner Recovery And Real Provider Smoke

- First live runner attempt correctly wrote `worker/.dev.vars`, but stopped because port `8789` still had an old mock `workerd.exe` listener.
- Identified the listener as this repo's Cloudflare Worker process and stopped only that `workerd.exe` PID.
- Updated `npm run run:live-clicky` so it reuses existing local secrets without printing values.
- Updated the live runner to open the main Clicky window for live testing.
- Added native `CLICKY_LIVE_SESSION=1` launch detection so the app turns Mock mode off without relying on browser-side CORS health detection.
- Real live smoke passed against local Worker live mode: OpenCode Kimi chat returned `Clicky live OpenCode path is working.`
- Real ElevenLabs smoke passed and wrote `docs/live-tts-smoke.mp3` with non-empty audio bytes.
- Final visual proof screenshot: `docs/live-clicky-final.png`.
- Final visible state: main Clicky window open, Worker card says live runner launched it, and `Mock mode` is not active.
- `npm run tauri:build`: PASS after live-runner/native flag changes.
- Final `npm run lint`: PASS.
- Final `npm run test`: PASS, 4 test files and 13 total tests.

### Talk Toggle And Ready-Listening Fix

- Changed the main talk button from mouse hold/release to a click toggle: `Talk` starts listening, `Send` stops and submits.
- Changed native `Ctrl+Alt+Space` from hold/release to a toggle so one press starts listening and the next press sends.
- Kept idle as a safe ready-listening visual state: Clicky shows a small mic follower and `Ready to listen`, but does not passively record until explicit button/shortcut action.
- Updated the browser smoke to use `?mock=true` so it stays deterministic even when the local Worker is already running in live mode.
- `npm run typecheck -w apps/clicky-windows`: PASS.
- `npm test -w apps/clicky-windows`: PASS, 3 test files and 7 tests.
- `npm run smoke:phase2`: PASS after updating the smoke from mouse hold/release to click toggle.
- Root `npm run lint`: PASS.
- Root `npm run test`: PASS, 4 test files and 13 total tests.
- Root `npm run build`: PASS.
- `npm run tauri:build`: PASS.
- `npm run smoke:phase2:native`: PASS, overlay moved from `664,444` to `1024,644`.
- `npm run run:live-clicky`: PASS, reused live Worker secrets, live Worker mode confirmed, Kimi smoke passed, ElevenLabs smoke passed, and relaunched Clicky.
- `npm run audit:prod`: PASS, 0 vulnerabilities.

### HeyClicky-Style Visual And Voice Meter Pass

- Reworked the cursor-following buddy from a large rounded square into a tiny HeyClicky-style companion mark.
- Default avatar now uses the same small triangular cursor shape seen on `heyclicky.com`, with a blue glow.
- Added Clicky color swatches and avatar choices: Classic, Dot, and Spark.
- Added animated waveform bars for listening/ready states.
- Added live microphone level metering from the active audio stream so the waveform reacts while recording.
- Persisted non-secret UI settings locally: Worker URL, model/provider, voice, shortcut label, visibility, mock mode, accent color, and avatar.
- Extended the native overlay state payload with `accentColor`, `avatar`, and `voiceLevel`.
- Updated the live runner so a live provider preflight warning does not prevent the native app from launching.
- Updated `smoke:phase1` for the current Talk/Send toggle and deterministic `?mock=true` flow.
- Browser visual QA via in-app browser: PASS, no console errors, style controls rendered, Rose/Spark selection worked, Mock mode toggled, Talk -> Send mock flow completed, and raw `[POINT:...]` tags stayed hidden.
- Reference screenshot checked: `C:\Users\vikasmit\AppData\Local\Temp\clicky-qa\heyclicky-reference.png`.
- Rendered screenshots checked:
  - `C:\Users\vikasmit\AppData\Local\Temp\clicky-qa\clicky-render-listening.png`
  - `C:\Users\vikasmit\AppData\Local\Temp\clicky-qa\clicky-render-after-mock.png`
  - `C:\Users\vikasmit\AppData\Local\Temp\clicky-qa\clicky-mobile.png`
- `npm run typecheck -w apps/clicky-windows`: PASS.
- `npm run typecheck -w worker`: PASS.
- Root `npm run test`: PASS, 4 test files and 15 total tests.
- Root `npm run lint`: PASS.
- `npm run audit:prod`: PASS, 0 vulnerabilities.
- `npm run tauri:build`: PASS after stopping the previously running release executable that had locked the `.exe` file.
- `npm run smoke:phase2`: PASS.
- `npm run smoke:phase1`: PASS after updating the smoke script.
- `npm run smoke:phase2:native`: PASS, release `.exe` launched and overlay moved from `664,444` to `1024,644`.
- Rust native screen capture smoke: PASS, `cargo test --manifest-path apps/clicky-windows/src-tauri/Cargo.toml capture_screens_returns_jpeg_payload_without_browser_picker -- --nocapture`, 1 test passed and returned JPEG screen payloads.
- Final post-Rust-test `npm run test`: PASS, 4 test files and 15 total tests.
- Final `npm run tauri:build`: PASS.
- Final `npm run smoke:phase1`: PASS.
- Final `npm run smoke:phase2`: PASS.
- Final `npm run smoke:phase2:native`: PASS.
- Live Worker health: PASS, `{"ok":true,"mode":"live","message":"Clicky Worker reachable."}`.
- Live OpenCode/Kimi route: PASS, local Worker `/chat` streamed `Clicky Kimi route works.`
- Live ElevenLabs recheck: BLOCKED by provider account/API response `401 detected_unusual_activity`; both `/tts` and `/transcribe` are currently blocked by ElevenLabs for the configured key. This is an external provider/account state, not a source-code secret or routing failure.
- `npm run run:live-clicky`: PASS as launcher. It starts/reuses live Worker mode and launches `clicky-windows.exe`, but reports the ElevenLabs provider preflight warning until the key/account is usable again.

### Live Provider Error Clarity

- Reordered `npm run smoke:live-providers` so it proves OpenCode/Kimi before attempting ElevenLabs.
- Added concise ElevenLabs unusual-activity formatting in the desktop app and live smoke script.
- Added app unit coverage for the ElevenLabs `detected_unusual_activity` message so the UI does not dump the full provider wall of text.
- `npm run typecheck -w apps/clicky-windows`: PASS.
- `npm test -w apps/clicky-windows`: PASS, 4 test files and 8 tests.
- `node --check scripts/smoke-live-providers.mjs`: PASS.
- `npm run smoke:live-providers`: PARTIAL/BLOCKED as expected. OpenCode/Kimi passed first, then ElevenLabs TTS returned `401 detected_unusual_activity`.
- Final root `npm run lint`: PASS.
- Final root `npm run test`: PASS, 5 test files and 16 tests.
- Final root `npm run build`: PASS.
- Final `npm run audit:prod`: PASS, 0 vulnerabilities.
- Final `npm run tauri:build`: PASS.
- Final `npm run smoke:phase1`: PASS.
- Final `npm run smoke:phase2`: PASS.
- Final `npm run smoke:phase2:native`: PASS.

### Test Voice Control

- Added a `Test Voice` button beside Test Worker and Test Mic.
- In live mode, it calls Worker-routed TTS with a short sample and plays the returned audio.
- In mock mode, it stays local and does not touch ElevenLabs.
- Browser rendered QA: PASS. `Test Voice` was visible, mock mode showed `Voice test passed in mock mode.`, and no ElevenLabs block appeared.
- `npm run typecheck -w apps/clicky-windows`: PASS.
- `npm test -w apps/clicky-windows`: PASS, 4 test files and 9 tests.
- Final root `npm run lint`: PASS.
- Final root `npm run test`: PASS, 5 test files and 17 tests.
- Final root `npm run build`: PASS.
- Final `npm run audit:prod`: PASS, 0 vulnerabilities.
- Final `npm run tauri:build`: PASS.
- Final `npm run smoke:phase1`: PASS.
- Final `npm run smoke:phase2`: PASS.
- Final `npm run smoke:phase2:native`: PASS.
