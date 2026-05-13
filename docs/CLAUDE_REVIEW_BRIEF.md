# Claude Review Brief - Clicky Windows SHIPv3

## Review Goal

Please review this repository end to end as a Windows rebuild of Clicky, inspired by Farza's macOS Clicky product and the open-source reference repo:

- https://github.com/farzaa/clicky
- https://www.heyclicky.com/
- https://x.com/heyclicky
- Live reference observed on May 14, 2026: https://x.com/FarzaTV/status/2054638498062508442?s=20

This repo is not trying to compile the original Swift/AppKit code. It is a Windows-native rebuild inside a SHIPv3 workspace.

## Product Target

Clicky should feel like a tiny virtual mouse companion that follows the user's real cursor, listens when the user speaks, sees the current screen after explicit user action, reasons through tools and model calls, speaks back, and points at relevant UI elements.

The desired product is not a normal chat app or a large dashboard. The large window should eventually become only settings/debug. The main experience should be a small, cursor-adjacent Clicky avatar with listening waves, speech bubble, and pointing behavior.

## Current Architecture

- Workspace: npm workspaces.
- Desktop app: Tauri v2, React, TypeScript, Rust backend.
- UI app: `apps/clicky-windows`.
- Native backend: `apps/clicky-windows/src-tauri`.
- Proxy: Cloudflare Worker in `worker`.
- Current local app port: `127.0.0.1:5174`.
- Current local Worker port: `127.0.0.1:8789`.
- Live LLM route: OpenCode Zen, currently using `minimax-m2.7`.
- Live STT/TTS route: ElevenLabs through Worker only.
- No provider keys should exist in desktop source. Local live keys are expected only in `worker/.dev.vars`, which is gitignored.

## What Is Built So Far

- Tauri shell with tray and native overlay window.
- Native overlay follows the physical Windows cursor and is click-through.
- Small blue Clicky avatar variants and color controls.
- Control panel with worker URL, model, provider, shortcut, voice toggle, mock mode, debug mode, and style controls.
- Manual Talk flow.
- Global shortcut scaffold: `Ctrl+Alt+Space`, with fallback registration logic in native code.
- Microphone probe and recording path.
- Speech-energy waveform that should appear only when actual speech/audio energy is present.
- ElevenLabs STT path with WebView recognition as a fallback/hint.
- Worker-routed chat endpoint with OpenCode support.
- Worker-routed ElevenLabs TTS endpoint.
- Streaming response pipeline: model text starts rendering before full completion.
- Streaming voice pipeline: first sentence can be sent to TTS before full model completion.
- Basic internet tools in Worker for weather/search-style queries.
- Hidden point/tool tag parsing on the frontend.
- First safe desktop tool bridge: opt-in URL opening. No automatic click/type/clipboard tools yet.
- Mock mode for local UI flow without real API keys.
- Tests and smoke scripts for app, Worker, style controls, native overlay, secret scanning, product flow, and latency.

## Problems Encountered And How They Were Tackled

1. Native build blocked by missing Rust/Cargo.
   - Fixed by installing Rust toolchain and making Tauri npm scripts prepend `%USERPROFILE%\.cargo\bin`.

2. Worker kept running in mock mode on port `8789`.
   - Added run script checks that detect an existing stale Worker and tell the user to stop it before reloading live secrets.

3. Secrets risk from pasted provider keys.
   - Kept real keys in `worker/.dev.vars`.
   - Added secret scan script.
   - `.dev.vars`, `.env`, local logs, Worker cache, build target, generated media, and smoke screenshots are gitignored.

4. Push-to-talk was not enough for the intended product.
   - Added one-press talk flow: user talks and Clicky auto-sends after pause/silence.
   - Remaining gap: the real product should feel always ready/listening visually, without being always recording.

5. Waveforms were visually wrong.
   - Waveform rendering was changed to appear only during voice-active/listening states, not permanently beside the cursor.

6. User speech was being truncated.
   - Early builds trusted WebView recognition too quickly.
   - Later builds prefer provider STT when live audio exists and treat WebView recognition as fallback/hint only.
   - Remaining gap: more QA is needed across accents, pauses, and multi-sentence prompts.

7. Latency felt too slow.
   - Added timing instrumentation.
   - Added streamed response and first-sentence TTS so perceived latency improves.
   - Remaining gap: first spoken audio can still be several seconds depending on provider/model/TTS.

8. MiniMax/OpenCode rejected screenshot image input.
   - Added model capability guard so MiniMax text route does not send raw image payloads.
   - Remaining gap: this means Clicky is not truly seeing the screen through MiniMax. It needs either a vision-capable model route, OCR/UI extraction, or a hybrid screen-context strategy.

9. Weather and internet answers were unreliable.
   - Added basic Worker tools and smoke coverage.
   - Added retries/fallbacks for some public data fetches.
   - Remaining gap: this is not a real browser/computer-use system. It is a narrow Worker-side tool layer.

10. Current-time queries fail product expectations.
   - As shown in recent local testing, Clicky answered that it does not know current local time.
   - Remaining gap: add explicit local time/date/timezone tool context to every turn, or a Worker tool for time.

11. Visual/product feel is behind Farza's live demo.
   - Observed live X broadcast on May 14, 2026. The reference experience appears as a tiny cursor-adjacent blue companion over the user's active desktop/app.
   - Current build still has a large control-panel/debug surface as the dominant experience.
   - Remaining gap: make the overlay the product and demote the window to settings/debug.

12. Old Playground Clicky had useful general-agent ideas.
   - Imported the good parts cautiously: safer tool contract, hidden tool tags, and URL-open action.
   - Did not import broad click/type/computer-control yet because this needs a confirmation and safety model first.

## Known Current Gaps

- The product is still Phase 2/2b quality, not a polished Hey Clicky clone.
- The overlay exists but the large window still dominates the UX.
- No reliable full-screen vision path with the current MiniMax text model.
- No OCR/UI-tree extraction path yet.
- No true browser automation/computer-use tool loop in the shipped app.
- No safe confirmation UX for click/type/keyboard/clipboard actions.
- No robust current time/date/location tool.
- Internet tool support is narrow and API/scrape fallback based.
- Weather/search answers can still fail when upstream sources fail or model ignores tool output.
- The app needs stronger conversational turn isolation so old responses/audio never leak into a new user question.
- Needs much deeper QA around STT finalization, silence detection, cancellation, and interruption.
- Needs UI polish to match the tiny cursor buddy from the live Clicky reference.

## Specific Feedback Requested

Please review:

1. Whether the Tauri/React/Rust/Worker architecture is sound for a Windows Clicky clone.
2. Whether the state machine and session flow are robust enough for voice turns.
3. Whether the Worker API design is safe and maintainable.
4. Whether the current tool-calling approach should remain Worker-side, move local, or become hybrid.
5. How to implement browser/computer-use safely without creating a dangerous remote-control app.
6. Best strategy for screen understanding on Windows with OpenCode/MiniMax when raw image input is not supported.
7. How to prevent transcript truncation and stale response leakage.
8. How to reduce perceived voice latency further.
9. What tests are missing before calling this a serious MVP.
10. What UI changes are required to match Farza's tiny cursor-following Clicky experience.

## How To Run Locally

Install dependencies:

```powershell
npm install
```

Run frontend and Worker separately:

```powershell
npm run worker:dev
npm run dev
```

Run native Tauri dev app:

```powershell
npm run tauri:dev
```

Configure live providers locally without committing secrets:

```powershell
npm run configure:live-providers
```

Run the live local session helper:

```powershell
npm run run:live-clicky
```

Build packaged app:

```powershell
npm run tauri:build
```

## Verification Commands Used

```powershell
npm run test
npm run lint
npm run build
cargo test --manifest-path apps/clicky-windows/src-tauri/Cargo.toml
npm run smoke:style-controls
npm run smoke:phase2:native
npm run smoke:secrets
npm run smoke:product-flow
npm run tauri:build
```

## Review Posture

Please be strict. The goal is not to praise the scaffold. The goal is to identify the deeper architecture, product, safety, and QA gaps that are making this feel unlike the real Clicky.
