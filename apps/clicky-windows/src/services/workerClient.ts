export interface ClickySettings {
  workerUrl: string;
  model: string;
  provider: "opencode" | "anthropic" | "openai";
  accentColor: string;
  avatar: ClickyAvatar;
  voiceEnabled: boolean;
  computerUseEnabled: boolean;
  shortcut: string;
  showClicky: boolean;
  debugMode: boolean;
  mockMode: boolean;
}

export type ClickyAvatar = "classic" | "dot" | "spark" | "orb" | "comet";

export const CLICKY_ACCENT_OPTIONS = [
  { label: "Blue", value: "#3b82f6" },
  { label: "Mint", value: "#10b981" },
  { label: "Violet", value: "#8b5cf6" },
  { label: "Rose", value: "#f43f5e" },
  { label: "Amber", value: "#f59e0b" }
] as const;

export const CLICKY_AVATAR_OPTIONS: Array<{ label: string; value: ClickyAvatar }> = [
  { label: "Classic", value: "classic" },
  { label: "Dot", value: "dot" },
  { label: "Spark", value: "spark" },
  { label: "Orb", value: "orb" },
  { label: "Comet", value: "comet" }
];

export interface WorkerHealth {
  ok: boolean;
  mode: "mock" | "live";
  message: string;
}

export interface VoiceHealth {
  ok: boolean;
  mode: "mock" | "live";
  provider: "mock" | "elevenlabs";
  status: string;
  tts: boolean | "not_tested";
  stt: boolean | "not_tested";
  message: string;
}

export interface ScreenContext {
  mediaType: "image/jpeg" | "image/png";
  base64: string;
  width: number;
  height: number;
  screen?: number;
  monitorX?: number;
  monitorY?: number;
  monitorWidth?: number;
  monitorHeight?: number;
  scaleFactor?: number;
  cursorX?: number;
  cursorY?: number;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export const defaultSettings: ClickySettings = {
  workerUrl: import.meta.env.VITE_CLICKY_WORKER_URL ?? "http://127.0.0.1:8789",
  model: "minimax-m2.7",
  provider: "opencode",
  accentColor: "#3b82f6",
  avatar: "classic",
  voiceEnabled: true,
  computerUseEnabled: false,
  shortcut: "Ctrl+Alt+Space",
  showClicky: true,
  debugMode: false,
  mockMode: (import.meta.env.VITE_CLICKY_MOCK_MODE ?? "true") === "true"
};

export function modelSupportsScreenImages(settings: Pick<ClickySettings, "provider" | "model">): boolean {
  const requested = `${settings.provider} ${settings.model}`.toLowerCase();
  if (requested.includes("minimax") || requested.includes("m2.7") || requested.includes("m2-7")) return false;
  if (requested.includes("kimi") || requested.includes("moonshot")) return false;
  return /gpt|claude|vision|vl|multimodal|gemini|qwen-vl|pixtral/.test(requested);
}

export async function testWorkerConnection(settings: ClickySettings): Promise<WorkerHealth> {
  if (settings.mockMode) {
    return {
      ok: true,
      mode: "mock",
      message: "Mock mode is active. The local UI flow can run without provider keys."
    };
  }

  const workerUrl = settings.workerUrl.replace(/\/$/, "");
  const response = await fetchWorker(workerUrl, "/health", {
    method: "GET",
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Worker returned HTTP ${response.status}`);
  }

  return (await response.json()) as WorkerHealth;
}

export async function testVoiceHealth(settings: ClickySettings, deep = true): Promise<VoiceHealth> {
  if (settings.mockMode) {
    return {
      ok: true,
      mode: "mock",
      provider: "mock",
      status: "configured",
      tts: true,
      stt: true,
      message: "Mock voice path is available."
    };
  }

  const workerUrl = settings.workerUrl.replace(/\/$/, "");
  const response = await fetchWorker(workerUrl, `/voice-health${deep ? "?deep=true" : ""}`, {
    method: "GET",
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Voice health failed with HTTP ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as VoiceHealth;
}

export function summarizeVoiceHealth(health: VoiceHealth): string {
  if (health.ok) return `${health.provider}: ${health.message}`;
  if (health.status === "detected_unusual_activity") return "ElevenLabs blocked this key/account.";
  if (health.status === "not_configured") return "ElevenLabs is not configured.";
  return `${health.provider}: ${health.message || health.status}`;
}

export function buildMockResponse(): string[] {
  return [
    "I can help from here. ",
    "test the worker, then try asking about something visible on your screen. ",
    "[POINT:930,318:Test Worker:screen0] ",
    "that is the next useful checkpoint before live voice and screen testing."
  ];
}

export function chooseFinalTranscript(input: {
  webviewTranscript: string;
  providerTranscript: string;
}): { transcript: string; source: "webview" | "elevenlabs" } {
  const providerTranscript = input.providerTranscript.trim();
  const webviewTranscript = input.webviewTranscript.trim();
  const providerWordCount = wordCount(providerTranscript);
  const webviewWordCount = wordCount(webviewTranscript);

  if (providerTranscript && (providerWordCount >= 3 || webviewWordCount <= providerWordCount + 1)) {
    return { transcript: providerTranscript, source: "elevenlabs" };
  }

  return { transcript: webviewTranscript, source: "webview" };
}

export async function streamChatResponse(
  settings: ClickySettings,
  request: { transcript: string; screenshots: ScreenContext[]; quickResponse?: boolean; messages?: ConversationMessage[] },
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const workerUrl = settings.workerUrl.replace(/\/$/, "");
  const timeout = createTimeoutSignal(signal, 30_000, "Chat provider took too long to respond.");
  const response = await fetchWorker(workerUrl, "/chat", {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json"
    },
    signal: timeout.signal,
    body: JSON.stringify({
      provider: settings.provider,
      model: settings.model,
      responseMode: request.quickResponse ? "quick" : "screen_guidance",
      computerUseEnabled: settings.computerUseEnabled,
      transcript: request.transcript,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      messages: request.messages,
      screenshots: request.screenshots.map((screenshot) => ({
        mediaType: screenshot.mediaType,
        base64: screenshot.base64,
        width: screenshot.width,
        height: screenshot.height,
        screen: screenshot.screen,
        monitorX: screenshot.monitorX,
        monitorY: screenshot.monitorY,
        monitorWidth: screenshot.monitorWidth,
        monitorHeight: screenshot.monitorHeight,
        scaleFactor: screenshot.scaleFactor,
        cursorX: screenshot.cursorX,
        cursorY: screenshot.cursorY
      }))
    })
  }).finally(timeout.cleanup);

  if (!response.ok) {
    throw new Error(`Chat failed with HTTP ${response.status}: ${await response.text()}`);
  }

  if (!response.body) {
    throw new Error("Chat response did not include a stream.");
  }

  let fullText = "";
  for await (const event of readSse(response.body)) {
    if (event === "[DONE]") break;

    const parsed = JSON.parse(event) as { type?: string; text?: string };
    if (parsed.type === "chunk" && parsed.text) {
      fullText += parsed.text;
      onChunk(parsed.text);
    }

    if (parsed.type === "error" && parsed.text) {
      throw new Error(parsed.text);
    }
  }

  return fullText;
}

export async function transcribeAudio(settings: ClickySettings, audio: Blob, signal?: AbortSignal): Promise<string> {
  if (settings.mockMode) return "Where should I click on this screen?";

  const workerUrl = settings.workerUrl.replace(/\/$/, "");
  const form = new FormData();
  const extension = audio.type.includes("mpeg") || audio.type.includes("mp3") ? "mp3" : audio.type.includes("wav") ? "wav" : "webm";
  const file = new File([audio], `clicky-audio.${extension}`, {
    type: audio.type || "audio/webm"
  });
  form.append("audio", file);

  const timeout = createTimeoutSignal(signal, 30_000, "Transcription took too long.");
  const response = await fetchWorker(workerUrl, "/transcribe", {
    method: "POST",
    headers: { Accept: "application/json" },
    body: form,
    signal: timeout.signal
  }).finally(timeout.cleanup);

  if (!response.ok) {
    throw new Error(formatWorkerHttpError("Transcription", response.status, await response.text()));
  }

  const payload = (await response.json()) as { text?: string };
  return (payload.text || "").trim();
}

export async function requestTextToSpeech(settings: ClickySettings, text: string, signal?: AbortSignal): Promise<Blob | null> {
  if (settings.mockMode || !settings.voiceEnabled || !text.trim()) return null;

  const workerUrl = settings.workerUrl.replace(/\/$/, "");
  const timeout = createTimeoutSignal(signal, 30_000, "Voice provider took too long.");
  const response = await fetchWorker(workerUrl, "/tts", {
    method: "POST",
    headers: {
      Accept: "audio/mpeg,application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text }),
    signal: timeout.signal
  }).finally(timeout.cleanup);

  if (!response.ok) {
    throw new Error(formatWorkerHttpError("TTS", response.status, await response.text()));
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return null;

  return response.blob();
}

async function fetchWorker(workerUrl: string, path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${workerUrl}${path}`, init);
  } catch (error) {
    if (init.signal?.aborted) {
      const reason = init.signal.reason;
      throw new Error(typeof reason === "string" ? reason : "Clicky request was cancelled or took too long.");
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Clicky request was cancelled or took too long.");
    }

    throw new Error(
      `Worker is not reachable at ${workerUrl}. Start it with npm run worker:dev, or use npm run run:live-clicky so the Worker and app start together.`
    );
  }
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function createTimeoutSignal(parent: AbortSignal | undefined, timeoutMs: number, message: string): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(message), timeoutMs);
  const abort = () => controller.abort(parent?.reason || "Clicky request was cancelled.");

  if (parent?.aborted) {
    abort();
  } else {
    parent?.addEventListener("abort", abort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timer);
      parent?.removeEventListener("abort", abort);
    }
  };
}

export function formatWorkerHttpError(action: string, status: number, body: string): string {
  const provider = parseProviderError(body);
  if (provider?.status === "detected_unusual_activity") {
    return `${action} failed with HTTP ${status}: ElevenLabs blocked this key/account (${provider.status}). Renew or replace the ElevenLabs key/subscription, then rerun npm run smoke:live-providers.`;
  }

  if (provider?.message) {
    return `${action} failed with HTTP ${status}: ${provider.message}`;
  }

  return `${action} failed with HTTP ${status}: ${body}`;
}

function parseProviderError(body: string): { status?: string; message?: string } | null {
  try {
    const payload = JSON.parse(body) as {
      error?: string;
      message?: string;
      status?: string;
      detail?: string | { status?: string; message?: string };
    };

    if (typeof payload.detail === "object" && payload.detail) {
      return {
        status: payload.detail.status,
        message: payload.detail.message
      };
    }

    return {
      status: payload.status,
      message: typeof payload.detail === "string" ? payload.detail : payload.message || payload.error
    };
  } catch {
    return null;
  }
}

async function* readSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
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

    if (buffer.trim()) {
      const data = buffer
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (data) yield data;
    }
  } finally {
    reader.releaseLock();
  }
}
