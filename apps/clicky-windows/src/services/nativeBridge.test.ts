import { describe, expect, it } from "vitest";
import { describeNativeRuntime, formatNativeCursor, type NativeDiagnostics } from "./nativeBridge";

const diagnostics: NativeDiagnostics = {
  isTauri: true,
  overlayWindow: true,
  overlayClickThrough: true,
  cursorFollowing: true,
  shortcut: "ctrl+alt+space",
  cursor: {
    x: 120,
    y: 240,
    screen: 1,
    monitorX: 0,
    monitorY: 0,
    monitorWidth: 1920,
    monitorHeight: 1080,
    scaleFactor: 1
  }
};

describe("nativeBridge", () => {
  it("formats native cursor metadata for status UI", () => {
    expect(formatNativeCursor(diagnostics.cursor)).toBe("screen1 @ 120, 240");
    expect(formatNativeCursor(null)).toBe("Waiting for native cursor");
  });

  it("describes native runtime state honestly", () => {
    expect(describeNativeRuntime(diagnostics, true)).toBe("Tauri native, overlay following cursor");
    expect(describeNativeRuntime(null, true)).toBe("Tauri native, checking overlay");
    expect(describeNativeRuntime(null, false)).toBe("Browser preview");
  });
});
