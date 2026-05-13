# API Contract

## Worker Base URL

Local Phase 1:

```txt
http://127.0.0.1:8789
```

## GET /health

Returns Worker reachability and mode.

Response:

```json
{
  "ok": true,
  "mode": "mock",
  "message": "Clicky Worker reachable."
}
```

## POST /chat

Proxies OpenCode, Anthropic, or OpenAI in live mode and streams mock SSE in mock mode.

Request:

```json
{
  "provider": "opencode",
  "transcript": "Where do I click?",
  "model": "minimax-m2.7",
  "screenshots": []
}
```

Mock response:

```txt
data: {"type":"chunk","text":"I can guide you from the visible screen. "}
data: {"type":"chunk","text":"Click the highlighted Test Worker button next. [POINT:930,318:Test Worker:screen0]"}
data: [DONE]
```

Live provider references:

- Anthropic Messages API: `https://api.anthropic.com/v1/messages`
- OpenAI Responses API: `https://api.openai.com/v1/responses`
- OpenCode GPT Responses API: `https://opencode.ai/zen/v1/responses`
- OpenCode Zen chat-completions API: `https://opencode.ai/zen/v1/chat/completions`

## POST /tts

Proxies ElevenLabs text-to-speech in live mode and returns a mock JSON response in mock mode.

Request:

```json
{
  "text": "Open settings.",
  "voiceId": "worker-configured-voice"
}
```

Live provider reference: ElevenLabs documents `POST /v1/text-to-speech/:voice_id`.

## GET /voices

Lists ElevenLabs voices in live mode without exposing the API key. Returns a mock voice in mock mode.

Response:

```json
{
  "voices": [
    {
      "voiceId": "voice-id",
      "name": "Voice name",
      "category": "premade"
    }
  ]
}
```

## POST /transcribe-token

Returns an AssemblyAI temporary streaming token in live mode and a mock token in mock mode.

Mock response:

```json
{
  "token": "mock-token",
  "expires_in_seconds": 60
}
```

Live provider reference: AssemblyAI documents `GET https://streaming.assemblyai.com/v3/token`.
