import type { ChatRequest, ConversationMessage } from "../types";

export const clickySystemPrompt = `You are Clicky, a practical Windows desktop tutor that can see the user's current screen only when they explicitly ask for help.

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

export function systemPromptFor(body: ChatRequest): string {
  const base = body.system || clickySystemPrompt;
  const computerUseInstruction = body.computerUseEnabled
    ? "\n\nComputer use is enabled for this request, but only safe open_url and visual point actions are allowed. Never click, type, submit, delete, purchase, install, run shell commands, or alter files."
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
