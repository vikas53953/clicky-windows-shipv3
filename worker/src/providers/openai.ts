import type { ChatRequest, WorkerEnv } from "../types";
import { normalizeOpenAiStream } from "../utils/sse";
import { maxOutputTokensFor, normalizedConversationMessages, screenshotLabel, supportsImageInput, systemPromptFor } from "../utils/text";

export async function openAiChat(body: ChatRequest, env: WorkerEnv, cors: HeadersInit): Promise<Response> {
  if (!env.OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "OpenAI is not configured." }), {
      status: 503,
      headers: { ...cors, "content-type": "application/json; charset=utf-8" }
    });
  }

  const model = resolveOpenAiModel(body, env);
  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      instructions: systemPromptFor(body),
      input: buildOpenAiInput(body, "openai", model),
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

export function resolveOpenAiModel(body: ChatRequest, env: WorkerEnv): string {
  if (env.OPENAI_MODEL?.trim()) return env.OPENAI_MODEL.trim();

  const requested = body.model?.trim();
  if (requested && /^(gpt-|o[0-9]|chatgpt)/i.test(requested)) {
    return requested;
  }

  return "gpt-5";
}

export function buildOpenAiInput(body: ChatRequest, provider = body.provider || "", resolvedModel = body.model || ""): unknown[] {
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
    const screenshots = body.screenshots || [];
    for (let i = 0; i < screenshots.length; i += 1) {
      const screenshot = screenshots[i];
      content.push({
        type: "input_text",
        text: screenshotLabel(screenshot, i, screenshots.length)
      });
      content.push({
        type: "input_image",
        image_url: `data:${screenshot.mediaType};base64,${screenshot.base64}`
      });
    }
  }

  return [...normalizedConversationMessages(body).map((message) => ({ role: message.role, content: message.content })), { role: "user", content }];
}
