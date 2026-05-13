# Clicky QA Report - 2026-05-14

## Root Causes Found

1. Live audio could use WebView speech recognition as the final transcript even when provider STT was available. That made spoken prompts look correct in the UI sometimes, but the final request could still be weak or truncated.
2. OpenCode MiniMax M2.7 is a text/tool route in this setup. Clicky was sending screenshot image payloads to it, which caused the provider error: `model does not support image inputs`.
3. Internet search had a shallow fallback. Weather worked, but current/news prompts could return no context because DuckDuckGo Instant Answer is often empty.
4. Product QA was missing a single runtime smoke that exercised health, weather, search, quick answer, and the MiniMax plus screenshot failure path together.

## Fixes Made

- The app now prefers ElevenLabs STT as the final transcript whenever live audio exists. WebView recognition remains a fast UI hint only.
- The Worker now strips image payloads for text-only OpenCode models, using the resolved Worker model as well as the request model.
- The OpenCode responses route and chat-completions route both enforce the same screenshot capability guard.
- The Worker now adds a Google News RSS fallback after DuckDuckGo Instant Answer and DuckDuckGo HTML search fail.
- Added `npm run smoke:product-flow` to test the real runtime product path.
- Added regression tests for provider STT selection, text-only model screenshot stripping, resolved-model screenshot stripping, OpenCode responses screenshot stripping, search fallback, and multi-location weather handling.

## Verification Evidence

All commands below were run from `C:\Users\vikasmit\Downloads\vikas work\clicky`.

| Command | Result |
| --- | --- |
| `npm run test` | PASS: app 32 tests, Worker 21 tests |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run tauri:build` | PASS, built `apps/clicky-windows/src-tauri/target/release/clicky-windows.exe` |
| `npm run smoke:secrets` | PASS, no API-key shaped values in source/docs/scripts |
| `npm run smoke:internet-tools` | PASS, live Delhi weather returned |
| `npm run smoke:voice-health` | PASS, ElevenLabs TTS reachable |
| `npm run smoke:live-providers` | PASS, OpenCode/MiniMax chat, ElevenLabs TTS, and ElevenLabs STT passed |
| `npm run smoke:phase2b-latency` | PASS, first token 1758ms, first audio 2760ms |
| `npm run smoke:product-flow` | PASS, live health, weather, news search, direct weather answer, and MiniMax screenshot fallback |
| `npm run smoke:phase1` | PASS |
| `npm run smoke:phase2` | PASS |
| `npm run smoke:shortcut` | PASS |
| `npm run smoke:style-controls` | PASS |
| `npm run smoke:voice-behavior` | PASS, waveforms are not always visible |
| `npm run smoke:voice-fallback` | PASS |
| `npm run smoke:phase2:native` | PASS, native overlay moved with cursor |
| `npm run audit:goal` | PASS: COMPLETE |

## Runtime Smoke Highlights

- Product flow: `health=live; weather=Delhi ok; search=ok; direct_weather=1278ms first chunk; screen_text_model=6403ms first chunk`.
- Latency: `minimax-m2.7 first token 1758ms, first sentence 1758ms, first audio 2760ms`.
- Live providers: OpenCode/MiniMax chat passed, ElevenLabs TTS returned audio bytes, ElevenLabs STT transcribed the generated voice sample.

One final product-flow rerun hit a transient public weather upstream `HTTP 502`; the smoke now retries tool calls before failing so flaky external APIs do not look like Clicky logic bugs.

## Current Honest Product Boundary

Clicky is now wired and testable for live voice, live TTS, live weather/search tools, the native overlay, cursor following, and text/tool LLM answers.

MiniMax M2.7 in the current OpenCode route should not be treated as screen vision. It will no longer crash when screenshots are present, but it cannot inspect raw screenshots. For the full Hey Clicky behavior of actually seeing and pointing at arbitrary visible UI, the next architecture step is one of:

- add a vision-capable model route for screenshot prompts, or
- add local OCR/UI parsing and send extracted screen text/layout to MiniMax.

## App State

- Worker was restarted in live mode on `http://127.0.0.1:8789`.
- Release exe was rebuilt and relaunched from `apps/clicky-windows/src-tauri/target/release/clicky-windows.exe`.
