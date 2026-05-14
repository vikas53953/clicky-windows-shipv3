import type { WorkerEnv } from "../types";
import { json } from "../utils/http";

export async function tts(request: Request, env: WorkerEnv, cors: HeadersInit, isMock: boolean): Promise<Response> {
  const body = (await request.json()) as { text?: string; voiceId?: string; modelId?: string };

  if (isMock) {
    return json({ ok: true, message: "Mock TTS skipped.", textLength: body.text?.length ?? 0 }, 200, cors);
  }

  if (!env.ELEVENLABS_API_KEY) {
    return json({ error: "ElevenLabs is not configured." }, 503, cors);
  }

  const resolvedVoiceId = body.voiceId || env.ELEVENLABS_VOICE_ID || (await firstElevenLabsVoiceId(env));
  if (!resolvedVoiceId) {
    return json({ error: "ElevenLabs voice is not configured." }, 503, cors);
  }

  const voiceId = encodeURIComponent(resolvedVoiceId);
  const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "xi-api-key": env.ELEVENLABS_API_KEY
    },
    body: JSON.stringify({
      text: body.text || "",
      model_id: body.modelId || "eleven_multilingual_v2"
    })
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...cors,
      "content-type": upstream.headers.get("content-type") || "audio/mpeg"
    }
  });
}

export async function voices(env: WorkerEnv, cors: HeadersInit, isMock: boolean): Promise<Response> {
  if (isMock) {
    return json({ voices: [{ voiceId: "mock-voice", name: "Mock Voice" }] }, 200, cors);
  }

  if (!env.ELEVENLABS_API_KEY) {
    return json({ error: "ElevenLabs is not configured." }, 503, cors);
  }

  const upstream = await fetch("https://api.elevenlabs.io/v1/voices", {
    method: "GET",
    headers: {
      "xi-api-key": env.ELEVENLABS_API_KEY
    }
  });

  if (!upstream.ok) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...cors,
        "content-type": upstream.headers.get("content-type") || "application/json"
      }
    });
  }

  const payload = (await upstream.json()) as { voices?: Array<{ voice_id?: string; name?: string; category?: string }> };
  return json(
    {
      voices: (payload.voices || []).map((voice) => ({
        voiceId: voice.voice_id,
        name: voice.name,
        category: voice.category
      }))
    },
    200,
    cors
  );
}

export async function firstElevenLabsVoiceId(env: WorkerEnv): Promise<string | null> {
  if (!env.ELEVENLABS_API_KEY) return null;

  const upstream = await fetch("https://api.elevenlabs.io/v1/voices", {
    method: "GET",
    headers: {
      "xi-api-key": env.ELEVENLABS_API_KEY
    }
  });

  if (!upstream.ok) return null;

  const payload = (await upstream.json()) as { voices?: Array<{ voice_id?: string }> };
  return payload.voices?.find((voice) => voice.voice_id)?.voice_id || null;
}
