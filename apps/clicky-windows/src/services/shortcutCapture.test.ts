import { describe, expect, it } from "vitest";
import { shortcutFromKeyboardEvent } from "./shortcutCapture";

describe("shortcutCapture", () => {
  it("captures modifier plus key combinations instead of typed characters", () => {
    expect(
      shortcutFromKeyboardEvent({
        ctrlKey: true,
        altKey: true,
        shiftKey: false,
        metaKey: false,
        key: " ",
        code: "Space"
      })
    ).toBe("Ctrl+Alt+Space");
  });

  it("ignores bare modifier keydown events", () => {
    expect(
      shortcutFromKeyboardEvent({
        ctrlKey: true,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        key: "Control",
        code: "ControlLeft"
      })
    ).toBeNull();
  });
});
