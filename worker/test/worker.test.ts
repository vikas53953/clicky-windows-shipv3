import { describe, expect, it } from "vitest";
import { handleRequest, type WorkerEnv } from "../src/index";

const env: WorkerEnv = {
  ANTHROPIC_API_KEY: "",
  ASSEMBLYAI_API_KEY: "",
  ELEVENLABS_API_KEY: "",
  ELEVENLABS_VOICE_ID: "",
  ELEVENLABS_STT_MODEL_ID: "scribe_v1",
  ALLOWED_ORIGINS: "http://127.0.0.1:5174,http://localhost:5174",
  LLM_PROVIDER: "opencode",
  OPENCODE_MODEL: "minimax-m2.7",
  OPENCODE_API_MODE: "chat_completions",
  MOCK_MODE: "true"
};

describe("Clicky Worker", () => {
  it("responds to CORS preflight for allowed local origins", async () => {
    const response = await handleRequest(
      new Request("http://worker.local/chat", {
        method: "OPTIONS",
        headers: { Origin: "http://127.0.0.1:5174" }
      }),
      env
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:5174");
  });

  it("allows the native Tauri WebView origin even when .dev.vars overrides origins", async () => {
    const response = await handleRequest(
      new Request("http://worker.local/chat", {
        method: "OPTIONS",
        headers: { Origin: "http://tauri.localhost" }
      }),
      env
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://tauri.localhost");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Accept");
  });

  it("streams a mock chat response without requiring provider keys", async () => {
    const response = await handleRequest(
      new Request("http://worker.local/chat", {
        method: "POST",
        headers: {
          Origin: "http://127.0.0.1:5174",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ transcript: "Where do I click?", screenshots: [], model: "mock" })
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(await response.text()).toContain("POINT:");
  });

  it("returns a sanitized error when AssemblyAI key is missing outside mock mode", async () => {
    const response = await handleRequest(
      new Request("http://worker.local/transcribe-token", {
        method: "POST",
        headers: { Origin: "http://127.0.0.1:5174" }
      }),
      { ...env, MOCK_MODE: "false" }
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "AssemblyAI is not configured." });
  });

  it("returns a sanitized error when OpenAI is selected but missing outside mock mode", async () => {
    const response = await handleRequest(
      new Request("http://worker.local/chat", {
        method: "POST",
        headers: {
          Origin: "http://127.0.0.1:5174",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ provider: "openai", transcript: "Test the OpenAI path." })
      }),
      { ...env, MOCK_MODE: "false", LLM_PROVIDER: "openai" }
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "OpenAI is not configured." });
  });

  it("returns a sanitized error when OpenCode is selected but missing outside mock mode", async () => {
    const response = await handleRequest(
      new Request("http://worker.local/chat", {
        method: "POST",
        headers: {
          Origin: "http://127.0.0.1:5174",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ provider: "opencode", transcript: "Test the OpenCode path." })
      }),
      { ...env, MOCK_MODE: "false", LLM_PROVIDER: "opencode" }
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "OpenCode is not configured." });
  });

  it("lists a mock voice without requiring ElevenLabs credentials", async () => {
    const response = await handleRequest(
      new Request("http://worker.local/voices", {
        method: "GET",
        headers: { Origin: "http://127.0.0.1:5174" }
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ voices: [{ voiceId: "mock-voice", name: "Mock Voice" }] });
  });

  it("reports mock voice health without requiring ElevenLabs credentials", async () => {
    const response = await handleRequest(
      new Request("http://worker.local/voice-health", {
        method: "GET",
        headers: { Origin: "http://127.0.0.1:5174" }
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      mode: "mock",
      provider: "mock",
      status: "configured",
      tts: true,
      stt: true,
      message: "Mock voice path is available."
    });
  });

  it("reports missing ElevenLabs voice health without exposing secrets", async () => {
    const response = await handleRequest(
      new Request("http://worker.local/voice-health", {
        method: "GET",
        headers: { Origin: "http://127.0.0.1:5174" }
      }),
      { ...env, MOCK_MODE: "false" }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: false,
      mode: "live",
      provider: "elevenlabs",
      status: "not_configured",
      tts: false,
      stt: false,
      message: "ElevenLabs is not configured."
    });
  });

  it("returns a mock transcript without requiring ElevenLabs credentials", async () => {
    const form = new FormData();
    form.append("audio", new File(["fake audio"], "clicky.webm", { type: "audio/webm" }));

    const response = await handleRequest(
      new Request("http://worker.local/transcribe", {
        method: "POST",
        headers: { Origin: "http://127.0.0.1:5174" },
        body: form
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "Where should I click on this screen?", provider: "mock" });
  });

  it("resolves current weather internet context for a spoken location", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://geocoding-api.open-meteo.com/v1/search")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                name: "Delhi",
                country: "India",
                latitude: 28.65195,
                longitude: 77.23149,
                timezone: "Asia/Kolkata"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.startsWith("https://api.open-meteo.com/v1/forecast")) {
        return new Response(
          JSON.stringify({
            current: {
              temperature_2m: 31.4,
              apparent_temperature: 34.1,
              relative_humidity_2m: 45,
              precipitation: 0,
              weather_code: 1,
              wind_speed_10m: 9.2
            },
            current_units: {
              temperature_2m: "°C",
              apparent_temperature: "°C",
              relative_humidity_2m: "%",
              precipitation: "mm",
              wind_speed_10m: "km/h"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      return originalFetch(input);
    }) as typeof fetch;

    try {
      const response = await handleRequest(
        new Request("http://worker.local/tools/resolve", {
          method: "POST",
          headers: {
            Origin: "http://127.0.0.1:5174",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ transcript: "Can you tell me the weather in Delhi?" })
        }),
        env
      );

      expect(response.status).toBe(200);
      const payload = (await response.json()) as { tools: Array<{ type: string; summary: string }> };
      expect(payload.tools).toHaveLength(1);
      expect(payload.tools[0].type).toBe("weather");
      expect(payload.tools[0].summary).toContain("Delhi, India");
      expect(payload.tools[0].summary).toContain("31.4°C");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("resolves natural spoken weather locations before and after the word weather", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://geocoding-api.open-meteo.com/v1/search")) {
        expect(decodeURIComponent(url)).toMatch(/Delhi/i);
        return new Response(
          JSON.stringify({
            results: [{ name: "Delhi", country: "India", latitude: 28.65195, longitude: 77.23149 }]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.startsWith("https://api.open-meteo.com/v1/forecast")) {
        return new Response(
          JSON.stringify({
            current: {
              temperature_2m: 30,
              apparent_temperature: 33,
              relative_humidity_2m: 40,
              precipitation: 0,
              weather_code: 0,
              wind_speed_10m: 5
            },
            current_units: {
              temperature_2m: "°C",
              apparent_temperature: "°C",
              relative_humidity_2m: "%",
              precipitation: "mm",
              wind_speed_10m: "km/h"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      return originalFetch(input);
    }) as typeof fetch;

    try {
      for (const transcript of ["you have to check the weather of delhi", "can you check delhi weather"]) {
        const response = await handleRequest(
          new Request("http://worker.local/tools/resolve", {
            method: "POST",
            headers: {
              Origin: "http://127.0.0.1:5174",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ transcript })
          }),
          env
        );

        expect(response.status).toBe(200);
        const payload = (await response.json()) as { tools: Array<{ type: string; status: string; summary?: string }> };
        expect(payload.tools[0].status).toBe("ok");
        expect(payload.tools[0].summary).toContain("Delhi, India");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("resolves multi-location weather requests without treating the whole phrase as one city", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://geocoding-api.open-meteo.com/v1/search")) {
        const name = new URL(url).searchParams.get("name")?.toLowerCase();
        if (name === "delhi") {
          return new Response(
            JSON.stringify({
              results: [{ name: "Delhi", country: "India", latitude: 28.65195, longitude: 77.23149 }]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }

        return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }

      if (url.startsWith("https://api.open-meteo.com/v1/forecast")) {
        return new Response(
          JSON.stringify({
            current: {
              temperature_2m: 30,
              apparent_temperature: 33,
              relative_humidity_2m: 40,
              precipitation: 0,
              weather_code: 0,
              wind_speed_10m: 5
            },
            current_units: {
              temperature_2m: "°C",
              apparent_temperature: "°C",
              relative_humidity_2m: "%",
              precipitation: "mm",
              wind_speed_10m: "km/h"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      return originalFetch(input);
    }) as typeof fetch;

    try {
      const response = await handleRequest(
        new Request("http://worker.local/tools/resolve", {
          method: "POST",
          headers: {
            Origin: "http://127.0.0.1:5174",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ transcript: "check weather of ramya in punjab and delhi in india" })
        }),
        env
      );

      expect(response.status).toBe(200);
      const payload = (await response.json()) as { tools: Array<{ type: string; status: string; summary?: string; label?: string }> };
      expect(payload.tools).toHaveLength(2);
      expect(payload.tools.some((tool) => tool.status === "ok" && tool.summary?.includes("Delhi, India"))).toBe(true);
      expect(payload.tools.some((tool) => tool.status === "no_answer" && tool.label?.toLowerCase().includes("ramya"))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("asks for a location when weather is requested without one", async () => {
    const response = await handleRequest(
      new Request("http://worker.local/tools/resolve", {
        method: "POST",
        headers: {
          Origin: "http://127.0.0.1:5174",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ transcript: "Can you tell me the weather?" })
      }),
      env
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { tools: Array<{ type: string; status: string }> };
    expect(payload.tools).toEqual([{ type: "weather", status: "needs_location" }]);
  });

  it("answers simple weather chat directly from the internet tool before requiring an LLM key", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://geocoding-api.open-meteo.com/v1/search")) {
        return new Response(
          JSON.stringify({
            results: [{ name: "Delhi", country: "India", latitude: 28.65195, longitude: 77.23149 }]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.startsWith("https://api.open-meteo.com/v1/forecast")) {
        return new Response(
          JSON.stringify({
            current: {
              temperature_2m: 30,
              apparent_temperature: 33,
              relative_humidity_2m: 40,
              precipitation: 0,
              weather_code: 0,
              wind_speed_10m: 5
            },
            current_units: {
              temperature_2m: "°C",
              apparent_temperature: "°C",
              relative_humidity_2m: "%",
              precipitation: "mm",
              wind_speed_10m: "km/h"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      return originalFetch(input);
    }) as typeof fetch;

    try {
      const response = await handleRequest(
        new Request("http://worker.local/chat", {
          method: "POST",
          headers: {
            Origin: "http://127.0.0.1:5174",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            provider: "opencode",
            responseMode: "quick",
            transcript: "Can you tell me the weather in Delhi?"
          })
        }),
        { ...env, MOCK_MODE: "false", OPENCODE_API_KEY: "" }
      );

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain("Delhi, India");
      expect(text).toContain("[DONE]");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not send image payloads to text-only OpenCode MiniMax models", async () => {
    const originalFetch = globalThis.fetch;
    let upstreamBody = "";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://opencode.ai/zen/v1/chat/completions")) {
        upstreamBody = String(init?.body || "");
        return new Response(
          'data: {"choices":[{"delta":{"content":"I can help with the text request, but this model cannot inspect screenshots."}}]}\n\ndata: [DONE]\n\n',
          { status: 200, headers: { "content-type": "text/event-stream" } }
        );
      }

      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      const response = await handleRequest(
        new Request("http://worker.local/chat", {
          method: "POST",
          headers: {
            Origin: "http://127.0.0.1:5174",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            provider: "opencode",
            model: "minimax-m2.7",
            responseMode: "screen_guidance",
            transcript: "Can you check this screen?",
            screenshots: [{ mediaType: "image/png", base64: "abc123" }]
          })
        }),
        { ...env, MOCK_MODE: "false", OPENCODE_API_KEY: "test-key" }
      );

      expect(response.status).toBe(200);
      expect(upstreamBody).not.toContain("image_url");
      expect(upstreamBody).toContain("cannot receive screenshot images");
      expect(await response.text()).toContain("cannot inspect screenshots");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses the resolved OpenCode model when deciding whether screenshots are allowed", async () => {
    const originalFetch = globalThis.fetch;
    let upstreamBody = "";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://opencode.ai/zen/v1/chat/completions")) {
        upstreamBody = String(init?.body || "");
        return new Response('data: {"choices":[{"delta":{"content":"Text-only route accepted."}}]}\n\ndata: [DONE]\n\n', {
          status: 200,
          headers: { "content-type": "text/event-stream" }
        });
      }

      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      const response = await handleRequest(
        new Request("http://worker.local/chat", {
          method: "POST",
          headers: {
            Origin: "http://127.0.0.1:5174",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            provider: "opencode",
            responseMode: "screen_guidance",
            transcript: "Can you inspect this screenshot?",
            screenshots: [{ mediaType: "image/png", base64: "abc123" }]
          })
        }),
        { ...env, MOCK_MODE: "false", OPENCODE_API_KEY: "test-key", OPENCODE_MODEL: "minimax-m2.7" }
      );

      expect(response.status).toBe(200);
      expect(upstreamBody).not.toContain("image_url");
      expect(upstreamBody).toContain("cannot receive screenshot images");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not send screenshots on the OpenCode responses route for text-only models", async () => {
    const originalFetch = globalThis.fetch;
    let upstreamBody = "";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://opencode.ai/zen/v1/responses")) {
        upstreamBody = String(init?.body || "");
        return new Response(
          'data: {"type":"response.output_text.delta","delta":"Text-only responses route accepted."}\n\ndata: [DONE]\n\n',
          { status: 200, headers: { "content-type": "text/event-stream" } }
        );
      }

      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      const response = await handleRequest(
        new Request("http://worker.local/chat", {
          method: "POST",
          headers: {
            Origin: "http://127.0.0.1:5174",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            provider: "opencode",
            model: "minimax-m2.7",
            responseMode: "screen_guidance",
            transcript: "Can you inspect this screenshot?",
            screenshots: [{ mediaType: "image/png", base64: "abc123" }]
          })
        }),
        { ...env, MOCK_MODE: "false", OPENCODE_API_KEY: "test-key", OPENCODE_API_MODE: "responses" }
      );

      expect(response.status).toBe(200);
      expect(upstreamBody).not.toContain("input_image");
      expect(upstreamBody).toContain("cannot receive screenshot images");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns search context for current/news-style questions", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://api.duckduckgo.com/")) {
        return new Response(JSON.stringify({ Heading: "", Answer: "", AbstractText: "" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.startsWith("https://html.duckduckgo.com/html/")) {
        return new Response(
          '<html><body><a class="result__a" href="https://example.com/modi-news">Modi travel update</a><a class="result__snippet">Latest public reporting says no confirmed accident.</a></body></html>',
          { status: 200, headers: { "content-type": "text/html" } }
        );
      }

      return originalFetch(input);
    }) as typeof fetch;

    try {
      const response = await handleRequest(
        new Request("http://worker.local/tools/resolve", {
          method: "POST",
          headers: {
            Origin: "http://127.0.0.1:5174",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ transcript: "latest news about prime minister modi accident" })
        }),
        env
      );

      expect(response.status).toBe(200);
      const payload = (await response.json()) as { tools: Array<{ type: string; status: string; summary?: string }> };
      expect(payload.tools[0].type).toBe("search");
      expect(payload.tools[0].status).toBe("ok");
      expect(payload.tools[0].summary).toContain("Modi travel update");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("adds safe local tool instructions only when computer use is enabled", async () => {
    const originalFetch = globalThis.fetch;
    let upstreamBody = "";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://opencode.ai/zen/v1/chat/completions")) {
        upstreamBody = String(init?.body || "");
        return new Response('data: {"choices":[{"delta":{"content":"I can open that."}}]}\n\ndata: [DONE]\n\n', {
          status: 200,
          headers: { "content-type": "text/event-stream" }
        });
      }

      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      const response = await handleRequest(
        new Request("http://worker.local/chat", {
          method: "POST",
          headers: {
            Origin: "http://127.0.0.1:5174",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            provider: "opencode",
            model: "minimax-m2.7",
            responseMode: "screen_guidance",
            computerUseEnabled: true,
            transcript: "Open https://example.com"
          })
        }),
        { ...env, MOCK_MODE: "false", OPENCODE_API_KEY: "test-key" }
      );

      expect(response.status).toBe(200);
      expect(upstreamBody).toContain("Computer use is enabled");
      expect(upstreamBody).toContain("open_url");
      expect(upstreamBody).toContain("Never click");
      expect(upstreamBody).toContain("run shell commands");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to a news feed when instant and HTML search have no usable answer", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://api.duckduckgo.com/")) {
        return new Response(JSON.stringify({ Heading: "", Answer: "", AbstractText: "" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.startsWith("https://html.duckduckgo.com/html/")) {
        return new Response("<html><body>No results here</body></html>", {
          status: 200,
          headers: { "content-type": "text/html" }
        });
      }

      if (url.startsWith("https://news.google.com/rss/search")) {
        return new Response(
          "<rss><channel><item><title>Delhi weather update</title><link>https://news.example/delhi-weather</link><description>Current reports say Delhi remains warm.</description></item></channel></rss>",
          { status: 200, headers: { "content-type": "application/xml" } }
        );
      }

      return originalFetch(input);
    }) as typeof fetch;

    try {
      const response = await handleRequest(
        new Request("http://worker.local/tools/resolve", {
          method: "POST",
          headers: {
            Origin: "http://127.0.0.1:5174",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ transcript: "latest news about delhi traffic" })
        }),
        env
      );

      expect(response.status).toBe(200);
      const payload = (await response.json()) as { tools: Array<{ type: string; status: string; summary?: string; source?: string }> };
      expect(payload.tools[0].type).toBe("search");
      expect(payload.tools[0].status).toBe("ok");
      expect(payload.tools[0].summary).toContain("Delhi weather update");
      expect(payload.tools[0].source).toBe("https://news.example/delhi-weather");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns a sanitized error when ElevenLabs STT is missing outside mock mode", async () => {
    const form = new FormData();
    form.append("audio", new File(["fake audio"], "clicky.webm", { type: "audio/webm" }));

    const response = await handleRequest(
      new Request("http://worker.local/transcribe", {
        method: "POST",
        headers: { Origin: "http://127.0.0.1:5174" },
        body: form
      }),
      { ...env, MOCK_MODE: "false" }
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "ElevenLabs speech-to-text is not configured." });
  });

  it("normalizes Anthropic SSE into Clicky's chunk stream format", async () => {
    const originalFetch = globalThis.fetch;
    let upstreamBody = "";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://api.anthropic.com/v1/messages")) {
        upstreamBody = String(init?.body || "");
        return new Response(
          [
            'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi "}}\n',
            '\nevent: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Vikas"}}\n',
            '\nevent: message_stop\ndata: {"type":"message_stop"}\n\n'
          ].join(""),
          { status: 200, headers: { "content-type": "text/event-stream" } }
        );
      }

      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      const response = await handleRequest(
        new Request("http://worker.local/chat", {
          method: "POST",
          headers: {
            Origin: "http://127.0.0.1:5174",
            "Content-Type": "application/json",
            "cf-connecting-ip": "anthropic-test"
          },
          body: JSON.stringify({
            provider: "anthropic",
            transcript: "continue",
            messages: [{ role: "user", content: "Remember Delhi." }]
          })
        }),
        { ...env, MOCK_MODE: "false", LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test-key" }
      );

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain('data: {"type":"chunk","text":"Hi "}');
      expect(text).toContain('data: {"type":"chunk","text":"Vikas"}');
      expect(text).toContain("data: [DONE]");
      expect(upstreamBody).toContain("Remember Delhi.");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("answers current time through Worker tool context without relying on the model", async () => {
    const response = await handleRequest(
      new Request("http://worker.local/chat", {
        method: "POST",
        headers: {
          Origin: "http://127.0.0.1:5174",
          "Content-Type": "application/json",
          "cf-connecting-ip": "time-test"
        },
        body: JSON.stringify({ responseMode: "quick", transcript: "what time is it in my area", timezone: "Asia/Kolkata" })
      }),
      env
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("Current date and time in Asia/Kolkata");
  });

  it("enforces strict configured CORS origins while preserving Tauri origin", async () => {
    const blocked = await handleRequest(
      new Request("http://worker.local/chat", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:9999" }
      }),
      env
    );
    expect(blocked.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:5174");

    const tauri = await handleRequest(
      new Request("http://worker.local/chat", {
        method: "OPTIONS",
        headers: { Origin: "http://tauri.localhost" }
      }),
      env
    );
    expect(tauri.headers.get("Access-Control-Allow-Origin")).toBe("http://tauri.localhost");
  });

  it("rejects oversized screenshot batches before provider calls", async () => {
    const response = await handleRequest(
      new Request("http://worker.local/chat", {
        method: "POST",
        headers: {
          Origin: "http://127.0.0.1:5174",
          "Content-Type": "application/json",
          "cf-connecting-ip": "size-test"
        },
        body: JSON.stringify({
          transcript: "look at this",
          screenshots: [
            { mediaType: "image/jpeg", base64: "a" },
            { mediaType: "image/jpeg", base64: "b" },
            { mediaType: "image/jpeg", base64: "c" }
          ]
        })
      }),
      env
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "Too many screenshots. Send at most 2." });
  });
});
