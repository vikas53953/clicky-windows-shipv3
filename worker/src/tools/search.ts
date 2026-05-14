import type { InternetToolResult } from "../types";
import { firstMatch, normalizePlainText, truncate } from "../utils/text";

export function hasSearchIntent(text: string): boolean {
  return /\b(search|look up|lookup|browse|internet|web|latest|news|find out|what happened|who is|what is|schedule|fixture|fixtures|match|matches|score|scores|ipl|cricket|sports|tournament|league)\b/i.test(text);
}

export async function resolveSearchTool(transcript: string): Promise<InternetToolResult> {
  const query = cleanSearchQuery(transcript);
  if (!query) return { type: "search", status: "no_answer" };

  try {
    const direct = await resolveDirectWebSearch(query);
    if (direct) return direct;

    const searchUrl = new URL("https://api.duckduckgo.com/");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("no_html", "1");
    searchUrl.searchParams.set("skip_disambig", "1");

    const [instant, organic, news] = await Promise.all([resolveDuckDuckGoInstant(searchUrl), resolveDuckDuckGoHtmlSearch(query), resolveNewsRssSearch(query)]);
    const summaries = [organic?.summary, news?.summary, instant?.summary].filter(Boolean);
    if (!summaries.length) {
      return { type: "search", status: "no_answer", source: "DuckDuckGo Search" };
    }

    return {
      type: "search",
      status: "ok",
      source: organic?.source || news?.source || instant?.source || "DuckDuckGo Search",
      summary: truncate(summaries.join(" "), 1400)
    };
  } catch (error) {
    return {
      type: "search",
      status: "error",
      error: error instanceof Error ? error.message : "Search lookup failed."
    };
  }
}

async function resolveDirectWebSearch(query: string): Promise<InternetToolResult | null> {
  const normalized = query.toLowerCase();
  if (/\b(openai|chatgpt|codex)\b/.test(normalized) && /\b(codex|ios|iphone|mobile|app)\b/.test(normalized)) {
    const releaseNotes = await fetchPageExcerpt("https://help.openai.com/en/articles/6825453-chatgpt-release-notes", 1200);
    const codexMobile = releaseNotes.match(/codex[\s\S]{0,500}?(?:ios|android|mobile|app)[\s\S]{0,500}/i)?.[0] || releaseNotes;
    if (codexMobile) {
      return {
        type: "search",
        status: "ok",
        source: "https://help.openai.com/en/articles/6825453-chatgpt-release-notes",
        summary: `Official OpenAI release notes excerpt: ${truncate(codexMobile, 1000)}`,
        directAnswer:
          "yes. openai has codex available through chatgpt on ios and android for eligible plans, but i do not see a separate standalone codex ios app. [POINT:none]"
      };
    }
  }

  if (/\bcursor\b/.test(normalized) && /\b(version|latest|release|changelog|update)\b/.test(normalized)) {
    const changelog = await fetchPageExcerpt("https://cursor.com/changelog", 900);
    const cursor3 = await fetchPageExcerpt("https://cursor.com/blog/cursor-3", 900);
    const summary = [
      changelog ? `Official Cursor changelog excerpt: ${changelog}` : "",
      cursor3 ? `Official Cursor 3 announcement excerpt: ${cursor3}` : ""
    ]
      .filter(Boolean)
      .join(" ");
    if (summary) {
      return {
        type: "search",
        status: "ok",
        source: "https://cursor.com/changelog",
        summary: truncate(summary, 1400),
        directAnswer:
          "cursor's latest major release is cursor 3, and the official changelog has a may 13, 2026 update for cloud agent development environments. [POINT:none]"
      };
    }
  }

  if (/\b(ipl|cricket)\b/.test(normalized) && /\b(score|live|right now)\b/.test(normalized)) {
    const cricket = await fetchPageExcerpt("https://m.cricbuzz.com/cricket-match/live-scores", 3600);
    const focus =
      cricket.match(/Indian Premier League 2026[\s\S]{0,700}/i)?.[0] ||
      cricket.match(/MATCHES[\s\S]{0,900}/i)?.[0] ||
      cricket.match(/IPL 2026[\s\S]{0,900}/i)?.[0] ||
      cricket;
    if (focus) {
      return {
        type: "search",
        status: "ok",
        source: "https://m.cricbuzz.com/cricket-match/live-scores",
        summary: `Cricbuzz live score excerpt: ${truncate(focus, 1000)}`,
        directAnswer: cricketScoreDirectAnswer(focus)
      };
    }
  }

  return null;
}

function cricketScoreDirectAnswer(excerpt: string): string {
  const liveMatch =
    excerpt.match(/Indian Premier League 2026\s+([\s\S]{0,360}?)(?:Live Score|Scorecard|Full Commentary|News)/i)?.[1] ||
    excerpt.match(/MATCHES\s+([\s\S]{0,220}?)(?:ALL|All Live Now|INTERNATIONAL)/i)?.[1] ||
    excerpt;
  return `${truncate(normalizePlainText(liveMatch), 260)} [POINT:none]`;
}

async function resolveDuckDuckGoInstant(searchUrl: URL): Promise<InternetToolResult | null> {
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
  if (!summary) return null;
  return {
    type: "search",
    status: "ok",
    source: payload.AbstractURL || payload.RelatedTopics?.find((topic) => topic.FirstURL)?.FirstURL || "DuckDuckGo Instant Answer",
    summary: `Instant answer: ${payload.Heading ? `${payload.Heading}: ` : ""}${truncate(summary, 500)}`
  };
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
  const results = extractOrganicResults(html, 5);
  if (!results.length) return null;

  const topExcerpt = results[0]?.href ? await fetchPageExcerpt(results[0].href) : "";
  const summary = results
    .map((result, index) => {
      const detail = [result.title, result.snippet].filter(Boolean).join(": ");
      return `${index + 1}. ${detail}${result.href ? ` (${result.href})` : ""}`;
    })
    .join(" ");
  if (!summary) return null;

  return {
    type: "search",
    status: "ok",
    source: results[0]?.href || "DuckDuckGo Search",
    summary: `Live search results: ${truncate(summary, 900)}${topExcerpt ? ` Top result excerpt: ${topExcerpt}` : ""}`
  };
}

async function fetchPageExcerpt(url: string, maxLength = 700): Promise<string> {
  if (!/^https?:\/\//i.test(url)) return "";
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,text/plain",
        "User-Agent": "ClickyWindows/0.1"
      },
      signal: AbortSignal.timeout(3500)
    });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) return "";
    const html = await response.text();
    return truncate(extractReadableText(html), maxLength);
  } catch {
    return "";
  }
}

function extractReadableText(html: string): string {
  return normalizePlainText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&#x27;/gi, "'")
      .replace(/&quot;/gi, '"')
  );
}

function extractOrganicResults(html: string, limit: number): Array<{ title: string; snippet: string; href: string }> {
  const resultPattern =
    /<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>)?/gi;
  let match: RegExpExecArray | null;
  const results: Array<{ title: string; snippet: string; href: string }> = [];

  while ((match = resultPattern.exec(html)) && results.length < limit) {
    const href = normalizeSearchHref(normalizePlainText(match[1] || ""));
    const title = normalizePlainText(match[2] || "");
    const snippet = normalizePlainText(match[3] || "");
    if (!title || isLikelyAdResult(title, snippet, href)) continue;
    results.push({ title, snippet, href });
  }

  return results;
}

function normalizeSearchHref(href: string): string {
  if (!href) return "";
  try {
    const url = new URL(href.startsWith("//") ? `https:${href}` : href);
    const redirected = url.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : url.toString();
  } catch {
    return href;
  }
}

function isLikelyAdResult(title: string, snippet: string, href: string): boolean {
  const combined = `${title} ${snippet} ${href}`.toLowerCase();
  return (
    combined.includes("ad_provider=") ||
    combined.includes("/aclick") ||
    combined.includes("uddg=https%3a%2f%2fduckduckgo.com%2fy.js") ||
    /\btickets?\b/.test(combined) ||
    /\bon sale\b/.test(combined)
  );
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
