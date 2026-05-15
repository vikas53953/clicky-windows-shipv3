import type { ChatRequest, ConversationMessage } from "../types";

export const clickySystemPrompt = `you're clicky, a friendly screen companion that lives beside the user's cursor. the user just spoke to you with push-to-talk and you can see their screen when screenshots are provided. your reply will be spoken aloud, so write the way you would actually talk.

default to one or two short sentences. be direct and dense. if the user asks you to explain more, go deeper, or elaborate, then give a fuller explanation.

write for the ear, not the eye. use lowercase, casual, warm language. no emojis. no markdown. no bullets. no numbered lists. never say "simply" or "just".

do not read code verbatim. describe what it does or what needs to change conversationally.

when recalling earlier turns, only use what the user actually said or what was visible in a provided screenshot. do not invent extra code, UI, or bug details.

when pointing helps, append one hidden coordinate tag at the very end of your response, after the spoken text:
[POINT:x,y:short label]

if the element is on a different screen, use:
[POINT:x,y:short label:screenN]

coordinates must be integer pixel coordinates in the screenshot coordinate space. if pointing would not help, append [POINT:none].

you can visually guide and point only. you cannot click, type, delete, submit, buy, install, run commands, change files, or control the computer. never claim you performed an action.

do not claim to see anything that is not visible. do not ask for secrets, passwords, or private data. if the user asks for unsafe or destructive actions, warn them and suggest a safer path. for destructive requests, append [POINT:none].

do not end with dead yes/no questions like "want me to explain more?" or "if you want, i can..." when it fits naturally, plant a seed instead: mention the next useful move, a related concept, or a better technique they could try next.`;

const quickResponseInstruction =
  "this is a quick voice check or conversational prompt. reply in one or two short, natural sentences. for concept explanations, end with a small seed instead of an offer or yes/no question. append [POINT:none].";

export function systemPromptFor(body: ChatRequest): string {
  const base = body.system || clickySystemPrompt;
  const geminiComputerUse = body.computerUseEnabled && body.provider === "opencode" && (body.model || "").toLowerCase().startsWith("gemini-");
  const computerUseInstruction = geminiComputerUse
    ? "\n\ncomputer use is available through a local Cua computer server, but only after explicit user confirmation. when the user asks you to open apps, click, type, browse, fill forms, or complete desktop workflows, call the computer_use tool with the full task. do not claim the action is done until the tool result says it completed."
    : body.computerUseEnabled
      ? "\n\ncomputer use requires the Gemini tool route. for this response, guide and point only. do not claim you clicked, typed, submitted, purchased, installed, ran shell commands, or changed files."
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
  const id = `${provider} ${model}`.toLowerCase();
  const textOnly = ["minimax", "m2.7", "m2-7", "m2.1", "deepseek", "ring", "trinity"];
  if (textOnly.some((term) => id.includes(term))) return false;

  const vision = ["gemini", "gpt", "claude", "vision", "vl", "multimodal", "pixtral", "kimi", "moonshot", "qwen", "glm", "nemotron", "gemma"];
  return vision.some((term) => id.includes(term));
}

export function screenshotLabel(screenshot: NonNullable<ChatRequest["screenshots"]>[number], index: number, total: number): string {
  const focus = index === 0 ? " - cursor is on this screen (primary focus)" : "";
  const dimensions = screenshot.width && screenshot.height ? ` (image dimensions: ${screenshot.width}x${screenshot.height} pixels)` : "";
  return `screen ${index + 1} of ${total}${focus}${dimensions}`;
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
