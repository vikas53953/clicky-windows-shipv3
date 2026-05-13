import { describe, expect, it } from "vitest";
import { shouldAutoSendVoice } from "./voiceAutoSend";

describe("shouldAutoSendVoice", () => {
  it("does not auto-submit while hold-to-talk is active", () => {
    expect(
      shouldAutoSendVoice({
        autoStopOnSilence: false,
        silenceAlreadyTriggered: false,
        nowMs: 4_000,
        recordingStartedAtMs: 0,
        speechStarted: true,
        lastVoiceAtMs: 1_000
      })
    ).toBe(false);
  });

  it("waits for a natural end pause before toggle-mode auto-submit", () => {
    const base = {
      autoStopOnSilence: true,
      silenceAlreadyTriggered: false,
      recordingStartedAtMs: 0,
      speechStarted: true,
      lastVoiceAtMs: 1_000
    };

    expect(shouldAutoSendVoice({ ...base, nowMs: 2_200 })).toBe(false);
    expect(shouldAutoSendVoice({ ...base, nowMs: 3_400 })).toBe(true);
  });

  it("keeps the failsafe for long toggle-mode recordings", () => {
    expect(
      shouldAutoSendVoice({
        autoStopOnSilence: true,
        silenceAlreadyTriggered: false,
        nowMs: 16_500,
        recordingStartedAtMs: 0,
        speechStarted: false,
        lastVoiceAtMs: 0
      })
    ).toBe(true);
  });
});
