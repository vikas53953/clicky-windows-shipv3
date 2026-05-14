import type { WorkerEnv } from "../types";
import { json } from "../utils/http";
import { parseProviderError } from "../utils/text";
import { firstElevenLabsVoiceId } from "./tts";

export async function voiceHealth(request: Request, env: WorkerEnv, cors: HeadersInit, isMock: boolean): Promise<Response> {
  const deep = new URL(request.url).searchParams.get("deep") === "true";

  if (isMock) {
    return json(
      {
        ok: true,
        mode: "mock",
        provider: "mock",
        status: "configured",
        tts: true,
        stt: true,
        message: "Mock voice path is available."
      },
      200,
      cors
    );
  }

  if (!env.ELEVENLABS_API_KEY) {
    return json(
      {
        ok: false,
        mode: "live",
        provider: "elevenlabs",
        status: "not_configured",
        tts: false,
        stt: false,
        message: "ElevenLabs is not configured."
      },
      200,
      cors
    );
  }

  const upstream = await fetch("https://api.elevenlabs.io/v1/voices", {
    method: "GET",
    headers: {
      "xi-api-key": env.ELEVENLABS_API_KEY
    }
  });

  if (!upstream.ok) {
    const detail = parseProviderError(await upstream.text());
    return json(
      {
        ok: false,
        mode: "live",
        provider: "elevenlabs",
        status: detail.status || `http_${upstream.status}`,
        tts: false,
        stt: false,
        message: detail.status === "detected_unusual_activity" ? "ElevenLabs blocked this key/account." : detail.message || "ElevenLabs voice check failed."
      },
      200,
      cors
    );
  }

  const summary = json(
    {
      ok: true,
      mode: "live",
      provider: "elevenlabs",
      status: "voices_reachable",
      tts: "not_tested",
      stt: "not_tested",
      voiceIdConfigured: Boolean(env.ELEVENLABS_VOICE_ID?.trim()),
      sttModel: env.ELEVENLABS_STT_MODEL_ID || "scribe_v1",
      message: "ElevenLabs voices endpoint is reachable."
    },
    200,
    cors
  );

  if (!deep) {
    return summary;
  }

  const resolvedVoiceId = env.ELEVENLABS_VOICE_ID || (await firstElevenLabsVoiceId(env));
  if (!resolvedVoiceId) {
    return json(
      {
        ok: false,
        mode: "live",
        provider: "elevenlabs",
        status: "voice_not_configured",
        tts: false,
        stt: "not_tested",
        message: "ElevenLabs voice is not configured."
      },
      200,
      cors
    );
  }

  const voiceId = encodeURIComponent(resolvedVoiceId);
  const ttsProbe = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "xi-api-key": env.ELEVENLABS_API_KEY
    },
    body: JSON.stringify({
      text: "Hi.",
      model_id: "eleven_multilingual_v2"
    })
  });

  if (!ttsProbe.ok) {
    const detail = parseProviderError(await ttsProbe.text());
    return json(
      {
        ok: false,
        mode: "live",
        provider: "elevenlabs",
        status: detail.status || `http_${ttsProbe.status}`,
        tts: false,
        stt: "not_tested",
        message: detail.status === "detected_unusual_activity" ? "ElevenLabs blocked this key/account." : detail.message || "ElevenLabs TTS probe failed."
      },
      200,
      cors
    );
  }

  return json(
    {
      ok: true,
      mode: "live",
      provider: "elevenlabs",
      status: "tts_reachable",
      tts: true,
      stt: "not_tested",
      voiceIdConfigured: Boolean(env.ELEVENLABS_VOICE_ID?.trim()),
      sttModel: env.ELEVENLABS_STT_MODEL_ID || "scribe_v1",
      message: "ElevenLabs TTS probe passed."
    },
    200,
    cors
  );
}
