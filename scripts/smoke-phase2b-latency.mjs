const workerUrl = (process.env.CLICKY_WORKER_URL || "http://127.0.0.1:8789").replace(/\/$/, "");
const model = process.env.CLICKY_MODEL || "gemini-3-flash";
const startedAt = performance.now();

const response = await fetch(`${workerUrl}/chat`, {
  method: "POST",
  headers: {
    Accept: "text/event-stream",
    "Content-Type": "application/json",
    Origin: "http://127.0.0.1:5174"
  },
  body: JSON.stringify({
    provider: "opencode",
    model,
    responseMode: "quick",
    transcript: "Can you tell me the weather in Delhi? Reply in two short spoken sentences.",
    screenshots: []
  })
});

if (!response.ok || !response.body) {
  throw new Error(`Chat failed with HTTP ${response.status}: ${await response.text()}`);
}

let firstTokenMs;
let firstSentenceMs;
let firstAudioMs;
let ttsBytes = 0;
let fullText = "";
let pendingText = "";
let ttsStarted = false;
let ttsPromise = Promise.resolve();

for await (const event of readSse(response.body)) {
  if (event === "[DONE]") break;
  const parsed = JSON.parse(event);
  if (parsed.type !== "chunk" || !parsed.text) continue;

  if (firstTokenMs === undefined) {
    firstTokenMs = elapsed(startedAt);
  }

  fullText += parsed.text;
  pendingText += parsed.text;

  if (!ttsStarted) {
    const sentence = firstCompleteSentence(pendingText);
    if (sentence) {
      ttsStarted = true;
      firstSentenceMs = elapsed(startedAt);
      ttsPromise = requestTts(sentence).then((bytes) => {
        ttsBytes = bytes;
        firstAudioMs = elapsed(startedAt);
      });
    }
  }
}

await ttsPromise;
const totalMs = elapsed(startedAt);

if (!fullText.trim()) throw new Error("Phase 2B latency smoke did not receive model text.");
if (!ttsStarted) throw new Error(`Phase 2B latency smoke did not find a complete sentence. Text: ${fullText}`);
if (!ttsBytes) throw new Error("Phase 2B latency smoke did not receive TTS audio bytes.");

console.log(
  `Phase 2B latency smoke passed. ${model} first token ${firstTokenMs}ms, first sentence ${firstSentenceMs}ms, first audio ${firstAudioMs}ms, chat+first-audio total ${totalMs}ms, TTS bytes ${ttsBytes}.`
);
console.log(`Answer preview: ${fullText.replace(/\s+/g, " ").trim().slice(0, 180)}`);

async function requestTts(text) {
  const ttsResponse = await fetch(`${workerUrl}/tts`, {
    method: "POST",
    headers: {
      Accept: "audio/mpeg,application/json",
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5174"
    },
    body: JSON.stringify({ text })
  });

  if (!ttsResponse.ok) {
    throw new Error(`TTS failed with HTTP ${ttsResponse.status}: ${await ttsResponse.text()}`);
  }

  const audio = await ttsResponse.arrayBuffer();
  return audio.byteLength;
}

function firstCompleteSentence(text) {
  const match = text.match(/[^.!?।]+[.!?।]+/);
  return match?.[0]?.trim() || "";
}

function elapsed(start) {
  return Math.max(0, Math.round(performance.now() - start));
}

async function* readSse(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
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
      if (data) yield data;
    }
  }
}
