import { anthropicChat } from "./providers/anthropic";
import { openAiChat } from "./providers/openai";
import { openCodeChat } from "./providers/opencode";
import { hasSearchIntent, resolveSearchTool } from "./tools/search";
import { hasTimeIntent, resolveTimeTool, timezoneHint } from "./tools/time";
import { extractFirstUrl, resolveUrlTool } from "./tools/url";
import { hasWeatherIntent, isSimpleWeatherRequest, resolveWeatherTools } from "./tools/weather";
import type { ChatRequest, InternetToolRequest, InternetToolResult, WorkerEnv } from "./types";
import { json } from "./utils/http";
import { sse } from "./utils/sse";
import { transcribeAudio, transcribeToken } from "./voice/stt";
import { tts, voices } from "./voice/tts";
import { voiceHealth } from "./voice/health";

const defaultAllowedOrigins = [
  "http://127.0.0.1:5174",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost"
];

const CHAT_MAX_BYTES = 10 * 1024 * 1024;
const TRANSCRIBE_MAX_BYTES = 5 * 1024 * 1024;
const MAX_SCREENSHOTS = 2;
const MAX_SCREENSHOT_BASE64_BYTES = 6 * 1024 * 1024;
const rateLimitBuckets = new Map<string, { windowStart: number; count: number }>();

export async function handleRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const cors = corsHeaders(request, env);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(request.url);

  try {
    const limited = rateLimitResponse(request, url.pathname, cors);
    if (limited) return limited;

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, mode: isMock(env) ? "mock" : "live", message: "Clicky Worker reachable." }, 200, cors);
    }

    if (url.pathname === "/chat" && request.method === "POST") {
      return chat(request, env, cors);
    }

    if (url.pathname === "/tools/resolve" && request.method === "POST") {
      return resolveToolsRoute(request, env, cors);
    }

    if (url.pathname === "/tts" && request.method === "POST") {
      return tts(request, env, cors, isMock(env));
    }

    if (url.pathname === "/transcribe" && request.method === "POST") {
      if (requestTooLarge(request, TRANSCRIBE_MAX_BYTES)) {
        return json({ error: "Audio upload is too large. Keep recordings short and under 5 MB." }, 413, cors);
      }
      return transcribeAudio(request, env, cors, isMock(env));
    }

    if (url.pathname === "/voices" && request.method === "GET") {
      return voices(env, cors, isMock(env));
    }

    if (url.pathname === "/voice-health" && request.method === "GET") {
      return voiceHealth(request, env, cors, isMock(env));
    }

    if (url.pathname === "/transcribe-token" && request.method === "POST") {
      return transcribeToken(env, cors, isMock(env));
    }

    return json({ error: "Route not found." }, 404, cors);
  } catch {
    return json({ error: "Request failed." }, 500, cors);
  }
}

async function chat(request: Request, env: WorkerEnv, cors: HeadersInit): Promise<Response> {
  if (requestTooLarge(request, CHAT_MAX_BYTES)) {
    return json({ error: "Chat request is too large. Limit screenshots to two compressed images." }, 413, cors);
  }

  const body = (await request.json()) as ChatRequest;
  const validation = validateChatRequest(body);
  if (validation) return json({ error: validation }, 413, cors);
  const safetyAnswer = directSafetyAnswer(body);
  if (safetyAnswer) return sse([safetyAnswer], cors);

  const provider = resolveLlmProvider(body, env);
  if (!isMock(env) && provider === "opencode" && isGeminiOpenCodeRequest(body, env)) {
    return openCodeChat(body, env, cors);
  }

  const tools = await resolveInternetTools(body.transcript || "", env, body.timezone);
  const bodyWithTools = appendToolContext(body, tools);
  const directToolAnswer = directAnswerFromTools(body, tools);
  const directTimeAnswer = directTimeAnswerFromTools(body, tools);

  if (directToolAnswer || directTimeAnswer) {
    return sse([directToolAnswer || directTimeAnswer], cors);
  }

  if (isMock(env)) {
    const firstTool = tools.find((tool) => tool.status === "ok" && tool.summary);
    if (firstTool?.summary) {
      return sse([`${firstTool.summary} `], cors);
    }

    return sse(
      [
        "I can guide you from the visible screen. ",
        "test the worker next, then ask me about something visible on your screen. [POINT:930,318:Test Worker:screen0]"
      ],
      cors
    );
  }

  if (provider === "opencode") {
    return openCodeChat(bodyWithTools, env, cors);
  }

  if (provider === "openai") {
    return openAiChat(bodyWithTools, env, cors);
  }

  return anthropicChat(bodyWithTools, env, cors);
}

function directSafetyAnswer(body: ChatRequest): string {
  const text = (body.transcript || "").toLowerCase();
  const asksForAction = /\b(click|press|tap|run|execute|delete|remove|wipe|erase|format|submit|confirm)\b/.test(text);
  const destructive = /\b(delete all|delete every|remove all|wipe|erase|format|all files|factory reset|destroy)\b/.test(text);
  if (!asksForAction || !destructive) return "";

  return "i can't do or guide a destructive action like that. pause and back up anything important first, then use a safer review step where you choose exactly what should be removed. [POINT:none]";
}

async function resolveToolsRoute(request: Request, env: WorkerEnv, cors: HeadersInit): Promise<Response> {
  const body = (await request.json()) as InternetToolRequest;
  const tools = await resolveInternetTools(body.transcript || "", env, body.timezone);
  return json({ tools }, 200, cors);
}

function directAnswerFromTools(body: ChatRequest, tools: InternetToolResult[]): string {
  if (body.responseMode !== "quick") return "";
  const transcript = body.transcript || "";
  const weatherTools = tools.filter((tool) => tool.type === "weather");
  if (!weatherTools.length || !isSimpleWeatherRequest(transcript)) return "";

  if (weatherTools.some((tool) => tool.status === "needs_location")) {
    return "Which city or location should I check the weather for?";
  }

  const summaries = weatherTools
    .filter((tool) => tool.summary && (tool.status === "ok" || tool.status === "no_answer"))
    .map((tool) => tool.summary);
  if (summaries.length) {
    return `${summaries.join(" ")} `;
  }

  if (weatherTools.some((tool) => tool.status === "no_answer")) {
    return "I could not find that weather location. Which city should I check?";
  }

  return "";
}

function directTimeAnswerFromTools(body: ChatRequest, tools: InternetToolResult[]): string {
  if (body.responseMode !== "quick" || !hasTimeIntent(body.transcript || "")) return "";
  const summary = tools.find((tool) => tool.type === "time" && tool.summary)?.summary;
  return summary ? `${summary} ` : "";
}

function appendToolContext(body: ChatRequest, tools: InternetToolResult[]): ChatRequest {
  const usable = tools.filter((tool) => tool.summary || tool.status !== "ok");
  if (!usable.length) return body;

  const context = usable
    .map((tool) => {
      if (tool.summary) return `- ${tool.type}: ${tool.summary}${tool.source ? ` Source: ${tool.source}` : ""}`;
      if (tool.status === "needs_location") return "- weather: The user asked for weather but did not provide a location. Ask which location they mean.";
      if (tool.status === "no_answer") return `- ${tool.type}: No reliable instant answer was found. Say that plainly.`;
      return `- ${tool.type}: Tool failed. ${tool.error || "No details available."}`;
    })
    .join("\n");

  return {
    ...body,
    transcript: `${body.transcript || "Help me."}\n\nInternet tool context already fetched by Clicky:\n${context}\n\nUse the tool context when relevant. If it says a location or answer is missing, ask one short follow-up instead of guessing.`
  };
}

async function resolveInternetTools(transcript: string, env: WorkerEnv, timezone?: string): Promise<InternetToolResult[]> {
  const text = transcript.trim();
  if (!text) return [];

  const tools: InternetToolResult[] = [];
  const needsWeather = hasWeatherIntent(text);
  if (needsWeather) {
    tools.push(...(await resolveWeatherTools(text, env)));
  }

  if (hasTimeIntent(text)) {
    tools.push(resolveTimeTool(timezoneHint(timezone, env)));
  }

  const url = extractFirstUrl(text);
  if (url) {
    tools.push(await resolveUrlTool(url));
  } else if (hasSearchIntent(text) && !needsWeather) {
    tools.push(await resolveSearchTool(text));
  }

  return tools;
}

function resolveLlmProvider(body: ChatRequest, env: WorkerEnv): "anthropic" | "openai" | "opencode" {
  const requested = (body.provider || env.LLM_PROVIDER || "").trim().toLowerCase();
  if (requested === "opencode") return "opencode";
  if (requested === "openai") return "openai";
  if (requested === "anthropic") return "anthropic";
  return "anthropic";
}

function isGeminiOpenCodeRequest(body: ChatRequest, env: WorkerEnv): boolean {
  const model = env.OPENCODE_MODEL?.trim() || body.model?.trim() || "gemini-3-flash";
  return model.toLowerCase().startsWith("gemini-");
}

function rateLimitResponse(request: Request, path: string, cors: HeadersInit): Response | null {
  if (request.method !== "POST") return null;

  const limit = path === "/tts" ? 60 : path === "/chat" || path === "/transcribe" || path === "/transcribe-token" ? 30 : 0;
  if (!limit) return null;

  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "local";
  const key = `${path}:${ip}`;
  const now = Date.now();
  const current = rateLimitBuckets.get(key);
  if (!current || now - current.windowStart >= 60_000) {
    rateLimitBuckets.set(key, { windowStart: now, count: 1 });
    return null;
  }

  current.count += 1;
  if (current.count > limit) {
    return json({ error: "Rate limit exceeded. Please wait a minute and try again." }, 429, cors);
  }

  return null;
}

function requestTooLarge(request: Request, maxBytes: number): boolean {
  const contentLength = Number(request.headers.get("content-length") || 0);
  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

function validateChatRequest(body: ChatRequest): string | null {
  const screenshots = body.screenshots || [];
  if (screenshots.length > MAX_SCREENSHOTS) {
    return `Too many screenshots. Send at most ${MAX_SCREENSHOTS}.`;
  }

  for (const screenshot of screenshots) {
    if (typeof screenshot.base64 !== "string" || screenshot.base64.length > MAX_SCREENSHOT_BASE64_BYTES) {
      return "Screenshot payload is too large. Compress or resize the image before sending.";
    }
  }

  return null;
}

function isMock(env: WorkerEnv): boolean {
  return env.MOCK_MODE !== "false";
}

function corsHeaders(request: Request, env: WorkerEnv): HeadersInit {
  const origin = request.headers.get("Origin") || "";
  const configuredAllowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const nativeOrigins = ["http://tauri.localhost", "https://tauri.localhost", "tauri://localhost"];
  const allowed = configuredAllowed.length ? Array.from(new Set([...configuredAllowed, ...nativeOrigins])) : defaultAllowedOrigins;
  const allowOrigin = isAllowedLocalOrigin(origin, allowed, configuredAllowed.length > 0) ? origin : allowed[0] || "http://127.0.0.1:5173";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Accept,Content-Type,Authorization",
    "Access-Control-Allow-Private-Network": "true",
    Vary: "Origin"
  };
}

function isAllowedLocalOrigin(origin: string, allowed: string[], strict = false): boolean {
  if (!origin) return false;
  if (allowed.includes(origin)) return true;
  if (strict) return false;

  try {
    const url = new URL(origin);
    const isLocalHost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "tauri.localhost";
    return isLocalHost && (url.protocol === "http:" || url.protocol === "https:");
  } catch {
    return origin === "tauri://localhost";
  }
}
