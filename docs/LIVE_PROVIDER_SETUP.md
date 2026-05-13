# Live Provider Setup

Use this when you are ready to spend real provider credits.

## Boundary

Do not paste API keys into chat. Do not put keys in the desktop app. Put keys only into Worker secrets or a local `worker/.dev.vars` file that is not committed.

OpenAI OAuth from Codex/ChatGPT cannot be reused by Clicky. Clicky now uses OpenCode by default, so the Worker needs an `OPENCODE_API_KEY`.

## Local Fast Test

Fastest path:

```powershell
npm run configure:live-providers
```

This prompts for the OpenCode API key, ElevenLabs API key, optional ElevenLabs voice ID, model, API mode, and base URL, then writes `worker/.dev.vars`. The file is gitignored.

Manual path: create `worker/.dev.vars` from `worker/.dev.vars.example` and replace only the placeholder values:

```txt
MOCK_MODE=false
LLM_PROVIDER=opencode
OPENCODE_MODEL=minimax-m2.7
OPENCODE_API_MODE=chat_completions
OPENCODE_BASE_URL=https://opencode.ai/zen/v1
OPENCODE_API_KEY=<paste locally>
ELEVENLABS_API_KEY=<paste locally>
ELEVENLABS_VOICE_ID=<optional>
```

Then run:

```powershell
npm run worker:dev
npm run smoke:voice-health
npm run smoke:live-providers
```

The live smoke:

- Checks Worker is in live mode.
- Checks ElevenLabs voice health with a tiny deep TTS probe.
- Calls OpenCode/Kimi through `/chat` first.
- Lists ElevenLabs voices.
- Generates one short MP3: `docs/live-tts-smoke.mp3`.
- Sends that MP3 back through ElevenLabs STT.
- Does not print or store secrets.

## ElevenLabs `detected_unusual_activity`

If the smoke prints:

```txt
OpenCode/Kimi smoke passed: Clicky live OpenCode path is working.
ElevenLabs TTS failed with HTTP 401: ElevenLabs blocked this key/account (detected_unusual_activity).
```

Clicky code and the Worker route are reaching ElevenLabs, but ElevenLabs is rejecting the current account/key. In that state:

- Kimi/OpenCode is live.
- The native app can launch.
- Mock mode and UI QA can run.
- ElevenLabs TTS and STT will not work until the ElevenLabs account/key is usable.

Fix:

1. Renew or replace the ElevenLabs key/subscription.
2. Run `npm run configure:live-providers` and enter the new key locally.
3. Run `npm run smoke:voice-health`.
4. Run `npm run smoke:live-providers`.
5. Only after both smokes pass, run `npm run run:live-clicky` for a full voice loop.

Do not work around this by placing keys in the desktop app. Keep provider keys in `worker/.dev.vars` locally or Cloudflare Worker secrets.

## Cloudflare Secret Commands

For deployed Worker mode:

```powershell
npx wrangler secret put OPENCODE_API_KEY --config worker/wrangler.toml
npx wrangler secret put ELEVENLABS_API_KEY --config worker/wrangler.toml
npx wrangler secret put ELEVENLABS_VOICE_ID --config worker/wrangler.toml
```

If `ELEVENLABS_VOICE_ID` is omitted locally, the Worker will try to use the first available voice from `/v1/voices`.

## OpenCode Endpoints

Default Kimi setup:

```txt
OPENCODE_API_MODE=chat_completions
OPENCODE_BASE_URL=https://opencode.ai/zen/v1
OPENCODE_MODEL=minimax-m2.7
```

GPT-style setup:

```txt
OPENCODE_API_MODE=responses
OPENCODE_BASE_URL=https://opencode.ai/zen/v1
OPENCODE_MODEL=gpt-5.4-mini
```
