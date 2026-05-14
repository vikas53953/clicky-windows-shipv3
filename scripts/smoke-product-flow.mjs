import { readFileSync } from "node:fs";

const workerUrl = (process.env.CLICKY_WORKER_URL ?? "http://127.0.0.1:8789").replace(/\/$/, "");
const model = process.env.CLICKY_SMOKE_MODEL ?? "gemini-3-flash";
const provider = process.env.CLICKY_SMOKE_PROVIDER ?? "opencode";

const checks = [];

async function main() {
  const health = await getJson("/health");
  checks.push(`health=${health.mode}`);

  const weatherTools = await postJsonWithRetry("/tools/resolve", {
    transcript: "Can you check the weather of Delhi in India?"
  }, (payload) => payload.tools?.some((tool) => tool.type === "weather" && tool.status === "ok" && /Delhi/i.test(tool.summary || "")));
  const weather = weatherTools.tools?.find((tool) => tool.type === "weather");
  assert(weather?.status === "ok" && /Delhi/i.test(weather.summary || ""), `weather tool failed: ${JSON.stringify(weatherTools)}`);
  checks.push("weather=Delhi ok");

  const searchTools = await postJsonWithRetry("/tools/resolve", {
    transcript: "latest news about prime minister modi accident"
  }, (payload) => payload.tools?.some((tool) => tool.type === "search" && tool.status === "ok"));
  const search = searchTools.tools?.find((tool) => tool.type === "search");
  assert(search?.status === "ok", `search tool failed: ${JSON.stringify(searchTools)}`);
  checks.push(`search=${search.status}`);

  const weatherAnswer = await postSseWithRetry("/chat", {
    provider,
    model,
    responseMode: "quick",
    transcript: "Can you tell me the weather in Delhi?",
    screenshots: []
  }, (payload) => /Delhi/i.test(payload.text));
  assert(/Delhi/i.test(weatherAnswer.text), `weather direct answer missed Delhi: ${weatherAnswer.text}`);
  checks.push(`direct_weather=${weatherAnswer.firstChunkMs}ms first chunk`);

  const screenFallback = await postSse("/chat", {
    provider,
    model,
    responseMode: "screen_guidance",
    transcript: "This is a product smoke. Reply in one short sentence that the text route works.",
    screenshots: [
      {
        mediaType: "image/png",
        base64: readFileSync("docs/phase2-browser-smoke.png").toString("base64"),
        width: 1168,
        height: 796
      }
    ]
  });
  assert(!/image input|does not support image/i.test(screenFallback.text), `screen fallback still hit image error: ${screenFallback.text}`);
  assert(screenFallback.text.trim().length > 0, "screen fallback returned no text");
  checks.push(`screen_text_model=${screenFallback.firstChunkMs}ms first chunk`);

  console.log(`Product flow smoke passed. ${checks.join("; ")}.`);
}

async function getJson(path) {
  const response = await fetch(`${workerUrl}${path}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${path} failed with HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

async function postJson(path, body) {
  const response = await fetch(`${workerUrl}${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`${path} failed with HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

async function postJsonWithRetry(path, body, isGoodPayload) {
  let lastPayload;
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const payload = await postJson(path, body);
      lastPayload = payload;
      if (isGoodPayload(payload)) return payload;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }

  if (lastError) throw lastError;
  return lastPayload;
}

async function postSse(path, body) {
  const started = performance.now();
  const response = await fetch(`${workerUrl}${path}`, {
    method: "POST",
    headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`${path} failed with HTTP ${response.status}: ${await response.text()}`);
  if (!response.body) throw new Error(`${path} did not return a stream`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let firstChunkMs = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";

    for (const block of blocks) {
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");

      if (!data || data === "[DONE]") continue;
      const event = JSON.parse(data);
      if (event.type === "chunk" && event.text) {
        if (!firstChunkMs) firstChunkMs = Math.round(performance.now() - started);
        text += event.text;
      }
      if (event.type === "error" && event.text) throw new Error(event.text);
    }
  }

  return { text, firstChunkMs };
}

async function postSseWithRetry(path, body, isGoodPayload) {
  let lastPayload;
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const payload = await postSse(path, body);
      lastPayload = payload;
      if (isGoodPayload(payload)) return payload;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }

  if (lastError) throw lastError;
  return lastPayload;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(`Product flow smoke failed: ${error.message}`);
  process.exit(1);
});
