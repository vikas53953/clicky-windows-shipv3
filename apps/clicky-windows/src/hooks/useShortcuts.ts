import { useEffect, type MutableRefObject } from "react";
import type { ClickySession } from "../services/clickySession";
import { listenNativeEvent, type NativeShortcutEvent } from "../services/nativeBridge";
import type { StartListeningOptions } from "./useVoiceCapture";

interface UseShortcutsOptions {
  nativeRuntime: boolean;
  isOverlayWindow: boolean;
  sessionStatusRef: MutableRefObject<ClickySession["status"]>;
  startListening: (options?: StartListeningOptions) => void;
  stopListening: () => void;
}

export function useShortcuts({ nativeRuntime, isOverlayWindow, sessionStatusRef, startListening, stopListening }: UseShortcutsOptions): void {
  useEffect(() => {
    if (!nativeRuntime || isOverlayWindow) return;

    let unlistenShortcut: (() => void) | null = null;
    void listenNativeEvent<NativeShortcutEvent>("clicky-shortcut", (event) => {
      if (event.phase === "started" && sessionStatusRef.current !== "listening") startListening({ autoStopOnSilence: false });
      if (event.phase === "ended" && sessionStatusRef.current === "listening") stopListening();
    }).then((unlisten) => {
      unlistenShortcut = unlisten;
    });

    return () => {
      unlistenShortcut?.();
    };
  }, [isOverlayWindow, nativeRuntime, sessionStatusRef, startListening, stopListening]);

  useEffect(() => {
    let shortcutIsDown = false;

    const isClickyShortcut = (event: KeyboardEvent) =>
      event.ctrlKey && event.altKey && (event.code === "Space" || event.key === " " || event.key === "Spacebar");

    const keyDown = (event: KeyboardEvent) => {
      if (isClickyShortcut(event) && !shortcutIsDown) {
        shortcutIsDown = true;
        event.preventDefault();
        startListening({ autoStopOnSilence: false });
      }
    };

    const keyUp = (event: KeyboardEvent) => {
      if (shortcutIsDown && (event.code === "Space" || event.key === " " || event.key === "Spacebar")) {
        shortcutIsDown = false;
        event.preventDefault();
        stopListening();
      }
    };

    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  }, [startListening, stopListening]);
}
