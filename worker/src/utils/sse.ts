export function sse(chunks: string[], cors: HeadersInit): Response {
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

export function normalizeOpenAiStream(body: ReadableStream<Uint8Array>, cors: HeadersInit): Response {
  return normalizeProviderStream(body, cors, emitOpenAiBlock);
}

export function normalizeAnthropicStream(body: ReadableStream<Uint8Array>, cors: HeadersInit): Response {
  return normalizeProviderStream(body, cors, emitAnthropicBlock);
}

export function normalizeChatCompletionsStream(body: ReadableStream<Uint8Array>, cors: HeadersInit): Response {
  return normalizeProviderStream(body, cors, emitChatCompletionsBlock);
}

type BlockEmitter = (
  block: string,
  controller: TransformStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  markDone: () => void
) => void;

function normalizeProviderStream(body: ReadableStream<Uint8Array>, cors: HeadersInit, emitBlock: BlockEmitter): Response {
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
          emitBlock(block, controller, encoder, () => {
            doneSent = true;
          });
        }
      },
      flush(controller) {
        if (buffer.trim()) {
          emitBlock(buffer, controller, encoder, () => {
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

function sseData(block: string): string {
  return block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
}

function emitDone(controller: TransformStreamDefaultController<Uint8Array>, encoder: TextEncoder, markDone: () => void) {
  controller.enqueue(encoder.encode("data: [DONE]\n\n"));
  markDone();
}

function emitError(controller: TransformStreamDefaultController<Uint8Array>, encoder: TextEncoder, text: string) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", text })}\n\n`));
}

function emitOpenAiBlock(block: string, controller: TransformStreamDefaultController<Uint8Array>, encoder: TextEncoder, markDone: () => void) {
  const data = sseData(block);
  if (!data || data === "[DONE]") {
    if (data) emitDone(controller, encoder, markDone);
    return;
  }

  try {
    const event = JSON.parse(data) as { type?: string; delta?: string; error?: { message?: string } };
    if (event.type === "response.output_text.delta" && event.delta) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: event.delta })}\n\n`));
    }
    if (event.type === "response.completed") emitDone(controller, encoder, markDone);
    if (event.type === "response.error" && event.error?.message) emitError(controller, encoder, event.error.message);
  } catch {
    emitError(controller, encoder, "OpenAI stream parse error.");
  }
}

function emitAnthropicBlock(block: string, controller: TransformStreamDefaultController<Uint8Array>, encoder: TextEncoder, markDone: () => void) {
  const data = sseData(block);
  if (!data || data === "[DONE]") {
    if (data) emitDone(controller, encoder, markDone);
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
    if (event.type === "message_stop") emitDone(controller, encoder, markDone);
    if (event.type === "error" && event.error?.message) emitError(controller, encoder, event.error.message);
  } catch {
    emitError(controller, encoder, "Anthropic stream parse error.");
  }
}

function emitChatCompletionsBlock(block: string, controller: TransformStreamDefaultController<Uint8Array>, encoder: TextEncoder, markDone: () => void) {
  const data = sseData(block);
  if (!data || data === "[DONE]") {
    if (data) emitDone(controller, encoder, markDone);
    return;
  }

  try {
    const event = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>; error?: { message?: string } };
    const text = event.choices?.map((choice) => choice.delta?.content || "").join("") || "";
    if (text) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`));
    }
    if (event.choices?.some((choice) => choice.finish_reason)) emitDone(controller, encoder, markDone);
    if (event.error?.message) emitError(controller, encoder, event.error.message);
  } catch {
    emitError(controller, encoder, "OpenCode stream parse error.");
  }
}
