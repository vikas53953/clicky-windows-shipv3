import type { ClickyStatus } from "./clickySession";
import type { PointTarget } from "./pointTags";
import type { ClickyAvatar, ScreenContext } from "./workerClient";

export interface NativeCursorContext {
  x: number;
  y: number;
  screen: number;
  monitorX: number;
  monitorY: number;
  monitorWidth: number;
  monitorHeight: number;
  scaleFactor: number;
}

export interface NativeCommandResult {
  ok: boolean;
  message: string;
}

export interface NativeOverlayState {
  status: ClickyStatus;
  text: string;
  visible: boolean;
  accentColor?: string;
  avatar?: ClickyAvatar;
  voiceLevel?: number;
  voiceActive?: boolean;
  cursor?: NativeCursorContext;
  activePoint?: PointTarget;
  overlayMonitor?: NativeCursorContext;
}

export interface NativeShortcutEvent {
  phase: "toggle" | "started" | "ended";
  shortcut: string;
}

export interface NativeAccentColorEvent {
  color: string;
}

export interface NativeDiagnostics {
  isTauri: boolean;
  overlayWindow: boolean;
  overlayClickThrough: boolean;
  cursorFollowing: boolean;
  shortcut: string;
  cursor: NativeCursorContext;
}

export interface MicrophoneProbe {
  ok: boolean;
  message: string;
  deviceCount: number;
  labels: string[];
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function formatNativeCursor(cursor: NativeCursorContext | null): string {
  if (!cursor) return "Waiting for native cursor";
  return `screen${cursor.screen} @ ${Math.round(cursor.x)}, ${Math.round(cursor.y)}`;
}

export function describeNativeRuntime(diagnostics: NativeDiagnostics | null, tauriRuntime = isTauriRuntime()): string {
  if (!tauriRuntime) return "Browser preview";
  if (!diagnostics) return "Tauri native, checking overlay";
  return diagnostics.overlayWindow && diagnostics.cursorFollowing
    ? "Tauri native, full-screen overlay active"
    : "Tauri native, overlay needs attention";
}

export async function getNativeCursorContext(): Promise<NativeCursorContext | null> {
  if (!isTauriRuntime()) return null;
  return invokeNative<NativeCursorContext>("get_cursor_context");
}

export async function getOverlayDiagnostics(): Promise<NativeDiagnostics | null> {
  if (!isTauriRuntime()) return null;
  return invokeNative<NativeDiagnostics>("overlay_diagnostics");
}

export async function isLiveSessionRequested(): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  return invokeNative<boolean>("live_session_requested");
}

export async function captureNativeScreenContext(): Promise<ScreenContext[] | null> {
  if (!isTauriRuntime()) return null;
  return invokeNative<ScreenContext[]>("capture_screen_context");
}

export async function setNativeOverlayVisible(visible: boolean): Promise<NativeCommandResult | null> {
  if (!isTauriRuntime()) return null;
  return invokeNative<NativeCommandResult>("set_overlay_visible", { visible });
}

export async function setNativeOverlayState(state: NativeOverlayState): Promise<NativeCommandResult | null> {
  if (!isTauriRuntime()) return null;
  return invokeNative<NativeCommandResult>("set_overlay_state", { state });
}

export async function listenNativeEvent<T>(eventName: string, handler: (payload: T) => void): Promise<() => void> {
  if (!isTauriRuntime()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<T>(eventName, (event) => handler(event.payload));
}

export async function probeMicrophonePermission(): Promise<MicrophoneProbe> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      ok: false,
      message: "Microphone APIs are not available in this runtime.",
      deviceCount: 0,
      labels: []
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const labels = stream.getAudioTracks().map((track) => track.label || "Microphone");
    stream.getTracks().forEach((track) => track.stop());

    return {
      ok: true,
      message: labels.length > 0 ? "Microphone permission granted." : "Microphone permission granted, but no audio track label was exposed.",
      deviceCount: labels.length,
      labels
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Microphone permission was denied or unavailable.",
      deviceCount: 0,
      labels: []
    };
  }
}

async function invokeNative<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}
