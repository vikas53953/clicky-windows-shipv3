# ElevenLabs Recovery Runbook

## Current Blocker

Clicky is locally ready, but the configured ElevenLabs key/account is blocked by ElevenLabs.

Current live diagnostic:

```json
{
  "ok": false,
  "mode": "live",
  "provider": "elevenlabs",
  "status": "detected_unusual_activity",
  "tts": false,
  "stt": "not_tested",
  "message": "ElevenLabs blocked this key/account."
}
```

This means the app can reach the Worker and ElevenLabs, but ElevenLabs refuses TTS for this account/key. OpenCode/Kimi is already working.

## Safe Recovery Steps

Run this from the repo root:

```powershell
npm run configure:live-providers
```

Paste a renewed or replacement ElevenLabs API key when prompted. The script writes only to:

```txt
worker/.dev.vars
```

That file is local and gitignored.

Restart the Worker so it reloads `worker/.dev.vars`:

```powershell
npm run run:live-clicky
```

Then verify:

```powershell
npm run smoke:voice-health
npm run smoke:live-providers
npm run audit:goal
```

## Passing Output

`npm run smoke:voice-health` should print an object with:

```json
{
  "ok": true,
  "provider": "elevenlabs",
  "status": "tts_reachable",
  "tts": true
}
```

`npm run smoke:live-providers` should complete without `detected_unusual_activity` and should verify:

```txt
OpenCode/Kimi smoke passed
Live provider smoke passed
```

`npm run audit:goal` should no longer show:

```txt
BLOCKED_EXTERNAL ElevenLabs voice health
BLOCKED_EXTERNAL Live providers
```

## Temporary Fallback

Until ElevenLabs is recovered, Clicky keeps the text response visible and attempts local voice fallback:

1. VoxCPM on `http://127.0.0.1:8000/v1/audio/speech`.
2. Voicebox/Chatterbox on `http://127.0.0.1:17493`.
3. Windows local speech synthesis.

This fallback does not send screenshots, audio blobs, API keys, or auth headers to the local voice service. It sends only the assistant response text.

VoxCPM details live in `docs/VOXCPM_LOCAL_TTS.md`.
