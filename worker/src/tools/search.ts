import type { InternetToolResult } from "../types";
import { firstMatch, normalizePlainText, truncate } from "../utils/text";

export function hasSearchIntent(text: string): boolean {
  return /\b(search|look up|lookup|browse|internet|web|latest|news|find out|what happened|who is|what is)\b/i.test(text);
}

export async function resolveSearchTool(transcript: string): Promise<InternetToolResult> {
  const query = cleanSearchQuery(transcript);
  if (!query) return { type: "search", status: "no_answer" };

  try {
    const searchUrl = new URL("https://api.duckduckgo.com/");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("no_html", "1");
    searchUrl.searchParams.set("skip_disambig", "1");

    const response = await fetch(searchUrl.toString(), { headers: { Accept: "application/json" } });
    if (!response.ok) return { type: "search", status: "error", error: `Search failed with HTTP ${response.status}.` };
    const payload = (await response.json()) as {
      Heading?: string;
      Answer?: string;
      AbstractText?: string;
      AbstractURL?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
    };
    const summary = payload.Answer || payload.AbstractText || payload.RelatedTopics?.find((topic) => topic.Text)?.Text || "";
    if (!summary) {
      const fallback = await resolveDuckDuckGoHtmlSearch(query);
      if (fallback) return fallback;
      const newsFallback = await resolveNewsRssSearch(query);
      if (newsFallback) return newsFallback;
      return { type: "search", status: "no_answer", source: "DuckDuckGo Instant Answer" };
    }

    return {
      type: "search",
      status: "ok",
      source: payload.AbstractURL || payload.RelatedTopics?.find((topic) => topic.FirstURL)?.FirstURL || "DuckDuckGo Instant Answer",
      summary: `${payload.Heading ? `${payload.Heading}: ` : ""}${truncate(summary, 700)}`
    };
  } catch (error) {
    return {
      type: "search",
      status: "error",
      error: error instanceof Error ? error.message : "Search lookup failed."
    };
  }
}

async function resolveDuckDuckGoHtmlSearch(query: string): Promise<InternetToolResult | null> {
  const searchUrl = new URL("https://html.duckduckgo.com/html/");
  searchUrl.searchParams.set("q", query);

  const response = await fetch(searchUrl.toString(), {
    headers: {
      Accept: "text/html",
      "User-Agent": "ClickyWindows/0.1"
    }
  });
  if (!response.ok) return null;

  const html = await response.text();
  const title = normalizePlainText(firstMatch(html, /<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*>([\s\S]*?)<\/a>/i));
  const snippet = normalizePlainText(firstMatch(html, /<a[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/i));
  const href = normalizePlainText(firstMatch(html, /<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["']/i));
  const summary = [title, snippet].filter(Boolean).join(": ");
  if (!summary) return null;

  return {
    type: "search",
    status: "ok",
    source: href || "DuckDuckGo Search",
    summary: truncate(summary, 700)
  };
}

async function resolveNewsRssSearch(query: string): Promise<InternetToolResult | null> {
  const searchUrl = new URL("https://news.google.com/rss/search");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("hl", "en-IN");
  searchUrl.searchParams.set("gl", "IN");
  searchUrl.searchParams.set("ceid", "IN:en");

  const response = await fetch(searchUrl.toString(), {
    headers: {
      Accept: "application/rss+xml,text/xml,application/xml"
    }
  });
  if (!response.ok) return null;

  const xml = await response.text();
  const item = firstMatch(xml, /<item>([\s\S]*?)<\/item>/i);
  if (!item) return null;

  const title = normalizePlainText(firstMatch(item, /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i));
  const description = normalizePlainText(firstMatch(item, /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i));
  const source = normalizePlainText(firstMatch(item, /<link>([\s\S]*?)<\/link>/i)) || searchUrl.toString();
  const summary = [title, description].filter(Boolean).join(": ");
  if (!summary) return null;

  return {
    type: "search",
    status: "ok",
    source,
    summary: truncate(summary, 700)
  };
}

function cleanSearchQuery(text: string): string {
  return text
    .replace(/\b(clicky|please|can you|could you|tell me|show me)\b/gi, " ")
    .replace(/\b(search|look up|lookup|browse|internet|web|latest|news|find out)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/[?.!,]+$/g, "")
    .trim();
}
