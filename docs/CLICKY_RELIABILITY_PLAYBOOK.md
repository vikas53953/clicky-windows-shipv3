# Clicky Reliability Playbook

Date: 2026-05-14

## Current Diagnosis

Clicky was failing because the pipeline allowed weak assumptions at several boundaries:

1. WebView speech recognition was treated as final even when ElevenLabs STT was available.
2. Text-only models such as MiniMax M2.7 could receive screenshot image payloads, causing provider errors.
3. Internet tooling handled weather but did not have a robust fallback for news/current-search questions.
4. A new user turn could start while stale streamed answer or audio from the previous turn still updated the UI.
5. QA was too narrow. It checked individual endpoints but not complete product scenarios.

## Reliability Contract

Clicky must pass these contracts before being presented as working:

- Voice contract: live audio must prefer provider STT for the final transcript. WebView STT is only a fast hint.
- Turn contract: starting a new question cancels old chat, old TTS, and old audio.
- Model contract: screenshots are sent only to vision-capable model routes. Text-only models get text/tool context only and must not crash with image-input errors.
- Internet contract: weather, explicit URL fetches, and current/search-style prompts must return grounded tool context or a clear "not found" answer.
- UI contract: errors must be actionable and must not expose raw provider stack traces or confusing JSON blobs.
- Security contract: no secrets in source, docs, logs, or built assets.

## QA Matrix

| Area | Scenario | Expected |
| --- | --- | --- |
| Voice/STT | Speak "weather of Delhi" | Final transcript uses ElevenLabs when audio exists |
| Weather tool | "weather of Delhi" | Current Delhi weather |
| Weather tool | "Ramya in Punjab and Delhi in India weather" | Delhi answered, unknown place clearly marked |
| News/search | "latest news about Prime Minister Modi" | Search context returned, no fake certainty |
| Screen/model | Ask screen question while using MiniMax M2.7 | No image-input provider error |
| Turn lifecycle | Start a new question while old TTS is speaking | Old audio stops and old chunks cannot update UI |
| TTS | Live voice test | Audio bytes returned and playable |
| UX | Main controls | Buttons are wired, no dead buttons |
| Security | Secret scan | No API-key shaped values in tracked source/docs/scripts |

## Known Product Boundary

MiniMax M2.7 through OpenCode Zen is a text-input route. It is fast and useful for text/tool answers, but it is not the right route for raw screenshots. Until a vision-capable provider is configured, Clicky should avoid sending images to MiniMax and should explain that screen vision is limited instead of crashing.

## Current Verification Snapshot

Latest full QA report: `docs/CLICKY_QA_REPORT_2026-05-14.md`.

Fresh checks passed on 2026-05-14:

- `npm run test`: app 32 tests and Worker 21 tests passed.
- `npm run audit:goal`: SHIPv3 audit complete.
- `npm run smoke:product-flow`: live Worker health, weather, search, direct weather, and MiniMax screenshot fallback passed with retry handling for transient public weather API errors.
- `npm run smoke:phase2b-latency`: first token 1758ms, first audio 2760ms.
- `npm run tauri:build`: release exe built successfully.
