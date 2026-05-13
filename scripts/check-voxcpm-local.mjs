import { writeFile } from "node:fs/promises";

const baseUrl = (process.env.CLICKY_VOXCPM_URL ?? process.env.VITE_CLICKY_VOXCPM_URL ?? "http://127.0.0.1:8000/v1").replace(/\/$/, "");
const endpoint = baseUrl.endsWith("/audio/speech") ? baseUrl : `${baseUrl}/audio/speech`;
const model = process.env.CLICKY_VOXCPM_MODEL ?? process.env.VITE_CLICKY_VOXCPM_MODEL ?? "openbmb/VoxCPM2";
const voice = process.env.CLICKY_VOXCPM_VOICE ?? process.env.VITE_CLICKY_VOXCPM_VOICE ?? "default";
const sample = process.env.CLICKY_VOXCPM_SAMPLE ?? "Clicky voice test. Merhaba, Clicky is checking local speech.";
const outputPath = process.env.CLICKY_VOXCPM_OUTPUT ?? "docs/voxcpm-smoke.wav";
const required = process.env.CLICKY_VOXCPM_REQUIRED === "true";
const timeoutMs = Number(process.env.CLICKY_VOXCPM_TIMEOUT_MS ?? "120000");

async function main() {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: "Bearer EMPTY",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: sample,
        voice
      })
    });

    if (!response.ok) {
      throw new Error(`VoxCPM returned HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      throw new Error(`VoxCPM returned JSON instead of audio: ${(await response.text()).slice(0, 500)}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 256) {
      throw new Error(`VoxCPM audio response was too small (${bytes.byteLength} bytes).`);
    }

    await writeFile(outputPath, bytes);
    console.log(
      JSON.stringify(
        {
          ok: true,
          status: "tts_reachable",
          endpoint,
          model,
          voice,
          bytes: bytes.byteLength,
          outputPath
        },
        null,
        2
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const notRunning = message.includes("fetch failed") || message.includes("ECONNREFUSED") || message.includes("terminated");
    const status = timedOut || message.includes("This operation was aborted") ? "timed_out" : notRunning ? "not_running" : "failed";

    console.log(
      JSON.stringify(
        {
          ok: false,
          status,
          endpoint,
          model,
          voice,
          timeoutMs,
          message: status === "timed_out"
            ? "Local VoxCPM speech endpoint is running, but model loading or synthesis timed out."
            : notRunning
            ? "Local VoxCPM speech endpoint is not running. Start the VoxCPM server, then rerun this command."
            : message
        },
        null,
        2
      )
    );

    if (required || status !== "not_running") {
      process.exitCode = 1;
    }
  } finally {
    clearTimeout(timeout);
  }
}

void main();
