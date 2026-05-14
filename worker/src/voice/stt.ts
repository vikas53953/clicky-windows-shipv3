import type { WorkerEnv } from "../types";
import { json } from "../utils/http";

export async function transcribeAudio(request: Request, env: WorkerEnv, cors: HeadersInit, isMock: boolean): Promise<Response> {
  if (isMock) {
    return json({ text: "Where should I click on this screen?", provider: "mock" }, 200, cors);
  }

  if (!env.ELEVENLABS_API_KEY) {
    return json({ error: "ElevenLabs speech-to-text is not configured." }, 503, cors);
  }

  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return json({ error: "Audio file is required." }, 400, cors);
  }

  const upstreamForm = new FormData();
  upstreamForm.append("file", audio, audio.name || "clicky-audio.webm");
  upstreamForm.append("model_id", env.ELEVENLABS_STT_MODEL_ID || "scribe_v1");

  const upstream = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: {
      "xi-api-key": env.ELEVENLABS_API_KEY
    },
    body: upstreamForm
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

  const payload = (await upstream.json()) as {
    text?: string;
    language_code?: string;
    language_probability?: number;
  };

  return json(
    {
      text: payload.text || "",
      languageCode: payload.language_code,
      languageProbability: payload.language_probability,
      provider: "elevenlabs"
    },
    200,
    cors
  );
}

export async function transcribeToken(env: WorkerEnv, cors: HeadersInit, isMock: boolean): Promise<Response> {
  if (isMock) {
    return json({ token: "mock-token", expires_in_seconds: 60 }, 200, cors);
  }

  if (!env.ASSEMBLYAI_API_KEY) {
    return json({ error: "AssemblyAI is not configured." }, 503, cors);
  }

  const upstream = await fetch(
    "https://streaming.assemblyai.com/v3/token?expires_in_seconds=60&max_session_duration_seconds=600",
    {
      method: "GET",
      headers: {
        Authorization: env.ASSEMBLYAI_API_KEY
      }
    }
  );

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...cors,
      "content-type": upstream.headers.get("content-type") || "application/json"
    }
  });
}
