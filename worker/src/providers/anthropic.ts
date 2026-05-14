import type { ChatRequest, WorkerEnv } from "../types";
import { normalizeAnthropicStream } from "../utils/sse";
import { maxOutputTokensFor, normalizedConversationMessages, screenshotLabel, systemPromptFor } from "../utils/text";

export async function anthropicChat(body: ChatRequest, env: WorkerEnv, cors: HeadersInit): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "Anthropic is not configured." }), {
      status: 503,
      headers: { ...cors, "content-type": "application/json; charset=utf-8" }
    });
  }

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
      messages: buildAnthropicMessages(body)
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

  const screenshots = body.screenshots || [];
  for (let i = 0; i < screenshots.length; i += 1) {
    const screenshot = screenshots[i];
    content.push({
      type: "text",
      text: screenshotLabel(screenshot, i, screenshots.length)
    });
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
