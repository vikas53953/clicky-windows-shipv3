import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { cancelSpeechPlayback, playAudioBlob, speakTextLocally } from "../services/audioPlayback";
import type { ClickySession, ClickySessionEvent } from "../services/clickySession";
import { executeDesktopToolCalls, parseDesktopToolBlocks } from "../services/desktopTools";
import { probeMicrophonePermission, type NativeOverlayState } from "../services/nativeBridge";
import { parsePointTags } from "../services/pointTags";
import { captureScreenContext } from "../services/screenCapture";
import { shouldCaptureScreenForTranscript } from "../services/screenIntent";
import { createSentenceStreamingSpeech } from "../services/streamingSpeech";
import { shouldConfirmTranscriptWithStt } from "../services/transcriptQuality";
import { startVoiceCapture, type VoiceCaptureController } from "../services/voiceCapture";
import {
  buildMockResponse,
  chooseFinalTranscript,
  modelSupportsScreenImages,
  requestTextToSpeech,
  streamChatResponse,
  summarizeVoiceHealth,
  testVoiceHealth,
  testWorkerConnection,
  transcribeAudio,
  type ClickySettings,
  type ConversationMessage,
  type ScreenContext
} from "../services/workerClient";
import { parseWorkflowPlanBlocks } from "../services/workflowPlan";
import type { StartListeningOptions } from "./useVoiceCapture";

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

interface UseLiveFlowOptions {
  settings: ClickySettings;
  dispatch: (event: ClickySessionEvent) => void;
  sessionStatusRef: MutableRefObject<ClickySession["status"]>;
  conversationMessagesRef: MutableRefObject<ConversationMessage[]>;
  setConversationMessages: Dispatch<SetStateAction<ConversationMessage[]>>;
  setWorkerStatus: Dispatch<SetStateAction<string>>;
  setMicStatus: Dispatch<SetStateAction<string>>;
  voiceCaptureRef: MutableRefObject<VoiceCaptureController | null>;
  voiceCaptureStartRef: MutableRefObject<Promise<VoiceCaptureController> | null>;
  recordingStartedAtRef: MutableRefObject<number>;
  speechStartedRef: MutableRefObject<boolean>;
  lastVoiceAtRef: MutableRefObject<number>;
  silenceStopTriggeredRef: MutableRefObject<boolean>;
  autoStopOnSilenceRef: MutableRefObject<boolean>;
  stopListeningRef: MutableRefObject<() => void>;
  clearVoiceMeter: () => void;
  startVoiceMeter: (controller?: VoiceCaptureController, onSilenceComplete?: () => void) => void;
  publishOverlayState: (state: NativeOverlayState) => void;
}

function cleanAssistantMemoryText(rawResponse: string): string {
  const pointParsed = parsePointTags(rawResponse);
  const toolsParsed = parseDesktopToolBlocks(pointParsed.cleanText);
  const planParsed = parseWorkflowPlanBlocks(toolsParsed.cleanText);
  return planParsed.cleanText.trim();
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

async function speakWithLocalFallback(text: string): Promise<"windows" | null> {
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

export function useLiveFlow({
  settings,
  dispatch,
  sessionStatusRef,
  conversationMessagesRef,
  setConversationMessages,
  setWorkerStatus,
  setMicStatus,
  voiceCaptureRef,
  voiceCaptureStartRef,
  recordingStartedAtRef,
  speechStartedRef,
  lastVoiceAtRef,
  silenceStopTriggeredRef,
  autoStopOnSilenceRef,
  stopListeningRef,
  clearVoiceMeter,
  startVoiceMeter,
  publishOverlayState
}: UseLiveFlowOptions): {
  startListening: (options?: StartListeningOptions) => void;
  stopListening: () => void;
  toggleListening: () => void;
  clearConversation: () => void;
  handleTestWorker: () => Promise<void>;
  handleTestVoice: () => Promise<void>;
  handleProbeMic: () => Promise<void>;
} {
  const timers = useRef<number[]>([]);
  const liveFlowTurnRef = useRef<number | null>(null);
  const activeTurnRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);

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

  useEffect(() => () => {
    clearTimers();
  }, [clearTimers]);

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
  }, [
    autoStopOnSilenceRef,
    beginNewTurn,
    clearTimers,
    clearVoiceMeter,
    dispatch,
    lastVoiceAtRef,
    publishOverlayState,
    recordingStartedAtRef,
    setMicStatus,
    settings.mockMode,
    settings.showClicky,
    silenceStopTriggeredRef,
    speechStartedRef,
    startVoiceMeter,
    stopListeningRef,
    voiceCaptureRef,
    voiceCaptureStartRef
  ]);

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
      const canUseScreenshots = modelSupportsScreenImages(settings);
      safeSetWorkerStatus(
        screenshots.length && !canUseScreenshots
          ? `Streaming ${settings.provider}/${settings.model}; this model cannot receive raw screenshots, so Clicky will use transcript and tools only.`
          : `Streaming ${settings.provider}/${settings.model} via Worker...`
      );
      publishOverlayState({
        status: "thinking",
        text:
          screenshots.length && !canUseScreenshots
            ? "Current model cannot see screenshots. I will answer from your words and tools only."
            : `Asking ${settings.model} through the Worker...`,
        visible: settings.showClicky
      });

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
      const responseText = await streamChatResponse(
        settings,
        { transcript, screenshots, quickResponse: !needsScreenContext, messages: conversationMessagesRef.current },
        (chunk) => {
          if (!current()) return;
          if (!firstTokenSeen) {
            firstTokenSeen = true;
            timing.chatFirstTokenMs = msSince(chatStartedAt);
          }
          safeDispatch({ type: "assistantChunk", chunk });
          speechQueue?.push(chunk);
        },
        signal
      );
      if (!current()) return;
      timing.chatTotalMs = msSince(chatStartedAt);
      const assistantMemory = cleanAssistantMemoryText(responseText);
      const newMessages: ConversationMessage[] = [
        { role: "user", content: transcript },
        { role: "assistant", content: assistantMemory || responseText }
      ];
      setConversationMessages((currentMessages) => [...currentMessages, ...newMessages].slice(-20));

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
          const fallbackLabel = localVoice === "windows" ? "local Windows voice spoke the answer" : "no local voice engine responded; text response remains visible";
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
  }, [
    clearVoiceMeter,
    conversationMessagesRef,
    dispatch,
    isActiveTurn,
    publishOverlayState,
    setConversationMessages,
    setMicStatus,
    setWorkerStatus,
    settings,
    voiceCaptureRef,
    voiceCaptureStartRef
  ]);

  const stopListening = useCallback(() => {
    if (settings.mockMode) {
      runMockResponse();
      return;
    }

    void runLiveResponse();
  }, [runLiveResponse, runMockResponse, settings.mockMode]);

  useEffect(() => {
    stopListeningRef.current = stopListening;
  }, [stopListening, stopListeningRef]);

  const toggleListening = useCallback(() => {
    if (sessionStatusRef.current === "listening") {
      stopListening();
    } else {
      startListening();
    }
  }, [sessionStatusRef, startListening, stopListening]);

  const handleTestWorker = useCallback(async () => {
    setWorkerStatus("Checking...");
    try {
      const health = await testWorkerConnection(settings);
      setWorkerStatus(`${health.mode}: ${health.message}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Worker check failed";
      setWorkerStatus(message);
      dispatch({ type: "failed", message });
    }
  }, [dispatch, setWorkerStatus, settings]);

  const handleTestVoice = useCallback(async () => {
    setWorkerStatus("Testing voice...");
    try {
      if (!settings.mockMode) {
        const health = await testVoiceHealth(settings);
        if (!health.ok) {
          const reason = summarizeVoiceHealth(health);
          const localVoice = await speakWithLocalFallback("Clicky voice test.");
          if (localVoice) {
            setWorkerStatus(`ElevenLabs voice failed; local Windows voice fallback worked. ${reason}`);
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
        setWorkerStatus(`ElevenLabs voice failed; local Windows voice fallback worked. ${reason}`);
        return;
      }
      setWorkerStatus(`ElevenLabs voice failed; no local voice engine responded. ${reason}`);
      dispatch({ type: "failed", message });
    }
  }, [dispatch, setWorkerStatus, settings]);

  const handleProbeMic = useCallback(async () => {
    setMicStatus("Checking microphone...");
    const result = await probeMicrophonePermission();
    const deviceText = result.deviceCount > 0 ? ` ${result.deviceCount} input track${result.deviceCount === 1 ? "" : "s"}.` : "";
    setMicStatus(`${result.ok ? "OK" : "Blocked"}: ${result.message}${deviceText}`);
  }, [setMicStatus]);

  const clearConversation = useCallback(() => {
    clearTimers();
    clearVoiceMeter();
    setConversationMessages([]);
    dispatch({ type: "clearConversation" });
  }, [clearTimers, clearVoiceMeter, dispatch, setConversationMessages]);

  return {
    startListening,
    stopListening,
    toggleListening,
    clearConversation,
    handleTestWorker,
    handleTestVoice,
    handleProbeMic
  };
}
