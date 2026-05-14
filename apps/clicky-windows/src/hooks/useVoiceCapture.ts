import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { shouldAutoSendVoice } from "../services/voiceAutoSend";
import { type VoiceCaptureController } from "../services/voiceCapture";

const SPEECH_ACTIVITY_THRESHOLD = 0.035;

export interface StartListeningOptions {
  autoStopOnSilence?: boolean;
}

export function useVoiceCapture(): {
  micStatus: string;
  setMicStatus: Dispatch<SetStateAction<string>>;
  voiceLevel: number;
  voiceActive: boolean;
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
} {
  const [micStatus, setMicStatus] = useState("Mic not tested");
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [voiceActive, setVoiceActive] = useState(false);
  const voiceLevelTimer = useRef<number | null>(null);
  const voiceCaptureRef = useRef<VoiceCaptureController | null>(null);
  const voiceCaptureStartRef = useRef<Promise<VoiceCaptureController> | null>(null);
  const recordingStartedAtRef = useRef(0);
  const speechStartedRef = useRef(false);
  const lastVoiceAtRef = useRef(0);
  const silenceStopTriggeredRef = useRef(false);
  const autoStopOnSilenceRef = useRef(true);
  const stopListeningRef = useRef<() => void>(() => undefined);

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

  useEffect(() => clearVoiceMeter, [clearVoiceMeter]);

  return {
    micStatus,
    setMicStatus,
    voiceLevel,
    voiceActive,
    voiceCaptureRef,
    voiceCaptureStartRef,
    recordingStartedAtRef,
    speechStartedRef,
    lastVoiceAtRef,
    silenceStopTriggeredRef,
    autoStopOnSilenceRef,
    stopListeningRef,
    clearVoiceMeter,
    startVoiceMeter
  };
}
