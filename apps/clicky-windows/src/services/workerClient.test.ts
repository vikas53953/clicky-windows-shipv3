import { describe, expect, it } from "vitest";
import {
  chooseFinalTranscript,
  defaultSettings,
  formatWorkerHttpError,
  modelSupportsScreenImages,
  prepareScreenshotsForChat,
  requestTextToSpeech,
  summarizeVoiceHealth,
  testVoiceHealth,
  transcribeAudio
} from "./workerClient";

describe("workerClient", () => {
  it("turns ElevenLabs unusual-activity responses into a useful user message", () => {
    const message = formatWorkerHttpError(
      "Transcription",
      401,
      JSON.stringify({
        detail: {
          status: "detected_unusual_activity",
          message: "Unusual activity detected. Free Tier usage disabled."
        }
      })
    );

    expect(message).toContain("ElevenLabs blocked this key/account");
    expect(message).toContain("npm run smoke:live-providers");
    expect(message).not.toContain("Free Tier usage disabled");
  });

  it("keeps voice helpers local in mock mode", async () => {
    expect(await requestTextToSpeech({ ...defaultSettings, mockMode: true }, "hello")).toBeNull();
    expect(await transcribeAudio({ ...defaultSettings, mockMode: true }, new Blob(["fake"]))).toBe("Where should I click on this screen?");
  });

  it("keeps voice health local in mock mode", async () => {
    await expect(testVoiceHealth({ ...defaultSettings, mockMode: true })).resolves.toEqual({
      ok: true,
      mode: "mock",
      provider: "mock",
      status: "configured",
      tts: true,
      stt: true,
      message: "Mock voice path is available."
    });
  });

  it("summarizes blocked ElevenLabs voice health without raw provider detail", () => {
    expect(
      summarizeVoiceHealth({
        ok: false,
        mode: "live",
        provider: "elevenlabs",
        status: "detected_unusual_activity",
        tts: false,
        stt: "not_tested",
        message: "Unusual activity detected. Free Tier usage disabled."
      })
    ).toBe("ElevenLabs blocked this key/account.");
  });

  it("prefers ElevenLabs as the final transcript when it has enough content", () => {
    expect(
      chooseFinalTranscript({
        webviewTranscript: "can you play the game with me",
        providerTranscript: "can you check the weather of Delhi with me"
      })
    ).toEqual({ transcript: "can you check the weather of Delhi with me", source: "elevenlabs" });
  });

  it("keeps the longer WebView transcript when provider STT returns a suspiciously tiny phrase", () => {
    expect(
      chooseFinalTranscript({
        webviewTranscript: "can you check the weather of Delhi for me",
        providerTranscript: "with me"
      })
    ).toEqual({ transcript: "can you check the weather of Delhi for me", source: "webview" });
  });

  it("falls back to WebView only when provider STT is empty", () => {
    expect(
      chooseFinalTranscript({
        webviewTranscript: "weather of Delhi",
        providerTranscript: ""
      })
    ).toEqual({ transcript: "weather of Delhi", source: "webview" });
  });

  it("detects when the active model cannot receive screenshots", () => {
    expect(modelSupportsScreenImages({ provider: "opencode", model: "minimax-m2.7" })).toBe(false);
    expect(modelSupportsScreenImages({ provider: "anthropic", model: "claude-sonnet-4-5" })).toBe(true);
  });

  it("does not send screenshots to text-only models", () => {
    const screenshots = [
      { mediaType: "image/jpeg" as const, base64: "one", width: 100, height: 100 },
      { mediaType: "image/jpeg" as const, base64: "two", width: 100, height: 100 },
      { mediaType: "image/jpeg" as const, base64: "three", width: 100, height: 100 }
    ];

    expect(prepareScreenshotsForChat({ provider: "opencode", model: "minimax-m2.7" }, screenshots)).toEqual([]);
  });

  it("never sends more screenshots than the Worker accepts", () => {
    const screenshots = [
      { mediaType: "image/jpeg" as const, base64: "one", width: 100, height: 100 },
      { mediaType: "image/jpeg" as const, base64: "two", width: 100, height: 100 },
      { mediaType: "image/jpeg" as const, base64: "three", width: 100, height: 100 }
    ];

    expect(prepareScreenshotsForChat({ provider: "anthropic", model: "claude-sonnet-4-5" }, screenshots)).toHaveLength(2);
  });
});
