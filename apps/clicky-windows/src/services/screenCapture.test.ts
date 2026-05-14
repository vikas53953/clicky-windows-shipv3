import { describe, expect, it } from "vitest";
import { selectScreenContextForWorker } from "./screenCapture";
import type { ScreenContext } from "./workerClient";

function screenContext(screen: number, monitorX: number, cursorX: number): ScreenContext {
  return {
    mediaType: "image/jpeg",
    base64: `screen-${screen}`,
    width: 1280,
    height: 720,
    screen,
    monitorX,
    monitorY: 0,
    monitorWidth: 1920,
    monitorHeight: 1080,
    cursorX,
    cursorY: 540
  };
}

describe("screenCapture", () => {
  it("keeps the cursor monitor first and limits Worker screenshots to two", () => {
    const captures = [
      screenContext(0, 0, 2200),
      screenContext(1, 1920, 2200),
      screenContext(2, 3840, 2200)
    ];

    const selected = selectScreenContextForWorker(captures);

    expect(selected).toHaveLength(2);
    expect(selected.map((capture) => capture.screen)).toEqual([1, 0]);
  });
});
