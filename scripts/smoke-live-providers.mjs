import { writeFile } from "node:fs/promises";

const workerUrl = (process.env.CLICKY_WORKER_URL ?? "http://127.0.0.1:8789").replace(/\/$/, "");
const ttsOutputPath = process.env.CLICKY_TTS_OUTPUT ?? "docs/live-tts-smoke.mp3";
const voiceIdOverride = process.env.CLICKY_ELEVENLABS_VOICE_ID ?? "";
const llmLabel = process.env.CLICKY_LLM_LABEL ?? "OpenCode/MiniMax";

async function main() {
  const health = await getJson("/health");
  if (health.mode !== "live") {
    throw new Error(`Worker is in ${health.mode} mode. Set MOCK_MODE=false in the Worker environment before live provider smoke.`);
  }

  const chat = await post("/chat", {
    provider: "opencode",
    transcript: "Reply in one short sentence: Clicky live OpenCode MiniMax path is working.",
    screenshots: []
  });

  if (!chat.ok) {
    throw new Error(`OpenCode chat request failed with HTTP ${chat.status}: ${await chat.text()}`);
  }

  const chatText = await readClickySseText(chat);
  if (!chatText || chatText.length < 3) {
    throw new Error(`OpenCode chat smoke returned empty text: ${chatText}`);
  }

  console.log(`${llmLabel} smoke passed: ${chatText}`);

  const voices = await getJson("/voices");
  const voiceId = voiceIdOverride || voices.voices?.find((voice) => voice.voiceId)?.voiceId;
  if (!voiceId) {
    throw new Error("No ElevenLabs voice ID was returned. Set ELEVENLABS_VOICE_ID or CLICKY_ELEVENLABS_VOICE_ID.");
  }

  const tts = await post("/tts", {
    text: "Clicky live voice test.",
    voiceId
  });

  if (!tts.ok) {
    throw new Error(await formatSmokeHttpError("ElevenLabs TTS", tts));
  }

  const audio = new Uint8Array(await tts.arrayBuffer());
  if (audio.byteLength < 1000) {
    throw new Error(`TTS audio looked too small: ${audio.byteLength} bytes.`);
  }
  await writeFile(ttsOutputPath, audio);

  const transcribeForm = new FormData();
  transcribeForm.append("audio", new Blob([audio], { type: "audio/mpeg" }), "clicky-live-tts-smoke.mp3");
  const transcript = await fetch(`${workerUrl}/transcribe`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Origin: "http://127.0.0.1:5174"
    },
    body: transcribeForm
  });

  if (!transcript.ok) {
    throw new Error(await formatSmokeHttpError("ElevenLabs STT", transcript));
  }

  const transcriptPayload = await transcript.json();
  const transcriptText = transcriptPayload.text || "";
  if (!/clicky|live|voice|test/i.test(transcriptText)) {
    throw new Error(`ElevenLabs STT smoke returned unexpected text: ${transcriptText}`);
  }

  console.log(`Live provider smoke passed. TTS bytes: ${audio.byteLength}. Audio: ${ttsOutputPath}. STT: ${transcriptText}. Chat: ${chatText}`);
}

async function formatSmokeHttpError(label, response) {
  const body = await response.text();
  try {
    const payload = JSON.parse(body);
    const detail = typeof payload.detail === "object" && payload.detail ? payload.detail : payload;
    if (detail.status === "detected_unusual_activity") {
      return `${label} failed with HTTP ${response.status}: ElevenLabs blocked this key/account (${detail.status}). Renew or replace the ElevenLabs key/subscription, then rerun npm run smoke:live-providers.`;
    }
    if (detail.message || detail.error) {
      return `${label} failed with HTTP ${response.status}: ${detail.message || detail.error}`;
    }
  } catch {
    // Fall through to the raw response body below.
  }
  return `${label} failed with HTTP ${response.status}: ${body}`;
}

async function getJson(path) {
  const response = await fetch(`${workerUrl}${path}`, {
    headers: { Accept: "application/json", Origin: "http://127.0.0.1:5174" }
  });

  if (!response.ok) {
    throw new Error(`GET ${path} failed with HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function post(path, body) {
  return fetch(`${workerUrl}${path}`, {
    method: "POST",
    headers: {
      Accept: path === "/tts" ? "audio/mpeg" : "text/event-stream",
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5174"
    },
    body: JSON.stringify(body)
  });
}

async function readClickySseText(response) {
  const stream = await response.text();
  return stream
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:") && !line.includes("[DONE]"))
    .map((line) => {
      const data = line.slice(5).trim();
      try {
        const event = JSON.parse(data);
        return event.text || "";
      } catch {
        return "";
      }
    })
    .join("")
    .trim();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
