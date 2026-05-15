import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClickySession } from "../services/clickySession";
import {
  describeNativeRuntime,
  formatNativeCursor,
  getNativeCursorContext,
  getOverlayDiagnostics,
  listenNativeEvent,
  setNativeOverlayState,
  setNativeOverlayVisible,
  type NativeCursorContext,
  type NativeDiagnostics,
  type NativeOverlayState
} from "../services/nativeBridge";
import { overlayTextForSession } from "../services/overlayText";
import type { PointTarget } from "../services/pointTags";
import { defaultSettings, type ClickySettings } from "../services/workerClient";

interface UseNativeOverlayOptions {
  isOverlayWindow: boolean;
  nativeRuntime: boolean;
  settings: ClickySettings;
  session: ClickySession;
  micStatus: string;
  voiceLevel: number;
  voiceActive: boolean;
}

export interface NativeStatusSummary {
  runtime: string;
  cursor: string;
  overlay: string;
  shortcut: string;
  microphone: string;
}

export function useNativeOverlay({
  isOverlayWindow,
  nativeRuntime,
  settings,
  session,
  micStatus,
  voiceLevel,
  voiceActive
}: UseNativeOverlayOptions): {
  cursor: { x: number; y: number };
  cursorContext: NativeCursorContext | null;
  floatingOverlay: NativeOverlayState;
  publishOverlayState: (state: NativeOverlayState) => void;
  nativeStatus: NativeStatusSummary;
} {
  const [cursor, setCursor] = useState({ x: 720, y: 360 });
  const [nativeCursor, setNativeCursor] = useState<NativeCursorContext | null>(null);
  const [nativeDiagnostics, setNativeDiagnostics] = useState<NativeDiagnostics | null>(null);
  const [floatingOverlay, setFloatingOverlay] = useState<NativeOverlayState>({
    status: "listening",
    text: "",
    visible: true,
    accentColor: defaultSettings.accentColor,
    avatar: defaultSettings.avatar,
    voiceLevel: 0,
    voiceActive: false
  });

  const publishOverlayState = useCallback(
    (state: NativeOverlayState) => {
      const activePoint = session.points.at(-1);
      const currentCursor = nativeCursor ?? nativeDiagnostics?.cursor ?? null;
      const styledState: NativeOverlayState = {
        ...state,
        accentColor: state.accentColor ?? settings.accentColor,
        avatar: state.avatar ?? settings.avatar,
        voiceLevel: state.voiceLevel ?? (state.status === "listening" && voiceActive ? voiceLevel : 0),
        voiceActive: state.voiceActive ?? (state.status === "listening" && voiceActive),
        cursor: state.cursor ?? currentCursor ?? undefined,
        activePoint: state.activePoint ?? (state.status === "pointing" ? activePoint : undefined)
      };
      setFloatingOverlay(styledState);
      void setNativeOverlayState(styledState);
    },
    [nativeCursor, nativeDiagnostics?.cursor, session.points, settings.accentColor, settings.avatar, voiceActive, voiceLevel]
  );

  useEffect(() => {
    document.documentElement.classList.toggle("overlay-window-root", isOverlayWindow);
    document.body.classList.toggle("overlay-window", isOverlayWindow);
    return () => {
      document.documentElement.classList.remove("overlay-window-root");
      document.body.classList.remove("overlay-window");
    };
  }, [isOverlayWindow]);

  useEffect(() => {
    if (nativeRuntime) return;
    const updateCursor = (event: MouseEvent) => setCursor({ x: event.clientX, y: event.clientY });
    window.addEventListener("mousemove", updateCursor);
    return () => window.removeEventListener("mousemove", updateCursor);
  }, [nativeRuntime]);

  useEffect(() => {
    if (!nativeRuntime) return;

    const unlistenCallbacks: Array<() => void> = [];

    void getNativeCursorContext().then((context) => {
      if (!context) return;
      setNativeCursor(context);
      setCursor({ x: context.x, y: context.y });
    });

    void getOverlayDiagnostics().then((diagnostics) => {
      if (diagnostics) {
        setNativeDiagnostics(diagnostics);
        setNativeCursor(diagnostics.cursor);
      }
    });

    void listenNativeEvent<NativeCursorContext>("clicky-cursor-moved", (context) => {
      setNativeCursor(context);
      setCursor({ x: context.x, y: context.y });
      setNativeDiagnostics((diagnostics) => (diagnostics ? { ...diagnostics, cursor: context, cursorFollowing: true } : diagnostics));
    }).then((unlisten) => unlistenCallbacks.push(unlisten));

    void listenNativeEvent<NativeOverlayState>("clicky-overlay-state", (state) => {
      setFloatingOverlay(state);
    }).then((unlisten) => unlistenCallbacks.push(unlisten));

    return () => {
      unlistenCallbacks.forEach((unlisten) => unlisten());
    };
  }, [nativeRuntime]);

  useEffect(() => {
    if (!nativeRuntime) return;

    let cancelled = false;
    const refreshCursor = () => {
      void getNativeCursorContext().then((context) => {
        if (cancelled || !context) return;
        setNativeCursor(context);
        setCursor({ x: context.x, y: context.y });
      });
    };

    refreshCursor();
    const timer = window.setInterval(refreshCursor, 100);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [nativeRuntime]);

  useEffect(() => {
    if (!nativeRuntime) return;

    let cancelled = false;
    const refreshDiagnostics = () => {
      void getOverlayDiagnostics().then((diagnostics) => {
        if (cancelled || !diagnostics) return;
        setNativeDiagnostics(diagnostics);
        setNativeCursor(diagnostics.cursor);
        setCursor({ x: diagnostics.cursor.x, y: diagnostics.cursor.y });
      });
    };

    refreshDiagnostics();
    const timer = window.setInterval(refreshDiagnostics, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [nativeRuntime]);

  useEffect(() => {
    if (isOverlayWindow) return;
    const overlayStatus = session.status === "idle" ? "listening" : session.status;
    const currentCursor = nativeCursor ?? nativeDiagnostics?.cursor ?? null;
    const activePoint: PointTarget | undefined = session.status === "pointing" ? session.points.at(-1) : undefined;
    const state: NativeOverlayState = {
      status: overlayStatus,
      text: session.status === "idle" || session.status === "listening" ? "" : overlayTextForSession(session),
      visible: settings.showClicky,
      accentColor: settings.accentColor,
      avatar: settings.avatar,
      voiceLevel: overlayStatus === "listening" && voiceActive ? voiceLevel : 0,
      voiceActive: overlayStatus === "listening" && voiceActive,
      cursor: currentCursor ?? undefined,
      activePoint
    };
    setFloatingOverlay(state);
    void setNativeOverlayState(state);
  }, [isOverlayWindow, nativeCursor, nativeDiagnostics?.cursor, session, settings.accentColor, settings.avatar, settings.showClicky, voiceActive, voiceLevel]);

  useEffect(() => {
    if (!nativeRuntime || isOverlayWindow) return;
    void setNativeOverlayVisible(settings.showClicky);
  }, [isOverlayWindow, nativeRuntime, settings.showClicky]);

  const nativeStatus = useMemo(
    () => ({
      runtime: describeNativeRuntime(nativeDiagnostics, nativeRuntime),
      cursor: nativeRuntime ? formatNativeCursor(nativeCursor ?? nativeDiagnostics?.cursor ?? null) : `Browser preview @ ${cursor.x}, ${cursor.y}`,
      overlay: nativeRuntime
        ? nativeDiagnostics?.overlayWindow
          ? settings.showClicky
            ? "Click-through overlay visible and following"
            : "Click-through overlay hidden"
          : "Overlay window not detected"
        : "Browser overlay preview only",
      shortcut: nativeRuntime ? `Global ${nativeDiagnostics?.shortcut ?? "ctrl+alt+space"}` : "Window Ctrl+Alt or Ctrl+Alt+Space",
      microphone: micStatus
    }),
    [cursor.x, cursor.y, micStatus, nativeCursor, nativeDiagnostics, nativeRuntime, settings.showClicky]
  );

  return {
    cursor,
    cursorContext: nativeCursor ?? nativeDiagnostics?.cursor ?? null,
    floatingOverlay,
    publishOverlayState,
    nativeStatus
  };
}
