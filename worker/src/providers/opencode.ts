import type { ChatRequest, WorkerEnv } from "../types";
import { normalizeChatCompletionsStream, normalizeOpenAiStream } from "../utils/sse";
import { maxOutputTokensFor, normalizedConversationMessages, supportsImageInput, systemPromptFor } from "../utils/text";
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
  const mode = resolveOpenCodeMode(body, env);
  const baseUrl = resolveOpenCodeBaseUrl(env);

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

function resolveOpenCodeBaseUrl(env: WorkerEnv): string {
  if (env.OPENCODE_BASE_URL?.trim()) return trimTrailingSlash(env.OPENCODE_BASE_URL.trim());
  return "https://opencode.ai/zen/v1";
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
