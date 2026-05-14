import { describe, expect, it } from "vitest";
import { defaultSettings } from "./workerClient";
import { migrateStoredSettings } from "./settingsMigration";

describe("migrateStoredSettings", () => {
  it("moves persisted old defaults to the current Gemini vision default", () => {
    const settings = migrateStoredSettings({ model: "kimi-k2.5", mockMode: false }, false);
    expect(settings.model).toBe("gemini-3-flash");
    expect(settings.mockMode).toBe(false);

    expect(migrateStoredSettings({ model: "minimax-m2.7", mockMode: false }, false).model).toBe("gemini-3-flash");
  });

  it("keeps explicit non-legacy model choices", () => {
    const settings = migrateStoredSettings({ model: "qwen3.6-plus" }, false);
    expect(settings.model).toBe("qwen3.6-plus");
  });

  it("respects forced mock mode", () => {
    const settings = migrateStoredSettings({ mockMode: false }, true, defaultSettings);
    expect(settings.mockMode).toBe(true);
  });
});
