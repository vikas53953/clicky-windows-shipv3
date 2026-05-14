import type { InternetToolResult } from "../types";
import { normalizePlainText, truncate } from "../utils/text";

export function extractFirstUrl(text: string): string {
  return text.match(/https?:\/\/[^\s)]+/i)?.[0] || "";
}

export async function resolveUrlTool(rawUrl: string): Promise<InternetToolResult> {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return { type: "url", status: "error", error: "Unsupported URL protocol." };
    const response = await fetch(url.toString(), { headers: { Accept: "text/html,text/plain,application/json" } });
    if (!response.ok) return { type: "url", status: "error", error: `URL fetch failed with HTTP ${response.status}.` };
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    const title = contentType.includes("html") ? text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] : "";
    const plain = text.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
    return {
      type: "url",
      status: "ok",
      source: url.toString(),
      summary: `${title ? `${normalizePlainText(title)}: ` : ""}${truncate(normalizePlainText(plain), 900)}`
    };
  } catch (error) {
    return {
      type: "url",
      status: "error",
      error: error instanceof Error ? error.message : "URL lookup failed."
    };
  }
}
