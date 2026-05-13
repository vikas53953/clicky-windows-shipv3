import { describe, expect, it } from "vitest";
import { shouldConfirmTranscriptWithStt } from "./transcriptQuality";

describe("shouldConfirmTranscriptWithStt", () => {
  it("confirms partial WebView transcripts that end with filler or connector words", () => {
    expect(shouldConfirmTranscriptWithStt("hey clicky are you able to hear me and you know")).toBe(true);
    expect(shouldConfirmTranscriptWithStt("can you check")).toBe(true);
  });

  it("keeps complete-looking WebView transcripts fast", () => {
    expect(shouldConfirmTranscriptWithStt("can you check Delhi weather")).toBe(false);
    expect(shouldConfirmTranscriptWithStt("are you there?")).toBe(false);
  });
});
