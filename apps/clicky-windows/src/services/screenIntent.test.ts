import { describe, expect, it } from "vitest";
import { shouldCaptureScreenForTranscript } from "./screenIntent";

describe("shouldCaptureScreenForTranscript", () => {
  it("skips screenshots for simple conversational checks", () => {
    expect(shouldCaptureScreenForTranscript("Are you there?")).toBe(false);
    expect(shouldCaptureScreenForTranscript("hello Clicky")).toBe(false);
  });

  it("keeps screenshots by default once the prompt has substance", () => {
    expect(shouldCaptureScreenForTranscript("Where should I click on this screen?")).toBe(true);
    expect(shouldCaptureScreenForTranscript("Can you help me with this app?")).toBe(true);
    expect(shouldCaptureScreenForTranscript("Can you tell me if you are there and say hi to me?")).toBe(true);
  });
});
