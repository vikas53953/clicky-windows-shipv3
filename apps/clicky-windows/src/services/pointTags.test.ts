import { describe, expect, it } from "vitest";
import { parsePointTags } from "./pointTags";

describe("parsePointTags", () => {
  it("returns clean text unchanged when no point tags exist", () => {
    const parsed = parsePointTags("Open the settings button on the left.");

    expect(parsed.cleanText).toBe("Open the settings button on the left.");
    expect(parsed.points).toEqual([]);
  });

  it("extracts point tags and removes raw tags from user-visible text", () => {
    const parsed = parsePointTags(
      "Click Settings now. [POINT:320,180:Settings button] Then choose Voice. [POINT:610,420:Voice toggle:screen1]"
    );

    expect(parsed.cleanText).toBe("Click Settings now. Then choose Voice.");
    expect(parsed.points).toEqual([
      { x: 320, y: 180, label: "Settings button", screen: 0 },
      { x: 610, y: 420, label: "Voice toggle", screen: 1 }
    ]);
  });

  it("removes POINT none tags without adding a target", () => {
    const parsed = parsePointTags("that is not visible from here. [POINT:none]");

    expect(parsed.cleanText).toBe("that is not visible from here.");
    expect(parsed.points).toEqual([]);
  });

  it("ignores malformed point tags instead of leaking them into parsed points", () => {
    const parsed = parsePointTags("Try this [POINT:left,top:Bad:screenA] safely.");

    expect(parsed.cleanText).toBe("Try this safely.");
    expect(parsed.points).toEqual([]);
  });
});
