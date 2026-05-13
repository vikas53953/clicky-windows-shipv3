import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FloatingClickyOverlay } from "./components/FloatingClickyOverlay";
import { OverlayPreview } from "./components/OverlayPreview";
import { SettingsPanel } from "./components/SettingsPanel";
import { StatusRail } from "./components/StatusRail";
import { cancelSpeechPlayback, playAudioBlob, speakTextLocally, speakWithVoicebox, speakWithVoxCpm } from "./services/audioPlayback";
import { createInitialSession, reduceClickySession, type ClickySessionEvent } from "./services/clickySession";
import {
  describeNativeRuntime,
  formatNativeCursor,
  getNativeCursorContext,
  getOverlayDiagnostics,
  isTauriRuntime,
  isLiveSessionRequested,
  listenNativeEvent,
  probeMicrophonePermission,
  setNativeOverlayState,
  setNativeOverlayVisible,
  type NativeCursorContext,
  type NativeDiagnostics,
  type NativeOverlayState,
  type NativeShortcutEvent
} from "./services/nativeBridge";
import { overlayTextForSession } from "./services/overlayText";
import { executeDesktopToolCalls, parseDesktopToolBlocks } from "./services/desktopTools";
import { captureScreenContext } from "./services/screenCapture";
import { shouldCaptureScreenForTranscript } from "./services/screenIntent";
import { migrateStoredSettings } from "./services/settingsMigration";
import { createSentenceStreamingSpeech } from "./services/streamingSpeech";
import { shouldConfirmTranscriptWithStt } from "./services/transcriptQuality";
import { shouldAutoSendVoice } from "./services/voiceAutoSend";
import { startVoiceCapture, type VoiceCaptureController } from "./services/voiceCapture";
import {
  buildMockResponse,
  chooseFinalTranscript,
  defaultSettings,
  requestTextToSpeech,
  streamChatResponse,
  summarizeVoiceHealth,
  testWorkerConnection,
  testVoiceHealth,
  transcribeAudio,
  type ClickySettings,
  type ScreenContext
} from "./services/workerClient";
import "./styles.css";

const SETTINGS_STORAGE_KEY = "clicky-settings-v1";
const SPEECH_ACTIVITY_THRESHOLD = 0.035;
interface StartListeningOptions {
  autoStopOnSilence?: boolean;
}

interface LiveFlowTiming {
  startedAt: number;
  stopCaptureMs?: number;
  sttMs?: number;
  screenshotMs?: number;
  chatFirstTokenMs?: number;
  chatTotalMs?: number;
  ttsFirstRequestMs?: number;
  ttsFirstAudioMs?: number;
  ttsMs?: number;
  playbackMs?: number;
  totalMs?: number;
  screenshotMode?: "captured" | "skipped" | "failed";
  transcriptSource?: "webview" | "elevenlabs";
  model?: string;
}

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

function summarizeVoiceProviderError(message: string): string {
  if (message.includes("detected_unusual_activity") || message.includes("blocked this key/account")) {
    return "ElevenLabs is blocked for this key/account.";
  }

  if (message.includes("not configured")) {
    return "ElevenLabs is not configured.";
  }

  return message.length > 120 ? `${message.slice(0, 117)}...` : message;
}

async function speakWithLocalFallback(text: string): Promise<"voxcpm" | "voicebox" | "windows" | null> {
  if (await speakWithVoxCpm(text)) return "voxcpm";
  if (await speakWithVoicebox(text)) return "voicebox";
  if (await speakTextLocally(text)) return "windows";
  return null;
}

function msSince(start: number): number {
  return Math.max(0, Math.round(performance.now() - start));
}

function formatMs(ms: number | undefined): string {
  return typeof ms === "number" ? `${ms}ms` : "n/a";
}

function formatTimingSummary(timing: LiveFlowTiming): string {
  const screenshot =
    timing.screenshotMode === "skipped"
      ? "screen skipped"
      : timing.screenshotMode === "failed"
        ? `screen failed ${formatMs(timing.screenshotMs)}`
        : `screen ${formatMs(timing.screenshotMs)}`;

  const model = timing.model || "LLM";
  return `Live flow completed. Timings: stop ${formatMs(timing.stopCaptureMs)}, STT ${timing.transcriptSource ?? "unknown"} ${formatMs(
    timing.sttMs
  )}, ${screenshot}, ${model} first ${formatMs(timing.chatFirstTokenMs)}, ${model} total ${formatMs(timing.chatTotalMs)}, TTS ${formatMs(
    timing.ttsMs
  )}, first voice request ${formatMs(timing.ttsFirstRequestMs)}, first audio ${formatMs(timing.ttsFirstAudioMs)}, playback ${formatMs(
    timing.playbackMs
  )}, total ${formatMs(timing.totalMs)}.`;
}

export default function App() {
  const query = new URLSearchParams(window.location.search);
  const isOverlayWindow = query.get("window") === "overlay";
  const forceMockMode = query.get("mock") === "true";
  const [settings, setSettings] = useState<ClickySettings>(() => loadInitialSettings(forceMockMode));
  const [session, setSession] = useState(createInitialSession);
  const [workerStatus, setWorkerStatus] = useState("Not tested");
  const [cursor, setCursor] = useState({ x: 720, y: 360 });
  const [nativeCursor, setNativeCursor] = useState<NativeCursorContext | null>(null);
  const [nativeDiagnostics, setNativeDiagnostics] = useState<NativeDiagnostics | null>(null);
  const [micStatus, setMicStatus] = useState("Mic not tested");
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [voiceActive, setVoiceActive] = useState(false);
  const [floatingOverlay, setFloatingOverlay] = useState<NativeOverlayState>({
    status: "listening",
    text: "",
    visible: true,
    accentColor: defaultSettings.accentColor,
    avatar: defaultSettings.avatar,
    voiceLevel: 0,
    voiceActive: false
  });
  const timers = useRef<number[]>([]);
  const voiceLevelTimer = useRef<number | null>(null);
  const sessionStatusRef = useRef(session.status);
  const voiceCaptureRef = useRef<VoiceCaptureController | null>(null);
  const voiceCaptureStartRef = useRef<Promise<VoiceCaptureController> | null>(null);
  const recordingStartedAtRef = useRef(0);
  const speechStartedRef = useRef(false);
  const lastVoiceAtRef = useRef(0);
  const silenceStopTriggeredRef = useRef(false);
  const autoStopOnSilenceRef = useRef(true);
  const stopListeningRef = useRef<() => void>(() => undefined);
  const liveFlowTurnRef = useRef<number | null>(null);
  const activeTurnRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);
  const nativeRuntime = isTauriRuntime();

  const dispatch = useCallback((event: ClickySessionEvent) => {
    setSession((current) => reduceClickySession(current, event));
  }, []);

  const beginNewTurn = useCallback(() => {
    activeAbortRef.current?.abort();
    cancelSpeechPlayback();
    activeTurnRef.current += 1;
    const controller = new AbortController();
    activeAbortRef.current = controller;
    return { turnId: activeTurnRef.current, signal: controller.signal };
  }, []);

  const isActiveTurn = useCallback((turnId: number, signal?: AbortSignal) => activeTurnRef.current === turnId && !signal?.aborted, []);

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);

  const clearVoiceMeter = useCallback(() => {
    if (voiceLevelTimer.current !== null) {
      window.clearInterval(voiceLevelTimer.current);
      voiceLevelTimer.current = null;
    }
    setVoiceLevel(0);
    setVoiceActive(false);
    speechStartedRef.current = false;
    lastVoiceAtRef.current = 0;
    silenceStopTriggeredRef.current = false;
  }, []);

  const startVoiceMeter = useCallback(
    (controller?: VoiceCaptureController, onSilenceComplete?: () => void) => {
      clearVoiceMeter();
      voiceLevelTimer.current = window.setInterval(() => {
        const now = Date.now();
        const level = Math.max(0, Math.min(1, controller?.getLevel() ?? 0));
        const isActive = level >= SPEECH_ACTIVITY_THRESHOLD;

        setVoiceLevel(isActive ? level : 0);
        setVoiceActive(isActive);

        if (isActive) {
          speechStartedRef.current = true;
          lastVoiceAtRef.current = now;
        }

        const canAutoSend =
          Boolean(controller) &&
          Boolean(onSilenceComplete) &&
          shouldAutoSendVoice({
            autoStopOnSilence: autoStopOnSilenceRef.current,
            silenceAlreadyTriggered: silenceStopTriggeredRef.current,
            nowMs: now,
            recordingStartedAtMs: recordingStartedAtRef.current,
            speechStarted: speechStartedRef.current,
            lastVoiceAtMs: lastVoiceAtRef.current
          });

        if (canAutoSend) {
          silenceStopTriggeredRef.current = true;
          onSilenceComplete?.();
        }
      }, 70);
    },
    [clearVoiceMeter]
  );

  useEffect(() => {
    sessionStatusRef.current = session.status;
  }, [session.status]);

  useEffect(() => {
    document.documentElement.classList.toggle("overlay-window-root", isOverlayWindow);
    document.body.classList.toggle("overlay-window", isOverlayWindow);
    return () => {
      document.documentElement.classList.remove("overlay-window-root");
      document.body.classList.remove("overlay-window");
    };
  }, [isOverlayWindow]);

  useEffect(() => {
    if (isOverlayWindow || forceMockMode) return;

    let cancelled = false;

    if (nativeRuntime) {
      void isLiveSessionRequested()
        .then((liveSession) => {
          if (cancelled || !liveSession) return;
          setSettings((current) => (current.mockMode ? { ...current, mockMode: false } : current));
          setWorkerStatus("live: Clicky was launched by the live test runner.");
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
        setWorkerStatus(`live: ${health.message ?? "Clicky Worker reachable."}`);
      })
      .catch(() => {
        // Startup auto-detection is best-effort; manual Mock mode remains available.
      });

    return () => {
      cancelled = true;
    };
  }, [forceMockMode, isOverlayWindow, nativeRuntime]);

  useEffect(() => {
    if (nativeRuntime) return;
    const updateCursor = (event: MouseEvent) => setCursor({ x: event.clientX, y: event.clientY });
    window.addEventListener("mousemove", updateCursor);
    return () => window.removeEventListener("mousemove", updateCursor);
  }, [nativeRuntime]);

  useEffect(() => () => {
    clearTimers();
    clearVoiceMeter();
  }, [clearTimers, clearVoiceMeter]);

  useEffect(() => {
    if (isOverlayWindow) return;

    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Settings persistence is a convenience; it must never block Clicky.
    }
  }, [isOverlayWindow, settings]);

  const publishOverlayState = useCallback(
    (state: NativeOverlayState) => {
      const styledState: NativeOverlayState = {
        ...state,
        accentColor: state.accentColor ?? settings.accentColor,
        avatar: state.avatar ?? settings.avatar,
        voiceLevel: state.voiceLevel ?? (state.status === "listening" && voiceActive ? voiceLevel : 0),
        voiceActive: state.voiceActive ?? (state.status === "listening" && voiceActive)
      };
      setFloatingOverlay(styledState);
      void setNativeOverlayState(styledState);
    },
    [settings.accentColor, settings.avatar, voiceActive, voiceLevel]
  );

  const startListening = useCallback((options: StartListeningOptions = {}) => {
    beginNewTurn();
    clearTimers();
    dispatch({ type: "pressToTalkStarted" });
    recordingStartedAtRef.current = Date.now();
    autoStopOnSilenceRef.current = options.autoStopOnSilence ?? true;
    speechStartedRef.current = false;
    lastVoiceAtRef.current = 0;
    silenceStopTriggeredRef.current = false;
    clearVoiceMeter();
    publishOverlayState({ status: "listening", text: "", visible: settings.showClicky, voiceLevel: 0, voiceActive: false });

    if (!settings.mockMode) {
      setMicStatus("Recording microphone...");
      voiceCaptureStartRef.current = startVoiceCapture();
      voiceCaptureStartRef.current
        .then((controller) => {
          voiceCaptureRef.current = controller;
          startVoiceMeter(controller, () => stopListeningRef.current());
          setMicStatus("Recording microphone. Hold while speaking; Clicky will send when you release or pause.");
        })
        .catch((error) => {
          voiceCaptureStartRef.current = null;
          const message = error instanceof Error ? error.message : "Microphone capture failed.";
          setMicStatus(`Blocked: ${message}`);
          dispatch({ type: "failed", message });
        });
    }
  }, [beginNewTurn, clearTimers, clearVoiceMeter, dispatch, publishOverlayState, settings.mockMode, settings.showClicky, startVoiceMeter]);

  const runMockResponse = useCallback(() => {
    clearVoiceMeter();
    dispatch({ type: "pressToTalkEnded", transcript: "Where should I click in this app?" });
    publishOverlayState({ status: "transcribing", text: "Turning speech into text...", visible: settings.showClicky });
    timers.current.push(
      window.setTimeout(() => dispatch({ type: "transcriptReady" }), 350),
      window.setTimeout(() => dispatch({ type: "screenCaptured" }), 750)
    );

    buildMockResponse().forEach((chunk, index) => {
      timers.current.push(window.setTimeout(() => dispatch({ type: "assistantChunk", chunk }), 1150 + index * 380));
    });

    timers.current.push(
      window.setTimeout(() => dispatch({ type: "speechFinished" }), 3000),
      window.setTimeout(() => dispatch({ type: "pointingFinished" }), 4300)
    );
  }, [clearVoiceMeter, dispatch, publishOverlayState, settings.showClicky]);

  const runLiveResponse = useCallback(async () => {
    const turnId = activeTurnRef.current;
    const signal = activeAbortRef.current?.signal;
    if (liveFlowTurnRef.current === turnId) return;
    liveFlowTurnRef.current = turnId;
    const current = () => isActiveTurn(turnId, signal);
    const safeDispatch = (event: ClickySessionEvent) => {
      if (current()) dispatch(event);
    };
    const safeSetWorkerStatus = (message: string) => {
      if (current()) setWorkerStatus(message);
    };
    const safeSetMicStatus = (message: string) => {
      if (current()) setMicStatus(message);
    };

    try {
      const timing: LiveFlowTiming = { startedAt: performance.now(), model: settings.model };
      clearVoiceMeter();
      const controller = voiceCaptureRef.current ?? (await voiceCaptureStartRef.current);
      voiceCaptureRef.current = null;
      voiceCaptureStartRef.current = null;

      if (!controller) {
        throw new Error("Voice capture did not start.");
      }

      const stopStartedAt = performance.now();
      const voice = await controller.stop();
      if (!current()) return;
      timing.stopCaptureMs = msSince(stopStartedAt);
      const audioSize = voice.audioBlob?.size ?? 0;
      let transcript = voice.transcript.trim();
      timing.transcriptSource = transcript ? "webview" : "elevenlabs";
      publishOverlayState({ status: "transcribing", text: "Transcribing your voice...", visible: settings.showClicky });
      safeSetMicStatus(
        transcript
          ? `${audioSize > 0 ? `Recorded ${Math.round(audioSize / 1024)} KB.` : "Recorded audio."} Using local WebView speech recognition.`
          : `${audioSize > 0 ? `Recorded ${Math.round(audioSize / 1024)} KB.` : "Recorded audio."} Transcribing with ElevenLabs...`
      );

      const shouldUseElevenLabsTranscript =
        Boolean(voice.audioBlob?.size) && (!settings.mockMode || !transcript || (voice.speechRecognitionUsed && shouldConfirmTranscriptWithStt(transcript)));

      if (shouldUseElevenLabsTranscript && voice.audioBlob && voice.audioBlob.size > 0) {
        try {
          const sttStartedAt = performance.now();
          const elevenLabsTranscript = await transcribeAudio(settings, voice.audioBlob, signal);
          if (!current()) return;
          timing.sttMs = msSince(sttStartedAt);
          const finalTranscript = chooseFinalTranscript({
            webviewTranscript: transcript,
            providerTranscript: elevenLabsTranscript
          });
          transcript = finalTranscript.transcript;
          timing.transcriptSource = finalTranscript.source;
        } catch (error) {
          if (!transcript) throw error;
          safeSetMicStatus("ElevenLabs transcription failed; using WebView transcript.");
        }
      } else {
        timing.sttMs = 0;
      }

      if (!transcript) {
        throw new Error("I recorded audio, but could not detect speech. Please try again closer to the microphone.");
      }

      safeSetMicStatus(
        `Heard: "${transcript.slice(0, 120)}${transcript.length > 120 ? "..." : ""}"${
          voice.speechRecognitionUsed ? " (WebView recognition was also available.)" : ""
        }`
      );

      safeDispatch({ type: "pressToTalkEnded", transcript });
      publishOverlayState({ status: "transcribing", text: "Turning speech into text...", visible: settings.showClicky });

      safeDispatch({ type: "transcriptReady" });
      let screenshots: ScreenContext[] = [];
      const needsScreenContext = shouldCaptureScreenForTranscript(transcript);
      if (needsScreenContext) {
        const screenshotStartedAt = performance.now();
        try {
          screenshots = await captureScreenContext();
          timing.screenshotMs = msSince(screenshotStartedAt);
          timing.screenshotMode = "captured";
          safeSetWorkerStatus(`Captured screen: ${screenshots[0]?.width ?? 0}x${screenshots[0]?.height ?? 0}`);
        } catch (error) {
          timing.screenshotMs = msSince(screenshotStartedAt);
          timing.screenshotMode = "failed";
          const message = error instanceof Error ? error.message : "Screen capture skipped.";
          safeSetWorkerStatus(`Screen capture skipped: ${message}`);
        }
      } else {
        timing.screenshotMs = 0;
        timing.screenshotMode = "skipped";
        safeSetWorkerStatus("Skipped screenshot for a quick conversational prompt.");
      }

      safeDispatch({ type: "screenCaptured" });
      safeSetWorkerStatus(`Streaming ${settings.provider}/${settings.model} via Worker...`);
      publishOverlayState({ status: "thinking", text: `Asking ${settings.model} through the Worker...`, visible: settings.showClicky });

      const chatStartedAt = performance.now();
      let firstTokenSeen = false;
      const speechQueue = settings.voiceEnabled
        ? createSentenceStreamingSpeech({
            settings,
            startedAt: timing.startedAt,
            signal,
            onFirstTtsRequestMs: (ms) => {
              timing.ttsFirstRequestMs = ms;
              safeSetWorkerStatus(`Streaming voice started after ${ms}ms; ${settings.model} is still answering.`);
            },
            onFirstAudioReadyMs: (ms) => {
              timing.ttsFirstAudioMs = ms;
              safeSetWorkerStatus(`First ElevenLabs audio ready after ${ms}ms; continuing streamed playback.`);
            }
          })
        : null;
      const responseText = await streamChatResponse(settings, { transcript, screenshots, quickResponse: !needsScreenContext }, (chunk) => {
        if (!current()) return;
        if (!firstTokenSeen) {
          firstTokenSeen = true;
          timing.chatFirstTokenMs = msSince(chatStartedAt);
        }
        safeDispatch({ type: "assistantChunk", chunk });
        speechQueue?.push(chunk);
      }, signal);
      if (!current()) return;
      timing.chatTotalMs = msSince(chatStartedAt);

      if (settings.voiceEnabled) {
        try {
          speechQueue?.finish();
          const speechMetrics = await speechQueue?.waitUntilDone();
          timing.ttsMs = speechMetrics?.ttsTotalMs;
          timing.playbackMs = speechMetrics?.playbackTotalMs;
          timing.ttsFirstRequestMs = speechMetrics?.firstTtsRequestMs ?? timing.ttsFirstRequestMs;
          timing.ttsFirstAudioMs = speechMetrics?.firstAudioReadyMs ?? timing.ttsFirstAudioMs;
          if (!speechMetrics?.segments) {
            safeSetWorkerStatus("TTS mock response returned; keeping text visible.");
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "TTS failed.";
          const reason = summarizeVoiceProviderError(message);
          const localVoice = await speakWithLocalFallback(responseText);
          const fallbackLabel =
            localVoice === "voxcpm"
              ? "local VoxCPM spoke the answer"
              : localVoice === "voicebox"
                ? "local Voicebox/Chatterbox spoke the answer"
                : localVoice === "windows"
                  ? "local Windows voice spoke the answer"
                  : "no local voice engine responded; text response remains visible";
          safeSetWorkerStatus(`ElevenLabs unavailable; ${fallbackLabel}. ${reason}`);
        }
      }

      const desktopTools = parseDesktopToolBlocks(responseText).toolCalls;
      if (desktopTools.length) {
        const toolResults = await executeDesktopToolCalls({
          toolCalls: desktopTools,
          transcript,
          computerUseEnabled: settings.computerUseEnabled,
          onStatus: safeSetWorkerStatus
        });
        if (toolResults.length) {
          safeSetWorkerStatus(`Computer tool: ${toolResults.join(" ")}`);
        } else if (settings.computerUseEnabled) {
          safeSetWorkerStatus("Computer tool skipped because the request was not explicit enough.");
        }
      }

      safeDispatch({ type: "speechFinished" });
      timers.current.push(window.setTimeout(() => safeDispatch({ type: "pointingFinished" }), 1500));
      timing.totalMs = msSince(timing.startedAt);
      safeSetWorkerStatus(formatTimingSummary(timing));
    } catch (error) {
      if (signal?.aborted || !current()) return;
      const message = error instanceof Error ? error.message : "Live Clicky flow failed.";
      safeSetWorkerStatus(message);
      safeDispatch({ type: "failed", message });
    } finally {
      if (liveFlowTurnRef.current === turnId) liveFlowTurnRef.current = null;
      if (current()) clearVoiceMeter();
    }
  }, [clearVoiceMeter, dispatch, isActiveTurn, publishOverlayState, settings]);

  const stopListening = useCallback(() => {
    if (settings.mockMode) {
      runMockResponse();
      return;
    }

    void runLiveResponse();
  }, [runLiveResponse, runMockResponse, settings.mockMode]);

  useEffect(() => {
    stopListeningRef.current = stopListening;
  }, [stopListening]);

  const toggleListening = useCallback(() => {
    if (sessionStatusRef.current === "listening") {
      stopListening();
    } else {
      startListening();
    }
  }, [startListening, stopListening]);

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
    }).then((unlisten) => unlistenCallbacks.push(unlisten));

    void listenNativeEvent<NativeOverlayState>("clicky-overlay-state", (state) => {
      setFloatingOverlay(state);
    }).then((unlisten) => unlistenCallbacks.push(unlisten));

    if (!isOverlayWindow) {
      void listenNativeEvent<NativeShortcutEvent>("clicky-shortcut", (event) => {
        if (event.phase === "toggle") {
          toggleListening();
          return;
        }
        if (event.phase === "started" && sessionStatusRef.current !== "listening") startListening({ autoStopOnSilence: false });
        if (event.phase === "ended" && sessionStatusRef.current === "listening") stopListening();
      }).then((unlisten) => unlistenCallbacks.push(unlisten));
    }

    return () => {
      unlistenCallbacks.forEach((unlisten) => unlisten());
    };
  }, [isOverlayWindow, nativeRuntime, startListening, stopListening, toggleListening]);

  useEffect(() => {
    if (isOverlayWindow) return;
    const overlayStatus = session.status === "idle" ? "listening" : session.status;
    const state: NativeOverlayState = {
      status: overlayStatus,
      text: session.status === "idle" || session.status === "listening" ? "" : overlayTextForSession(session),
      visible: settings.showClicky,
      accentColor: settings.accentColor,
      avatar: settings.avatar,
      voiceLevel: overlayStatus === "listening" && voiceActive ? voiceLevel : 0,
      voiceActive: overlayStatus === "listening" && voiceActive
    };
    setFloatingOverlay(state);
    void setNativeOverlayState(state);
  }, [isOverlayWindow, session, settings.accentColor, settings.avatar, settings.showClicky, voiceActive, voiceLevel]);

  useEffect(() => {
    if (!nativeRuntime || isOverlayWindow) return;
    void setNativeOverlayVisible(settings.showClicky);
  }, [isOverlayWindow, nativeRuntime, settings.showClicky]);

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

  const handleTestWorker = async () => {
    setWorkerStatus("Checking...");
    try {
      const health = await testWorkerConnection(settings);
      setWorkerStatus(`${health.mode}: ${health.message}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Worker check failed";
      setWorkerStatus(message);
      dispatch({ type: "failed", message });
    }
  };

  const handleTestVoice = async () => {
    setWorkerStatus("Testing voice...");
    try {
      if (!settings.mockMode) {
        const health = await testVoiceHealth(settings);
        if (!health.ok) {
          const reason = summarizeVoiceHealth(health);
          const localVoice = await speakWithLocalFallback("Clicky voice test.");
          if (localVoice) {
            const fallbackName = localVoice === "voxcpm" ? "VoxCPM" : localVoice === "voicebox" ? "Voicebox/Chatterbox" : "Windows voice";
            setWorkerStatus(`ElevenLabs voice failed; local ${fallbackName} fallback worked. ${reason}`);
            return;
          }

          setWorkerStatus(`ElevenLabs voice failed; no local voice engine responded. ${reason}`);
          dispatch({ type: "failed", message: reason });
          return;
        }
      }

      const audio = await requestTextToSpeech(settings, "Clicky voice test.");
      if (audio) {
        setWorkerStatus(`Voice test passed (${Math.round(audio.size / 1024)} KB).`);
        await playAudioBlob(audio);
      } else {
        setWorkerStatus("Voice test passed in mock mode.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Voice test failed.";
      const reason = summarizeVoiceProviderError(message);
      const localVoice = await speakWithLocalFallback("Clicky voice test.");
      if (localVoice) {
        const fallbackName = localVoice === "voxcpm" ? "VoxCPM" : localVoice === "voicebox" ? "Voicebox/Chatterbox" : "Windows voice";
        setWorkerStatus(`ElevenLabs voice failed; local ${fallbackName} fallback worked. ${reason}`);
        return;
      }
      setWorkerStatus(`ElevenLabs voice failed; no local voice engine responded. ${reason}`);
      dispatch({ type: "failed", message });
    }
  };

  const handleProbeMic = async () => {
    setMicStatus("Checking microphone...");
    const result = await probeMicrophonePermission();
    const deviceText = result.deviceCount > 0 ? ` ${result.deviceCount} input track${result.deviceCount === 1 ? "" : "s"}.` : "";
    setMicStatus(`${result.ok ? "OK" : "Blocked"}: ${result.message}${deviceText}`);
  };

  const clearConversation = () => {
    clearTimers();
    clearVoiceMeter();
    dispatch({ type: "clearConversation" });
  };

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

  if (isOverlayWindow) {
    return (
      <FloatingClickyOverlay
        status={floatingOverlay.status}
        text={floatingOverlay.text}
        showClicky={floatingOverlay.visible}
        accentColor={floatingOverlay.accentColor ?? settings.accentColor}
        avatar={floatingOverlay.avatar ?? settings.avatar}
        voiceLevel={floatingOverlay.voiceLevel ?? voiceLevel}
        voiceActive={floatingOverlay.voiceActive ?? voiceActive}
      />
    );
  }

  return (
    <main className="app-shell">
      <SettingsPanel
        settings={settings}
        onSettingsChange={setSettings}
        onToggleListening={toggleListening}
        onStartListening={startListening}
        onStopListening={stopListening}
        onTestWorker={handleTestWorker}
        onTestVoice={handleTestVoice}
        onProbeMic={handleProbeMic}
        onClear={clearConversation}
        listening={session.status === "listening"}
        nativeSummary={nativeStatus.runtime}
        micStatus={micStatus}
      />
      <div className="workspace">
        <OverlayPreview
          session={session}
          cursor={cursor}
          showClicky={settings.showClicky}
          accentColor={settings.accentColor}
          avatar={settings.avatar}
          voiceLevel={voiceLevel}
          voiceActive={voiceActive}
        />
        <StatusRail session={session} workerStatus={workerStatus} nativeStatus={nativeStatus} />
      </div>
    </main>
  );
}
