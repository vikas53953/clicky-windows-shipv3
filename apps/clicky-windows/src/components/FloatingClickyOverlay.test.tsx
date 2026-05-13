import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FloatingClickyOverlay } from "./FloatingClickyOverlay";

describe("FloatingClickyOverlay", () => {
  it("renders the waveform only while listening with active speech", () => {
    const silent = renderToStaticMarkup(
      <FloatingClickyOverlay status="listening" text="" showClicky accentColor="#3b82f6" avatar="classic" voiceLevel={0} voiceActive={false} />
    );
    const speaking = renderToStaticMarkup(
      <FloatingClickyOverlay status="listening" text="" showClicky accentColor="#3b82f6" avatar="classic" voiceLevel={0.6} voiceActive />
    );
    const thinking = renderToStaticMarkup(
      <FloatingClickyOverlay status="thinking" text="Working" showClicky accentColor="#3b82f6" avatar="classic" voiceLevel={0.6} voiceActive />
    );

    expect(silent).not.toContain("voice-waveform");
    expect(speaking).toContain("voice-waveform");
    expect(thinking).not.toContain("voice-waveform");
  });
});
