export interface WorkerEnv {
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENCODE_API_KEY?: string;
  OPENCODE_BASE_URL?: string;
  OPENCODE_MODEL?: string;
  OPENCODE_API_MODE?: string;
  ASSEMBLYAI_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_VOICE_ID?: string;
  ELEVENLABS_STT_MODEL_ID?: string;
  ALLOWED_ORIGINS?: string;
  LLM_PROVIDER?: string;
  MOCK_MODE?: string;
  DEFAULT_WEATHER_LOCATION?: string;
  DEFAULT_TIMEZONE?: string;
}

interface ChatRequest {
  transcript?: string;
  model?: string;
  responseMode?: "quick" | "screen_guidance" | string;
  computerUseEnabled?: boolean;
  timezone?: string;
  provider?: "anthropic" | "openai" | "opencode" | string;
  messages?: ConversationMessage[];
  screenshots?: Array<{
    mediaType: "image/png" | "image/jpeg" | string;
    base64: string;
  }>;
  system?: string;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface InternetToolRequest {
  transcript?: string;
  timezone?: string;
}

interface InternetToolResult {
  type: "weather" | "search" | "url" | "time";
  status: "ok" | "needs_location" | "no_answer" | "error";
  label?: string;
  summary?: string;
  source?: string;
  error?: string;
}

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

const clickySystemPrompt = `You are Clicky, a practical Windows desktop tutor that can see the user's current screen only when they explicitly ask for help.

Give concise, step-by-step guidance for what the user is working on.
Use screenshot context when provided.
When you refer to a visible UI element, include a hidden point tag after the sentence:
[POINT:x,y:short label:screenN]

For multi-step "show me how" tasks, also include one hidden structured plan block after the short visible answer:
<CLICKY_PLAN>{"goal":"short goal","app":"visible or current app","mode":"teaching","steps":[{"type":"click","label":"visible label","hint":"what the user should do","targetContext":"visibleElement"}]}</CLICKY_PLAN>

Supported step types are observe, click, keyboardShortcut, pressKey, type, scroll, openApp, openUrl, and setValue.
Use targetContext visibleElement by default. Use currentSelection, focusedElement, or currentHighlight only when the user clearly selected, focused, or highlighted something.
The plan is for visual teaching only. Do not assume Clicky can click, type, or control the computer.

If computer use is explicitly enabled and the user clearly asks Clicky to open a public web page, you may include one hidden local tool block after the visible answer:
<CLICKY_TOOL>{"name":"open_url","args":{"url":"https://example.com"}}</CLICKY_TOOL>

If computer use is explicitly enabled and the user asks where something is on the screen, prefer [POINT:x,y:label:screenN] over action tools.
Do not include click, type, submit, delete, purchase, install, shell, file, or clipboard tools.

Coordinates must be pixel coordinates relative to the provided screen image.
Do not claim to see anything that is not visible.
Do not ask for secrets, passwords, or private data.
If the user asks for unsafe or destructive actions, warn them and suggest a safe alternative.`;

const quickResponseInstruction =
  "This is a quick voice check or conversational prompt. Reply in one short, natural sentence. Do not include a workflow plan or point tags unless the user asks about the screen.";

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handleRequest(request, env);
  }
};

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
      return tts(request, env, cors);
    }

    if (url.pathname === "/transcribe" && request.method === "POST") {
      return transcribeAudio(request, env, cors);
    }

    if (url.pathname === "/voices" && request.method === "GET") {
      return voices(env, cors);
    }

    if (url.pathname === "/voice-health" && request.method === "GET") {
      return voiceHealth(request, env, cors);
    }

    if (url.pathname === "/transcribe-token" && request.method === "POST") {
      return transcribeToken(env, cors);
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

  const tools = await resolveInternetTools(body.transcript || "", env, body.timezone);
  const bodyWithTools = appendToolContext(body, tools);
  const provider = resolveLlmProvider(body, env);
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
        'Click the highlighted Test Worker button next. [POINT:930,318:Test Worker:screen0] <CLICKY_PLAN>{"goal":"Test the Clicky Worker","app":"Clicky Windows","mode":"teaching","steps":[{"type":"click","label":"Test Worker","hint":"Confirm the local Worker is reachable","targetContext":"visibleElement"},{"type":"click","label":"Test Voice","hint":"Check spoken output or local fallback","targetContext":"visibleElement"}]}</CLICKY_PLAN>'
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

async function anthropicChat(body: ChatRequest, env: WorkerEnv, cors: HeadersInit): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "Anthropic is not configured." }, 503, cors);
  }

  const messages = buildAnthropicMessages(body);
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: body.model || "claude-sonnet-4-5",
      max_tokens: maxOutputTokensFor(body),
      stream: true,
      system: systemPromptFor(body),
      messages
    })
  });

  if (!upstream.body || !upstream.ok) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...cors,
        "content-type": upstream.headers.get("content-type") || "application/json"
      }
    });
  }

  return normalizeAnthropicStream(upstream.body, cors);
}

async function openAiChat(body: ChatRequest, env: WorkerEnv, cors: HeadersInit): Promise<Response> {
  if (!env.OPENAI_API_KEY) {
    return json({ error: "OpenAI is not configured." }, 503, cors);
  }

  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: resolveOpenAiModel(body, env),
      instructions: systemPromptFor(body),
      input: buildOpenAiInput(body, "openai", resolveOpenAiModel(body, env)),
      max_output_tokens: maxOutputTokensFor(body),
      stream: true,
      store: false,
      stream_options: {
        include_obfuscation: false
      }
    })
  });

  if (!upstream.body || !upstream.ok) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...cors,
        "content-type": upstream.headers.get("content-type") || "application/json"
      }
    });
  }

  return normalizeOpenAiStream(upstream.body, cors);
}

async function openCodeChat(body: ChatRequest, env: WorkerEnv, cors: HeadersInit): Promise<Response> {
  if (!env.OPENCODE_API_KEY) {
    return json({ error: "OpenCode is not configured." }, 503, cors);
  }

  const model = resolveOpenCodeModel(body, env);
  const mode = resolveOpenCodeMode(body, env);
  const baseUrl = resolveOpenCodeBaseUrl(env, mode);

  if (mode === "chat_completions") {
    return openCodeChatCompletions(body, env, cors, baseUrl, model);
  }

  const upstream = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENCODE_API_KEY}`
    },
    body: JSON.stringify({
      model,
      instructions: systemPromptFor(body),
      input: buildOpenAiInput(body, "opencode", model),
      max_output_tokens: maxOutputTokensFor(body),
      stream: true,
      store: false,
      stream_options: {
        include_obfuscation: false
      }
    })
  });

  if (!upstream.body || !upstream.ok) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...cors,
        "content-type": upstream.headers.get("content-type") || "application/json"
      }
    });
  }

  return normalizeOpenAiStream(upstream.body, cors);
}

async function openCodeChatCompletions(
  body: ChatRequest,
  env: WorkerEnv,
  cors: HeadersInit,
  baseUrl: string,
  model: string
): Promise<Response> {
  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENCODE_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: buildChatCompletionsMessages(body, "opencode", model),
      max_tokens: maxOutputTokensFor(body),
      stream: true
    })
  });

  if (!upstream.body || !upstream.ok) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...cors,
        "content-type": upstream.headers.get("content-type") || "application/json"
      }
    });
  }

  return normalizeChatCompletionsStream(upstream.body, cors);
}

async function tts(request: Request, env: WorkerEnv, cors: HeadersInit): Promise<Response> {
  const body = (await request.json()) as { text?: string; voiceId?: string; modelId?: string };

  if (isMock(env)) {
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

async function transcribeAudio(request: Request, env: WorkerEnv, cors: HeadersInit): Promise<Response> {
  if (requestTooLarge(request, TRANSCRIBE_MAX_BYTES)) {
    return json({ error: "Audio upload is too large. Keep recordings short and under 5 MB." }, 413, cors);
  }

  if (isMock(env)) {
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

async function voices(env: WorkerEnv, cors: HeadersInit): Promise<Response> {
  if (isMock(env)) {
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

async function voiceHealth(request: Request, env: WorkerEnv, cors: HeadersInit): Promise<Response> {
  const deep = new URL(request.url).searchParams.get("deep") === "true";

  if (isMock(env)) {
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

async function transcribeToken(env: WorkerEnv, cors: HeadersInit): Promise<Response> {
  if (isMock(env)) {
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
  if (hasWeatherIntent(text)) {
    tools.push(...(await resolveWeatherTools(text, env)));
  }

  if (hasTimeIntent(text)) {
    tools.push(resolveTimeTool(bodyTimezoneHint(timezone, env)));
  }

  const url = extractFirstUrl(text);
  if (url) {
    tools.push(await resolveUrlTool(url));
  } else if (hasSearchIntent(text) && !hasWeatherIntent(text)) {
    tools.push(await resolveSearchTool(text));
  }

  return tools;
}

function hasWeatherIntent(text: string): boolean {
  return /\b(weather|temperature|forecast|rain|raining|humidity|wind|climate)\b/i.test(text);
}

function hasSearchIntent(text: string): boolean {
  return /\b(search|look up|lookup|browse|internet|web|latest|news|find out|what happened|who is|what is)\b/i.test(text);
}

function hasTimeIntent(text: string): boolean {
  return /\b(time|date|today|now|current time|what day)\b/i.test(text);
}

function bodyTimezoneHint(timezone: string | undefined, env: WorkerEnv): string {
  return timezone?.trim() || env.DEFAULT_TIMEZONE?.trim() || "Asia/Kolkata";
}

function resolveTimeTool(timezone: string): InternetToolResult {
  const formatted = new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    dateStyle: "full",
    timeStyle: "medium"
  }).format(new Date());

  return {
    type: "time",
    status: "ok",
    label: timezone,
    summary: `Current date and time in ${timezone} is ${formatted}.`,
    source: "Worker clock"
  };
}

function isSimpleWeatherRequest(text: string): boolean {
  if (!hasWeatherIntent(text)) return false;
  return !/\b(compare|why|explain|history|tomorrow|week|weekly|hourly|next|should I|plan|travel|pack|wear)\b/i.test(text);
}

async function resolveWeatherTools(transcript: string, env: WorkerEnv): Promise<InternetToolResult[]> {
  const locations = extractWeatherLocations(transcript);
  const resolvedLocations = locations.length ? locations : env.DEFAULT_WEATHER_LOCATION?.trim() ? [env.DEFAULT_WEATHER_LOCATION.trim()] : [];
  if (!resolvedLocations.length) return [{ type: "weather", status: "needs_location" }];

  const results = await Promise.all(resolvedLocations.map((location) => resolveOneWeatherLocation(location)));
  return results.length ? results : [{ type: "weather", status: "needs_location" }];
}

async function resolveOneWeatherLocation(location: string): Promise<InternetToolResult> {
  try {
    const place = await geocodeWeatherLocation(location);
    if (!place || typeof place.latitude !== "number" || typeof place.longitude !== "number") {
      return { type: "weather", status: "no_answer", label: location, summary: `I could not find current weather for ${location}.` };
    }

    const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
    forecastUrl.searchParams.set("latitude", String(place.latitude));
    forecastUrl.searchParams.set("longitude", String(place.longitude));
    forecastUrl.searchParams.set("current", "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m");
    forecastUrl.searchParams.set("timezone", "auto");

    const forecastResponse = await fetch(forecastUrl.toString(), { headers: { Accept: "application/json" } });
    if (!forecastResponse.ok) return { type: "weather", status: "error", error: `Forecast failed with HTTP ${forecastResponse.status}.` };
    const forecast = (await forecastResponse.json()) as {
      current?: Record<string, number | string>;
      current_units?: Record<string, string>;
    };

    const current = forecast.current || {};
    const units = forecast.current_units || {};
    const placeName = [place.name, place.country].filter(Boolean).join(", ");
    const temperature = formatWeatherValue(current.temperature_2m, units.temperature_2m);
    const feelsLike = formatWeatherValue(current.apparent_temperature, units.apparent_temperature);
    const humidity = formatWeatherValue(current.relative_humidity_2m, units.relative_humidity_2m);
    const wind = formatWeatherValue(current.wind_speed_10m, units.wind_speed_10m);
    const precipitation = formatWeatherValue(current.precipitation, units.precipitation);
    const condition = weatherCodeLabel(Number(current.weather_code));

    return {
      type: "weather",
      status: "ok",
      label: location,
      source: "Open-Meteo",
      summary: `Current weather for ${placeName}: ${condition}, ${temperature}, feels like ${feelsLike}, humidity ${humidity}, wind ${wind}, precipitation ${precipitation}.`
    };
  } catch (error) {
    return {
      type: "weather",
      status: "error",
      label: location,
      error: error instanceof Error ? error.message : "Weather lookup failed."
    };
  }
}

async function geocodeWeatherLocation(location: string): Promise<{ name?: string; country?: string; latitude?: number; longitude?: number; timezone?: string } | null> {
  for (const variant of weatherLocationVariants(location)) {
    const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geocodeUrl.searchParams.set("name", variant);
    geocodeUrl.searchParams.set("count", "1");
    geocodeUrl.searchParams.set("language", "en");
    geocodeUrl.searchParams.set("format", "json");

    const geocodeResponse = await fetch(geocodeUrl.toString(), { headers: { Accept: "application/json" } });
    if (!geocodeResponse.ok) throw new Error(`Geocoding failed with HTTP ${geocodeResponse.status}.`);
    const geocode = (await geocodeResponse.json()) as {
      results?: Array<{ name?: string; country?: string; latitude?: number; longitude?: number; timezone?: string }>;
    };
    const place = geocode.results?.[0];
    if (place && typeof place.latitude === "number" && typeof place.longitude === "number" && placeMatchesLocationHint(location, place)) return place;
  }

  return null;
}

function placeMatchesLocationHint(
  requestedLocation: string,
  place: { name?: string; country?: string; latitude?: number; longitude?: number; timezone?: string }
): boolean {
  const requested = requestedLocation.toLowerCase();
  const country = (place.country || "").toLowerCase();
  if (/\b(india|punjab|delhi)\b/i.test(requested)) return country === "india";
  return true;
}

function weatherLocationVariants(location: string): string[] {
  const clean = location.replace(/\s+/g, " ").trim();
  const variants = [clean];
  const words = clean.split(" ").filter(Boolean);
  if (words.length > 1) {
    variants.push(words.slice(0, -1).join(" "));
  }
  return Array.from(new Set(variants.filter(Boolean)));
}

async function resolveSearchTool(transcript: string): Promise<InternetToolResult> {
  const query = cleanSearchQuery(transcript);
  if (!query) return { type: "search", status: "no_answer" };

  try {
    const searchUrl = new URL("https://api.duckduckgo.com/");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("no_html", "1");
    searchUrl.searchParams.set("skip_disambig", "1");

    const response = await fetch(searchUrl.toString(), { headers: { Accept: "application/json" } });
    if (!response.ok) return { type: "search", status: "error", error: `Search failed with HTTP ${response.status}.` };
    const payload = (await response.json()) as {
      Heading?: string;
      Answer?: string;
      AbstractText?: string;
      AbstractURL?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
    };
    const summary = payload.Answer || payload.AbstractText || payload.RelatedTopics?.find((topic) => topic.Text)?.Text || "";
    if (!summary) {
      const fallback = await resolveDuckDuckGoHtmlSearch(query);
      if (fallback) return fallback;
      const newsFallback = await resolveNewsRssSearch(query);
      if (newsFallback) return newsFallback;
      return { type: "search", status: "no_answer", source: "DuckDuckGo Instant Answer" };
    }

    return {
      type: "search",
      status: "ok",
      source: payload.AbstractURL || payload.RelatedTopics?.find((topic) => topic.FirstURL)?.FirstURL || "DuckDuckGo Instant Answer",
      summary: `${payload.Heading ? `${payload.Heading}: ` : ""}${truncate(summary, 700)}`
    };
  } catch (error) {
    return {
      type: "search",
      status: "error",
      error: error instanceof Error ? error.message : "Search lookup failed."
    };
  }
}

async function resolveDuckDuckGoHtmlSearch(query: string): Promise<InternetToolResult | null> {
  const searchUrl = new URL("https://html.duckduckgo.com/html/");
  searchUrl.searchParams.set("q", query);

  const response = await fetch(searchUrl.toString(), {
    headers: {
      Accept: "text/html",
      "User-Agent": "ClickyWindows/0.1"
    }
  });
  if (!response.ok) return null;

  const html = await response.text();
  const title = normalizePlainText(firstMatch(html, /<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*>([\s\S]*?)<\/a>/i));
  const snippet = normalizePlainText(firstMatch(html, /<a[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/i));
  const href = normalizePlainText(firstMatch(html, /<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["']/i));
  const summary = [title, snippet].filter(Boolean).join(": ");
  if (!summary) return null;

  return {
    type: "search",
    status: "ok",
    source: href || "DuckDuckGo Search",
    summary: truncate(summary, 700)
  };
}

async function resolveNewsRssSearch(query: string): Promise<InternetToolResult | null> {
  const searchUrl = new URL("https://news.google.com/rss/search");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("hl", "en-IN");
  searchUrl.searchParams.set("gl", "IN");
  searchUrl.searchParams.set("ceid", "IN:en");

  const response = await fetch(searchUrl.toString(), {
    headers: {
      Accept: "application/rss+xml,text/xml,application/xml"
    }
  });
  if (!response.ok) return null;

  const xml = await response.text();
  const item = firstMatch(xml, /<item>([\s\S]*?)<\/item>/i);
  if (!item) return null;

  const title = normalizePlainText(firstMatch(item, /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i));
  const description = normalizePlainText(firstMatch(item, /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i));
  const source = normalizePlainText(firstMatch(item, /<link>([\s\S]*?)<\/link>/i)) || searchUrl.toString();
  const summary = [title, description].filter(Boolean).join(": ");
  if (!summary) return null;

  return {
    type: "search",
    status: "ok",
    source,
    summary: truncate(summary, 700)
  };
}

async function resolveUrlTool(rawUrl: string): Promise<InternetToolResult> {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return { type: "url", status: "error", error: "Unsupported URL protocol." };
    const response = await fetch(url.toString(), { headers: { Accept: "text/html,text/plain,application/json" } });
    if (!response.ok) return { type: "url", status: "error", error: `URL fetch failed with HTTP ${response.status}.` };
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    const title = contentType.includes("html") ? text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] : "";
    const plain = text.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
    return {
      type: "url",
      status: "ok",
      source: url.toString(),
      summary: `${title ? `${normalizePlainText(title)}: ` : ""}${truncate(normalizePlainText(plain), 900)}`
    };
  } catch (error) {
    return {
      type: "url",
      status: "error",
      error: error instanceof Error ? error.message : "URL lookup failed."
    };
  }
}

function extractWeatherLocations(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  const afterWeather = normalized.match(/\b(?:weather|temperature|forecast|rain|raining|humidity|wind)\b(?:\s+(?:today|now|outside|currently))*\s+(?:in|at|for|near|of|around)\s+([^?.,!]+)/i);
  if (afterWeather?.[1]) return splitWeatherLocations(afterWeather[1]);

  const beforeWeather = normalized.match(/\b(?:for|in|at|near|around|of|check|tell me|show me|what is|what's|how is|hows|how's)?\s*([a-z][a-z\s-]{1,60}?)\s+(?:weather|temperature|forecast)\b/i);
  if (beforeWeather?.[1]) {
    const location = cleanLocationQuery(beforeWeather[1]);
    if (location && !isWeatherQuestionFiller(location)) return [location];
  }

  return [];
}

function splitWeatherLocations(value: string): string[] {
  return value
    .split(/\s+(?:and|or)\s+|,/i)
    .map(cleanLocationQuery)
    .filter((location) => location && !isWeatherQuestionFiller(location))
    .slice(0, 4);
}

function cleanLocationQuery(value: string): string {
  return value
    .replace(/\b(today|tomorrow|now|currently|please|right now|this morning|this evening|around me|near me|outside)\b/gi, " ")
    .replace(/\b(weather|temperature|forecast|rain|raining|humidity|wind)\b/gi, " ")
    .replace(/\b(can you|could you|would you|you have to|please|check|tell me|show me|what is|what's|how is|how's|hows|the|of|in|at|near|around|for)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isWeatherQuestionFiller(value: string): boolean {
  return /^(can you|could you|would you|you have to|please|check|tell me|show me|what is|what's|how is|how's|hows|the|my|current)$/i.test(value.trim());
}

function cleanSearchQuery(text: string): string {
  return text
    .replace(/\b(clicky|please|can you|could you|tell me|show me)\b/gi, " ")
    .replace(/\b(search|look up|lookup|browse|internet|web|latest|news|find out)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/[?.!,]+$/g, "")
    .trim();
}

function extractFirstUrl(text: string): string {
  return text.match(/https?:\/\/[^\s)]+/i)?.[0] || "";
}

function formatWeatherValue(value: unknown, unit: string | undefined): string {
  if (typeof value === "number") return `${value}${unit || ""}`;
  if (typeof value === "string" && value.trim()) return `${value}${unit || ""}`;
  return "unknown";
}

function weatherCodeLabel(code: number): string {
  if (code === 0) return "clear sky";
  if ([1, 2, 3].includes(code)) return "partly cloudy";
  if ([45, 48].includes(code)) return "fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "thunderstorm";
  return "conditions available";
}

function normalizePlainText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

function firstMatch(value: string, pattern: RegExp): string {
  return value.match(pattern)?.[1] || "";
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trim()}…`;
}

function resolveLlmProvider(body: ChatRequest, env: WorkerEnv): "anthropic" | "openai" | "opencode" {
  const requested = (body.provider || env.LLM_PROVIDER || "").trim().toLowerCase();
  if (requested === "opencode") return "opencode";
  if (requested === "openai") return "openai";
  if (requested === "anthropic") return "anthropic";
  return "anthropic";
}

function resolveOpenAiModel(body: ChatRequest, env: WorkerEnv): string {
  if (env.OPENAI_MODEL?.trim()) return env.OPENAI_MODEL.trim();

  const requested = body.model?.trim();
  if (requested && /^(gpt-|o[0-9]|chatgpt)/i.test(requested)) {
    return requested;
  }

  return "gpt-5";
}

function resolveOpenCodeModel(body: ChatRequest, env: WorkerEnv): string {
  if (env.OPENCODE_MODEL?.trim()) return env.OPENCODE_MODEL.trim();

  const requested = body.model?.trim();
  if (requested) return requested;

  return "minimax-m2.7";
}

function resolveOpenCodeMode(body: ChatRequest, env: WorkerEnv): "responses" | "chat_completions" {
  const requested = env.OPENCODE_API_MODE?.trim().toLowerCase();
  if (requested === "chat_completions" || requested === "chat-completions") return "chat_completions";
  if (requested === "responses") return "responses";

  const model = resolveOpenCodeModel(body, env);
  return model.startsWith("gpt-") ? "responses" : "chat_completions";
}

function resolveOpenCodeBaseUrl(env: WorkerEnv, mode: "responses" | "chat_completions"): string {
  if (env.OPENCODE_BASE_URL?.trim()) return trimTrailingSlash(env.OPENCODE_BASE_URL.trim());
  return "https://opencode.ai/zen/v1";
}

function buildAnthropicMessages(body: ChatRequest): unknown[] {
  const messages: unknown[] = normalizedConversationMessages(body).map((message) => ({
    role: message.role,
    content: message.content
  }));
  const content: unknown[] = [
    {
      type: "text",
      text: body.transcript || "Help me with what is visible on my screen."
    }
  ];

  for (const screenshot of body.screenshots || []) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: screenshot.mediaType,
        data: screenshot.base64
      }
    });
  }

  return [...messages, { role: "user", content }];
}

function buildOpenAiInput(body: ChatRequest, provider = body.provider || "", resolvedModel = body.model || ""): unknown[] {
  const allowImages = supportsImageInput(provider, resolvedModel);
  const imageCount = body.screenshots?.length || 0;
  const content: unknown[] = [
    {
      type: "input_text",
      text: `${body.transcript || "Help me with what is visible on my screen."}${
        imageCount > 0 && !allowImages
          ? "\n\nClicky captured screenshots, but the selected model route cannot receive screenshot images. Answer from the transcript and any tool context only. Say clearly if screen vision is needed."
          : ""
      }`
    }
  ];

  if (allowImages) {
    for (const screenshot of body.screenshots || []) {
      content.push({
        type: "input_image",
        image_url: `data:${screenshot.mediaType};base64,${screenshot.base64}`
      });
    }
  }

  return [...normalizedConversationMessages(body).map((message) => ({ role: message.role, content: message.content })), { role: "user", content }];
}

function buildChatCompletionsMessages(body: ChatRequest, provider = body.provider || "", resolvedModel = body.model || ""): unknown[] {
  const allowImages = supportsImageInput(provider, resolvedModel);
  const imageCount = body.screenshots?.length || 0;
  const content: unknown[] = [
    {
      type: "text",
      text: `${body.transcript || "Help me with what is visible on my screen."}${
        imageCount > 0 && !allowImages
          ? "\n\nClicky captured screenshots, but the selected model route cannot receive screenshot images. Answer from the transcript and any tool context only. Say clearly if screen vision is needed."
          : ""
      }`
    }
  ];

  if (allowImages) {
    for (const screenshot of body.screenshots || []) {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${screenshot.mediaType};base64,${screenshot.base64}`
        }
      });
    }
  }

  return [
    { role: "system", content: systemPromptFor(body) },
    ...normalizedConversationMessages(body).map((message) => ({ role: message.role, content: message.content })),
    { role: "user", content: content.length === 1 ? String((content[0] as { text?: string }).text || body.transcript || "Help me with what is visible on my screen.") : content }
  ];
}

function normalizedConversationMessages(body: ChatRequest): ConversationMessage[] {
  if (!Array.isArray(body.messages)) return [];

  return body.messages
    .filter((message): message is ConversationMessage => {
      return (
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        Boolean(message.content.trim())
      );
    })
    .slice(-20)
    .map((message) => ({
      role: message.role,
      content: truncate(message.content.trim(), 2000)
    }));
}

function supportsImageInput(provider: string, model: string): boolean {
  const requested = `${provider} ${model}`.toLowerCase();
  if (requested.includes("minimax") || requested.includes("m2.7") || requested.includes("m2-7")) return false;
  if (requested.includes("kimi") || requested.includes("moonshot")) return false;
  return /gpt|claude|vision|vl|multimodal|gemini|qwen-vl|pixtral/.test(requested);
}

async function firstElevenLabsVoiceId(env: WorkerEnv): Promise<string | null> {
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

function sse(chunks: string[], cors: HeadersInit): Response {
  const stream = chunks.map((chunk) => `data: ${JSON.stringify({ type: "chunk", text: chunk })}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(stream, {
    status: 200,
    headers: {
      ...cors,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache"
    }
  });
}

function normalizeOpenAiStream(body: ReadableStream<Uint8Array>, cors: HeadersInit): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneSent = false;

  const stream = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          emitOpenAiBlock(block, controller, encoder, () => {
            doneSent = true;
          });
        }
      },
      flush(controller) {
        if (buffer.trim()) {
          emitOpenAiBlock(buffer, controller, encoder, () => {
            doneSent = true;
          });
        }

        if (!doneSent) {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        }
      }
    })
  );

  return new Response(stream, {
    status: 200,
    headers: {
      ...cors,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache"
    }
  });
}

function normalizeAnthropicStream(body: ReadableStream<Uint8Array>, cors: HeadersInit): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneSent = false;

  const stream = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          emitAnthropicBlock(block, controller, encoder, () => {
            doneSent = true;
          });
        }
      },
      flush(controller) {
        if (buffer.trim()) {
          emitAnthropicBlock(buffer, controller, encoder, () => {
            doneSent = true;
          });
        }

        if (!doneSent) {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        }
      }
    })
  );

  return new Response(stream, {
    status: 200,
    headers: {
      ...cors,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache"
    }
  });
}

function emitAnthropicBlock(
  block: string,
  controller: TransformStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  markDone: () => void
) {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");

  if (!data || data === "[DONE]") {
    if (!data) return;
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    markDone();
    return;
  }

  try {
    const event = JSON.parse(data) as {
      type?: string;
      delta?: { type?: string; text?: string };
      error?: { message?: string };
    };

    if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: event.delta.text })}\n\n`));
    }

    if (event.type === "message_stop") {
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      markDone();
    }

    if (event.type === "error" && event.error?.message) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", text: event.error.message })}\n\n`));
    }
  } catch {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", text: "Anthropic stream parse error." })}\n\n`));
  }
}

function emitOpenAiBlock(
  block: string,
  controller: TransformStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  markDone: () => void
) {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");

  if (!data || data === "[DONE]") {
    if (!data) return;
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    markDone();
    return;
  }

  try {
    const event = JSON.parse(data) as { type?: string; delta?: string; error?: { message?: string } };
    if (event.type === "response.output_text.delta" && event.delta) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: event.delta })}\n\n`));
    }

    if (event.type === "response.completed") {
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      markDone();
    }

    if (event.type === "response.error" && event.error?.message) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", text: event.error.message })}\n\n`));
    }
  } catch {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", text: "OpenAI stream parse error." })}\n\n`));
  }
}

function normalizeChatCompletionsStream(body: ReadableStream<Uint8Array>, cors: HeadersInit): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneSent = false;

  const stream = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          emitChatCompletionsBlock(block, controller, encoder, () => {
            doneSent = true;
          });
        }
      },
      flush(controller) {
        if (buffer.trim()) {
          emitChatCompletionsBlock(buffer, controller, encoder, () => {
            doneSent = true;
          });
        }

        if (!doneSent) {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        }
      }
    })
  );

  return new Response(stream, {
    status: 200,
    headers: {
      ...cors,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache"
    }
  });
}

function emitChatCompletionsBlock(
  block: string,
  controller: TransformStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  markDone: () => void
) {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");

  if (!data || data === "[DONE]") {
    if (!data) return;
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    markDone();
    return;
  }

  try {
    const event = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>; error?: { message?: string } };
    const text = event.choices?.map((choice) => choice.delta?.content || "").join("") || "";
    if (text) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`));
    }

    if (event.choices?.some((choice) => choice.finish_reason)) {
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      markDone();
    }

    if (event.error?.message) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", text: event.error.message })}\n\n`));
    }
  } catch {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", text: "OpenCode stream parse error." })}\n\n`));
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function systemPromptFor(body: ChatRequest): string {
  const base = body.system || clickySystemPrompt;
  const computerUseInstruction = body.computerUseEnabled
    ? "\n\nComputer use is enabled for this request, but only safe open_url and visual point actions are allowed. Never click, type, submit, delete, purchase, install, run shell commands, or alter files."
    : "";
  return body.responseMode === "quick" ? `${base}${computerUseInstruction}\n\n${quickResponseInstruction}` : `${base}${computerUseInstruction}`;
}

function maxOutputTokensFor(body: ChatRequest): number {
  return body.responseMode === "quick" ? 120 : 1200;
}

function parseProviderError(body: string): { status?: string; message?: string } {
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
    return {};
  }
}

function json(value: unknown, status: number, cors: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...cors,
      "content-type": "application/json; charset=utf-8"
    }
  });
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
    "Vary": "Origin"
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
