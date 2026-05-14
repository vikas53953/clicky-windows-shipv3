import { defaultSettings, type ClickySettings } from "./workerClient";

const LEGACY_OPENCODE_MODELS = new Set(["kimi-k2.5", "minimax-m2.7"]);

export function migrateStoredSettings(parsed: Partial<ClickySettings>, forceMockMode: boolean, fallback: ClickySettings = defaultSettings): ClickySettings {
  const migratedModel = LEGACY_OPENCODE_MODELS.has(parsed.model || "") ? fallback.model : parsed.model;

  return {
    ...fallback,
    ...parsed,
    model: migratedModel ?? fallback.model,
    mockMode: forceMockMode ? true : parsed.mockMode ?? fallback.mockMode
  };
}
