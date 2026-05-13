export type DesktopToolName = "open_url" | "point";

export interface DesktopToolCall {
  name: DesktopToolName;
  args: Record<string, unknown>;
}

export interface ParsedDesktopTools {
  cleanText: string;
  toolCalls: DesktopToolCall[];
}

const completeToolPattern = /<CLICKY_TOOL>([\s\S]*?)<\/CLICKY_TOOL>/gi;
const incompleteToolPattern = /<CLICKY_TOOL>[\s\S]*$/i;
const allowedToolNames = new Set<DesktopToolName>(["open_url", "point"]);

export function parseDesktopToolBlocks(text: string): ParsedDesktopTools {
  const toolCalls: DesktopToolCall[] = [];
  const cleanText = text.replace(completeToolPattern, (_match, rawJson) => {
    const parsed = parseToolJson(String(rawJson));
    if (parsed) toolCalls.push(parsed);
    return "";
  });

  return {
    cleanText: normalizeWhitespace(cleanText.replace(incompleteToolPattern, "")),
    toolCalls: toolCalls.slice(0, 2)
  };
}

export function userExplicitlyRequestedComputerUse(transcript: string): boolean {
  return /\b(open|launch|go to|visit|browse|show me|point|where|find)\b/i.test(transcript);
}

export async function executeDesktopToolCalls(input: {
  toolCalls: DesktopToolCall[];
  transcript: string;
  computerUseEnabled: boolean;
  onStatus?: (message: string) => void;
}): Promise<string[]> {
  if (!input.computerUseEnabled || !userExplicitlyRequestedComputerUse(input.transcript)) return [];

  const results: string[] = [];
  for (const toolCall of input.toolCalls) {
    if (toolCall.name === "open_url") {
      const url = normalizePublicUrl(toolCall.args.url);
      if (!url) {
        results.push("Skipped open_url because the URL was not public http/https.");
        continue;
      }

      await openUrl(url);
      const message = `Opened ${url}.`;
      input.onStatus?.(message);
      results.push(message);
    }

    if (toolCall.name === "point") {
      results.push("Point action was converted into visual guidance.");
    }
  }

  return results;
}

function parseToolJson(rawJson: string): DesktopToolCall | null {
  try {
    const value = JSON.parse(rawJson.trim()) as { name?: string; args?: Record<string, unknown> };
    const name = value.name as DesktopToolName;
    if (!allowedToolNames.has(name)) return null;
    return { name, args: value.args && typeof value.args === "object" ? value.args : {} };
  } catch {
    return null;
  }
}

function normalizePublicUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

async function openUrl(url: string): Promise<void> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const { openUrl: openNativeUrl } = await import("@tauri-apps/plugin-opener");
    await openNativeUrl(url);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
