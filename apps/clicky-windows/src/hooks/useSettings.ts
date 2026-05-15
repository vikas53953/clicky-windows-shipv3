import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { isLiveSessionRequested, isTauriRuntime, listenNativeEvent, type NativeAccentColorEvent } from "../services/nativeBridge";
import { migrateStoredSettings } from "../services/settingsMigration";
import { defaultSettings, type ClickySettings } from "../services/workerClient";

const SETTINGS_STORAGE_KEY = "clicky-settings-v1";

function loadInitialSettings(forceMockMode: boolean): ClickySettings {
  const fallback: ClickySettings = {
    ...defaultSettings,
    mockMode: forceMockMode ? true : defaultSettings.mockMode
  };

  if (typeof window === "undefined") return fallback;

  try {
    const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored) as Partial<ClickySettings>;
    return migrateStoredSettings(parsed, forceMockMode, fallback);
  } catch {
    return fallback;
  }
}

interface UseSettingsOptions {
  forceMockMode: boolean;
  isOverlayWindow: boolean;
  onWorkerStatus: (message: string) => void;
}

export function useSettings({ forceMockMode, isOverlayWindow, onWorkerStatus }: UseSettingsOptions): {
  settings: ClickySettings;
  setSettings: Dispatch<SetStateAction<ClickySettings>>;
  nativeRuntime: boolean;
} {
  const [settings, setSettings] = useState<ClickySettings>(() => loadInitialSettings(forceMockMode));
  const nativeRuntime = isTauriRuntime();

  useEffect(() => {
    if (isOverlayWindow || forceMockMode) return;

    let cancelled = false;

    if (nativeRuntime) {
      void isLiveSessionRequested()
        .then((liveSession) => {
          if (cancelled || !liveSession) return;
          setSettings((current) => (current.mockMode ? { ...current, mockMode: false } : current));
          onWorkerStatus("live: Clicky was launched by the live test runner.");
        })
        .catch(() => {
          // The live-runner hint is optional; Worker health auto-detection still runs below.
        });
    }

    const workerUrl = defaultSettings.workerUrl.replace(/\/$/, "");

    void fetch(`${workerUrl}/health`, { headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((health: { mode?: string; message?: string } | null) => {
        if (cancelled || health?.mode !== "live") return;

        setSettings((current) => (current.workerUrl === defaultSettings.workerUrl && current.mockMode ? { ...current, mockMode: false } : current));
        onWorkerStatus(`live: ${health.message ?? "Clicky Worker reachable."}`);
      })
      .catch(() => {
        // Startup auto-detection is best-effort; manual Mock mode remains available.
      });

    return () => {
      cancelled = true;
    };
  }, [forceMockMode, isOverlayWindow, nativeRuntime, onWorkerStatus]);

  useEffect(() => {
    if (!nativeRuntime) return;

    let unlistenAccent: (() => void) | null = null;
    void listenNativeEvent<NativeAccentColorEvent>("clicky-accent-color", (event) => {
      setSettings((current) => ({ ...current, accentColor: event.color }));
    }).then((unlisten) => {
      unlistenAccent = unlisten;
    });

    return () => {
      unlistenAccent?.();
    };
  }, [nativeRuntime]);

  useEffect(() => {
    if (isOverlayWindow) return;

    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Settings persistence is a convenience; it must never block Clicky.
    }
  }, [isOverlayWindow, settings]);

  return { settings, setSettings, nativeRuntime };
}
