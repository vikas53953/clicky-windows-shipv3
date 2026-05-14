import type { ChatRequest, ConversationMessage } from "../types";

export const clickySystemPrompt = `you're clicky, a friendly screen companion that lives beside the user's cursor. the user just spoke to you with push-to-talk and you can see their screen when screenshots are provided. your reply will be spoken aloud, so write the way you would actually talk.

default to one or two short sentences. be direct and dense. if the user asks you to explain more, go deeper, or elaborate, then give a fuller explanation.

write for the ear, not the eye. use lowercase, casual, warm language. no emojis. no markdown. no bullets. no numbered lists. never say "simply" or "just".

do not read code verbatim. describe what it does or what needs to change conversationally.

when pointing helps, append one hidden coordinate tag at the very end of your response, after the spoken text:
[POINT:x,y:short label]

if the element is on a different screen, use:
[POINT:x,y:short label:screenN]

coordinates must be integer pixel coordinates in the screenshot coordinate space. if pointing would not help, append [POINT:none].

do not claim to see anything that is not visible. do not ask for secrets, passwords, or private data. if the user asks for unsafe or destructive actions, warn them and suggest a safer path.

do not end with dead yes/no questions like "want me to explain more?" when it fits naturally, plant a seed instead: mention the next useful move, a related concept, or a better technique they could try next.`;

const quickResponseInstruction =
  "this is a quick voice check or conversational prompt. reply in one short, natural sentence. append [POINT:none].";

export function systemPromptFor(body: ChatRequest): string {
  const base = body.system || clickySystemPrompt;
  const computerUseInstruction = body.computerUseEnabled
    ? "\n\ncomputer use may be enabled later, but for this response you should guide and point only. do not claim you clicked, typed, submitted, purchased, installed, ran shell commands, or changed files."
    : "";
  return body.responseMode === "quick" ? `${base}${computerUseInstruction}\n\n${quickResponseInstruction}` : `${base}${computerUseInstruction}`;
}

export function maxOutputTokensFor(body: ChatRequest): number {
  return body.responseMode === "quick" ? 120 : 1200;
}

export function normalizedConversationMessages(body: ChatRequest): ConversationMessage[] {
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

export function supportsImageInput(provider: string, model: string): boolean {
  const requested = `${provider} ${model}`.toLowerCase();
  if (requested.includes("minimax") || requested.includes("m2.7") || requested.includes("m2-7")) return false;
  if (requested.includes("kimi") || requested.includes("moonshot")) return false;
  return /gpt|claude|vision|vl|multimodal|gemini|qwen-vl|pixtral/.test(requested);
}

export function normalizePlainText(value: string): string {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function firstMatch(value: string, pattern: RegExp): string {
  return value.match(pattern)?.[1] || "";
}

export function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trim()}...`;
}

export function parseProviderError(body: string): { status?: string; message?: string } {
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
