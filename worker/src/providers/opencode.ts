import type { ChatRequest, WorkerEnv } from "../types";
import { normalizeChatCompletionsStream, normalizeOpenAiStream } from "../utils/sse";
import { maxOutputTokensFor, normalizedConversationMessages, screenshotLabel, supportsImageInput, systemPromptFor } from "../utils/text";
import { trimTrailingSlash } from "../utils/http";
import { buildOpenAiInput } from "./openai";
import { executeComputerUseTask, isConfirmedComputerTask } from "../tools/computer";
import { resolveSearchTool } from "../tools/search";
import { resolveTimeTool, timezoneHint } from "../tools/time";
import { resolveWeatherTools } from "../tools/weather";

export async function openCodeChat(body: ChatRequest, env: WorkerEnv, cors: HeadersInit): Promise<Response> {
  if (!env.OPENCODE_API_KEY) {
    return new Response(JSON.stringify({ error: "OpenCode is not configured." }), {
      status: 503,
      headers: { ...cors, "content-type": "application/json; charset=utf-8" }
    });
  }

  const model = resolveOpenCodeModel(body, env);
  const baseUrl = resolveOpenCodeBaseUrl(env);

  if (isGeminiModel(model)) {
    return openCodeGemini(body, env, cors, baseUrl, model);
  }

  const mode = resolveOpenCodeMode(body, env);
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

async function openCodeGemini(body: ChatRequest, env: WorkerEnv, cors: HeadersInit, baseUrl: string, model: string): Promise<Response> {
  const startedAt = Date.now();
  const upstream = await fetchGeminiStream(baseUrl, model, env, buildGeminiRequest(body, env, true));

  if (!upstream.body || !upstream.ok) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...cors,
        "content-type": upstream.headers.get("content-type") || "application/json"
      }
    });
  }

  return streamGeminiWithTools(upstream.body, body, env, cors, baseUrl, model, startedAt);
}

async function fetchGeminiStream(baseUrl: string, model: string, env: WorkerEnv, payload: unknown): Promise<Response> {
  return fetch(`${baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": env.OPENCODE_API_KEY || ""
    },
    body: JSON.stringify(payload)
  });
}

function buildGeminiRequest(
  body: ChatRequest,
  env: WorkerEnv,
  includeTools: boolean,
  followUpParts: Array<GeminiFunctionCallPart | { functionResponse?: unknown }> = [],
  toolMode: "AUTO" | "NONE" = "AUTO"
): unknown {
  const contents = buildGeminiContents(body);
  if (followUpParts.length) {
    const functionCalls = followUpParts.filter((part): part is GeminiFunctionCallPart => Boolean((part as GeminiFunctionCallPart).functionCall));
    const functionResponses = followUpParts.filter((part): part is { functionResponse: unknown } => "functionResponse" in part && Boolean(part.functionResponse));
    if (functionCalls.length) contents.push({ role: "model", parts: functionCalls });
    if (functionResponses.length) {
      contents.push({
        role: "user",
        parts: [
          ...functionResponses,
          {
            text:
              "answer the user's original question now. use only the tool result above for current facts. if the result is incomplete or uncertain, say what the tool found instead of using older memory. keep it short and append [POINT:none]."
          }
        ]
      });
    }
  }

  return {
    systemInstruction: {
      parts: [{ text: geminiSystemPromptFor(body) }]
    },
    contents,
    ...(includeTools ? { tools: geminiToolDeclarations(body), toolConfig: geminiToolConfig(toolMode) } : {}),
    generationConfig: {
      maxOutputTokens: Math.max(maxOutputTokensFor(body), 512),
      thinkingConfig: {
        thinkingLevel: thinkingLevelFor(body)
      }
    }
  };
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

function resolveOpenCodeModel(body: ChatRequest, env: WorkerEnv): string {
  if (env.OPENCODE_MODEL?.trim()) return env.OPENCODE_MODEL.trim();

  const requested = body.model?.trim();
  if (requested) return requested;

  return "gemini-3-flash";
}

function resolveOpenCodeMode(body: ChatRequest, env: WorkerEnv): "responses" | "chat_completions" {
  const requested = env.OPENCODE_API_MODE?.trim().toLowerCase();
  if (requested === "chat_completions" || requested === "chat-completions") return "chat_completions";
  if (requested === "responses") return "responses";

  const model = resolveOpenCodeModel(body, env);
  return model.startsWith("gpt-") ? "responses" : "chat_completions";
}

function resolveOpenCodeBaseUrl(env: WorkerEnv): string {
  if (env.OPENCODE_BASE_URL?.trim()) return trimTrailingSlash(env.OPENCODE_BASE_URL.trim());
  return "https://opencode.ai/zen/v1";
}

function isGeminiModel(model: string): boolean {
  return model.toLowerCase().startsWith("gemini-");
}

function thinkingLevelFor(_body: ChatRequest): "minimal" {
  return "minimal";
}

function geminiSystemPromptFor(body: ChatRequest): string {
  const computerUseInstruction = body.computerUseEnabled
    ? "\n- when the user asks you to control the desktop, call computer_use with the full task. the worker will pause for user confirmation before executing it, so do not answer as if you completed the action yourself."
    : "";

  return `${systemPromptFor(body)}

tool use:
- you have web_search, get_current_time, and get_weather when the user asks for facts that may have changed, live data, current versions, launches, sports, weather, time, prices, or news.
- for those current facts, call the right tool first. do not answer current facts from memory.
- after a tool result, base current facts only on the tool result. if the tool result is incomplete, say what it found instead of filling gaps from older memory.
- do not use web_search for stable knowledge, simple math, casual greetings, or visible-screen questions unless the user asks for current outside information too.
- computer_use is available only when declared in this request.${computerUseInstruction}
- after a tool result, answer naturally in clicky's voice and append one [POINT] tag.`;
}

function geminiToolConfig(mode: "AUTO" | "NONE"): unknown {
  return {
    functionCallingConfig: {
      mode
    }
  };
}

function geminiToolDeclarations(body: ChatRequest): unknown[] {
  const functionDeclarations: unknown[] = [
        {
          name: "web_search",
          description:
            "Search the web for current events, news, product launches, sports scores, or any information that may have changed since your training data. Use this whenever you are not certain your information is current.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "search query" }
            },
            required: ["query"]
          }
        },
        {
          name: "get_current_time",
          description: "Get the current date and time in the user's timezone.",
          parameters: {
            type: "object",
            properties: {},
            required: []
          }
        },
        {
          name: "get_weather",
          description: "Get current weather for a location.",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string", description: "city or place" }
            },
            required: ["location"]
          }
        }
  ];

  if (body.computerUseEnabled) {
    functionDeclarations.push({
      name: "computer_use",
      description:
        "Control the user's computer to complete tasks after explicit user confirmation. Use this when the user asks you to open apps, click things, type text, navigate websites, fill forms, or perform a multi-step desktop workflow.",
      parameters: {
        type: "object",
        properties: {
          task: {
            type: "string",
            description: "The full task to accomplish, e.g. open Chrome, go to x.com, and post a tweet saying hello."
          }
        },
        required: ["task"]
      }
    });
  }

  return [
    {
      functionDeclarations
    }
  ];
}

function buildGeminiContents(body: ChatRequest): unknown[] {
  const conversation = normalizedConversationMessages(body);
  const contents = conversation.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }]
  }));
  const recentMemory = conversation
    .slice(-6)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
  const currentPrompt = `${body.transcript || "Help me with what is visible on my screen."}${
    recentMemory
      ? `\n\nrecent conversation, verbatim. use this for recall questions and do not invent details:\n${recentMemory}`
      : ""
  }`;
  const parts: unknown[] = [{ text: currentPrompt }];
  const screenshots = body.screenshots || [];

  for (let i = 0; i < screenshots.length; i += 1) {
    const screenshot = screenshots[i];
    parts.push({ text: screenshotLabel(screenshot, i, screenshots.length) });
    parts.push({
      inlineData: {
        mimeType: screenshot.mediaType,
        data: screenshot.base64
      }
    });
  }

  return [...contents, { role: "user", parts }];
}

function streamGeminiWithTools(
  stream: ReadableStream<Uint8Array>,
  body: ChatRequest,
  env: WorkerEnv,
  cors: HeadersInit,
  baseUrl: string,
  model: string,
  startedAt: number
): Response {
  const encoder = new TextEncoder();
  const output = new TransformStream<Uint8Array, Uint8Array>();
  const writer = output.writable.getWriter();

  void (async () => {
    try {
      const first = await forwardGeminiStream(stream, writer, false);
      console.info(`[clicky-gemini] first_pass_ms=${Date.now() - startedAt} tool_calls=${first.functionCallParts.length}`);
      if (first.functionCallParts.length) {
        const computerUsePart = first.functionCallParts.find((part) => part.functionCall.name === "computer_use");
        if (computerUsePart) {
          const task = stringArg(computerUsePart.functionCall.args, "task") || body.transcript || "";
          if (!body.computerUseEnabled) {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: "computer control is turned off. enable tools first, then ask again. [POINT:none]" })}\n\n`));
            await writer.write(encoder.encode("data: [DONE]\n\n"));
            return;
          }

          if (!body.computerUseConfirmed || !isConfirmedComputerTask(task, body.confirmedComputerTask)) {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "action_status", text: `Waiting for confirmation: ${task}` })}\n\n`));
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "computer_use_confirmation", task })}\n\n`));
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: `i can do that after you confirm: ${task}. [POINT:none]` })}\n\n`));
            await writer.write(encoder.encode("data: [DONE]\n\n"));
            return;
          }

          await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "action_status", text: "Connecting to local Cua computer server..." })}\n\n`));
          await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "action_status", text: `Running: ${task}` })}\n\n`));
          const result = await executeComputerUseTask(task, env);
          await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "action_status", text: result.summary })}\n\n`));
          await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: cleanGeminiSpeech(result.speech) })}\n\n`));
          await writer.write(encoder.encode("data: [DONE]\n\n"));
          return;
        }

        const toolResults = await executeGeminiFunctionCalls(
          first.functionCallParts.map((part) => part.functionCall),
          body,
          env
        );
        const directSpeech = toolResults.map((result) => result.directSpeech).filter(Boolean).join(" ");
        if (directSpeech) {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: cleanGeminiSpeech(directSpeech) })}\n\n`));
          console.info(`[clicky-gemini] tool_direct_answer_ms=${Date.now() - startedAt}`);
        } else {
        const followUpParts = [
          ...first.functionCallParts,
          ...toolResults.map((result) => ({ functionResponse: result.functionResponse }))
        ];
        const followUp = await fetchGeminiStream(baseUrl, model, env, buildGeminiRequest(body, env, true, followUpParts, "NONE"));
        if (!followUp.ok || !followUp.body) {
          const upstreamError = await safeUpstreamError(followUp);
          console.info(`[clicky-gemini] tool_followup_failed status=${followUp.status} error=${upstreamError}`);
          await writer.write(
            encoder.encode(`data: ${JSON.stringify({ type: "error", text: `Gemini tool follow-up failed with HTTP ${followUp.status}. ${upstreamError}`.trim() })}\n\n`)
          );
        } else {
          const final = await forwardGeminiStream(followUp.body, writer, false);
          if (final.text) {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: cleanGeminiSpeech(final.text) })}\n\n`));
          }
          console.info(`[clicky-gemini] tool_followup_done_ms=${Date.now() - startedAt}`);
        }
        }
      } else if (first.text) {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: cleanGeminiSpeech(first.text) })}\n\n`));
      }
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } catch {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "error", text: "Gemini stream failed while using tools." })}\n\n`));
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } finally {
      await writer.close();
    }
  })();

  return new Response(output.readable, {
    headers: {
      ...cors,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache"
    }
  });
}

function cleanGeminiSpeech(value: string): string {
  const point = value.match(/\s*(\[POINT:[^\]]+\])\s*$/i)?.[1] || "";
  let spoken = point ? value.replace(/\s*\[POINT:[^\]]+\]\s*$/i, "") : value;
  spoken = spoken
    .replace(/\s*\(this is a system prompt hidden from the user\)\s*/gi, " ")
    .replace(/^think\s*\r?\n\s*/i, "")
    .replace(/\s*let me know if [^.?!]*(?:[.?!]|$)/gi, "")
    .replace(/\s*if you want,?\s+i can[^.?!]*(?:[.?!]|$)/gi, "")
    .replace(/\s*would you like me to[^.?!]*(?:[.?!]|$)/gi, "")
    .replace(/\s*i can help with [^.?!]*(?:[.?!]|$)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const tag = point || "[POINT:none]";
  return `${spoken} ${tag}`.trim();
}

async function safeUpstreamError(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.replace(/\s+/g, " ").slice(0, 500);
  } catch {
    return "";
  }
}

async function forwardGeminiStream(
  stream: ReadableStream<Uint8Array>,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  emitText: boolean
): Promise<{ text: string; functionCallParts: GeminiFunctionCallPart[] }> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let text = "";
  const functionCallParts: GeminiFunctionCallPart[] = [];

  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";

    for (const block of blocks) {
      const event = parseGeminiBlock(block);
      if (!event) continue;
      functionCallParts.push(...event.functionCallParts);
      text += event.text;
      if (emitText && event.text) {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: event.text })}\n\n`));
      }
    }
  }

  if (buffer.trim()) {
    const event = parseGeminiBlock(buffer);
    if (event) {
      functionCallParts.push(...event.functionCallParts);
      text += event.text;
      if (emitText && event.text) {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: event.text })}\n\n`));
      }
    }
  }

  return { text, functionCallParts };
}

function parseGeminiBlock(block: string): { text: string; functionCallParts: GeminiFunctionCallPart[] } | null {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  if (!data || data === "[DONE]") return null;

  try {
    const event = JSON.parse(data) as {
      candidates?: Array<{
        content?: {
          parts?: GeminiPart[];
        };
      }>;
    };
    const parts = event.candidates?.flatMap((candidate) => candidate.content?.parts || []) || [];
    return {
      text: parts.map((part) => part.text || "").join(""),
      functionCallParts: parts
        .filter((part): part is GeminiPart & { functionCall: GeminiFunctionCall } => Boolean(part.functionCall?.name))
        .map((part) => ({
          functionCall: part.functionCall,
          ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
          ...(part.thought_signature ? { thoughtSignature: part.thought_signature } : {})
        }))
    };
  } catch {
    return { text: "", functionCallParts: [] };
  }
}

interface GeminiPart {
  text?: string;
  functionCall?: GeminiFunctionCall;
  thoughtSignature?: string;
  thought_signature?: string;
}

interface GeminiFunctionCallPart {
  functionCall: GeminiFunctionCall;
  thoughtSignature?: string;
}

interface GeminiFunctionCall {
  name: string;
  args?: Record<string, unknown>;
}

interface GeminiToolExecution {
  functionResponse: unknown;
  directSpeech?: string;
}

async function executeGeminiFunctionCalls(functionCalls: GeminiFunctionCall[], body: ChatRequest, env: WorkerEnv): Promise<GeminiToolExecution[]> {
  const responses: GeminiToolExecution[] = [];
  for (const call of functionCalls.slice(0, 3)) {
    const result = await executeGeminiFunctionCall(call, body, env);
    responses.push({ functionResponse: { name: call.name, response: result.response }, directSpeech: result.directSpeech });
  }
  return responses;
}

async function executeGeminiFunctionCall(call: GeminiFunctionCall, body: ChatRequest, env: WorkerEnv): Promise<{ response: unknown; directSpeech?: string }> {
  console.info(`[clicky-tool] gemini function_call ${call.name}`);
  if (call.name === "web_search") {
    const query = stringArg(call.args, "query") || body.transcript || "";
    const result = await resolveSearchTool(query);
    const response = {
      tool: "web_search",
      query,
      status: result.status,
      source: result.source || "",
      summary: result.summary || result.error || "No reliable search result was found."
    };
    return { response, directSpeech: result.directAnswer };
  }

  if (call.name === "get_current_time") {
    const result = resolveTimeTool(timezoneHint(body.timezone, env));
    return { response: { tool: "get_current_time", status: result.status, source: result.source || "", summary: result.summary || "No time result was found." } };
  }

  if (call.name === "get_weather") {
    const location = stringArg(call.args, "location");
    if (!location) return { response: { tool: "get_weather", status: "needs_location", summary: "The user asked for weather but no location was provided." } };
    const results = await resolveWeatherTools(`weather in ${location}`, env);
    return {
      response: {
        tool: "get_weather",
        location,
        results: results.map((result) => ({
          status: result.status,
          source: result.source || "",
          summary: result.summary || result.error || "No weather result was found."
        }))
      }
    };
  }

  return { response: { tool: call.name, error: "Unknown Clicky tool." } };
}

function stringArg(args: Record<string, unknown> | undefined, key: string): string {
  const value = args?.[key];
  return typeof value === "string" ? value.trim() : "";
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
    const screenshots = body.screenshots || [];
    for (let i = 0; i < screenshots.length; i += 1) {
      const screenshot = screenshots[i];
      content.push({
        type: "text",
        text: screenshotLabel(screenshot, i, screenshots.length)
      });
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
