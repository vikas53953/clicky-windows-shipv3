import type { ChatRequest, WorkerEnv } from "../types";
import { normalizeChatCompletionsStream, normalizeOpenAiStream } from "../utils/sse";
import { maxOutputTokensFor, normalizedConversationMessages, screenshotLabel, supportsImageInput, systemPromptFor } from "../utils/text";
import { trimTrailingSlash } from "../utils/http";
import { buildOpenAiInput } from "./openai";

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
  const upstream = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": env.OPENCODE_API_KEY || ""
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPromptFor(body) }]
      },
      contents: buildGeminiContents(body),
      generationConfig: {
        maxOutputTokens: Math.max(maxOutputTokensFor(body), 512)
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

  return normalizeGeminiStream(upstream.body, cors);
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

function buildGeminiContents(body: ChatRequest): unknown[] {
  const contents = normalizedConversationMessages(body).map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }]
  }));
  const parts: unknown[] = [{ text: body.transcript || "Help me with what is visible on my screen." }];
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

function normalizeGeminiStream(stream: ReadableStream<Uint8Array>, cors: HeadersInit): Response {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const normalized = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || "";

      for (const block of blocks) {
        emitGeminiBlock(block, controller, encoder);
      }
    },
    flush(controller) {
      if (buffer.trim()) {
        emitGeminiBlock(buffer, controller, encoder);
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    }
  });

  return new Response(stream.pipeThrough(normalized), {
    headers: {
      ...cors,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache"
    }
  });
}

function emitGeminiBlock(block: string, controller: TransformStreamDefaultController<Uint8Array>, encoder: TextEncoder): void {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  if (!data || data === "[DONE]") return;

  try {
    const event = JSON.parse(data) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };
    const text = event.candidates?.flatMap((candidate) => candidate.content?.parts || []).map((part) => part.text || "").join("") || "";
    if (text) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`));
    }
  } catch {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", text: "Gemini stream returned an invalid event." })}\n\n`));
  }
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
