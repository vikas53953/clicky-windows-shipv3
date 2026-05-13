# Phase 2B QA Report

Date: 2026-05-13

## Scope

Phase 2B focuses on two upgrades before Phase 3 computer/browser control:

- Stream assistant speech sentence-by-sentence instead of waiting for the full LLM answer before starting ElevenLabs.
- Give Clicky limited internet context through the Worker, starting with weather, DuckDuckGo instant answers, and explicit URL fetches.

## What changed

- App speech streaming:
  - Added a sentence-level speech queue.
  - The first complete sentence is sent to `/tts` while the LLM is still streaming.
  - Hidden `[POINT:...]` tags and `<CLICKY_PLAN>` blocks are stripped before speech.
  - Timing now reports first voice request and first audio separately.

- Worker internet tools:
  - Added `POST /tools/resolve`.
  - Weather uses Open-Meteo geocoding plus current forecast.
  - Search uses DuckDuckGo Instant Answer API.
  - Direct URLs can be fetched and summarized as plain text.
  - `/chat` now pre-resolves internet context and appends it to the model prompt.

## Latency expectation

Before Phase 2B, Clicky waited for:

`LLM full response -> ElevenLabs TTS -> audio playback`

With Phase 2B, the path is:

`LLM first sentence -> ElevenLabs TTS for first sentence -> audio starts while later text is still streaming`

This does not make total playback shorter, but it should reduce perceived wait because Clicky can begin speaking after the first sentence is ready.

## Phase boundary

This is not Phase 3 computer use yet.

Clicky can now use internet context for answers, but it still does not click, type, browse interactively, or control Windows apps. Phase 3 should add explicit user-approved browser/computer actions with guardrails.
