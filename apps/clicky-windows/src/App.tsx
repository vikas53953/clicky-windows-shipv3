import { useCallback, useState } from "react";
import { FloatingClickyOverlay } from "./components/FloatingClickyOverlay";
import { OverlayPreview } from "./components/OverlayPreview";
import { SettingsPanel } from "./components/SettingsPanel";
import { StatusRail } from "./components/StatusRail";
import { useClickySession } from "./hooks/useClickySession";
import { useLiveFlow } from "./hooks/useLiveFlow";
import { useNativeOverlay } from "./hooks/useNativeOverlay";
import { useSettings } from "./hooks/useSettings";
import { useShortcuts } from "./hooks/useShortcuts";
import { useVoiceCapture } from "./hooks/useVoiceCapture";
import "./styles.css";

export default function App() {
  const query = new URLSearchParams(window.location.search);
  const isOverlayWindow = query.get("window") === "overlay";
  const forceMockMode = query.get("mock") === "true";
  const [workerStatus, setWorkerStatus] = useState("Not tested");
  const handleWorkerStatus = useCallback((message: string) => setWorkerStatus(message), []);
  const { settings, setSettings, nativeRuntime } = useSettings({
    forceMockMode,
    isOverlayWindow,
    onWorkerStatus: handleWorkerStatus
  });
  const { session, dispatch, conversationMessagesRef, sessionStatusRef, setConversationMessages } = useClickySession();
  const voice = useVoiceCapture();
  const { cursor, cursorContext, floatingOverlay, publishOverlayState, nativeStatus } = useNativeOverlay({
    isOverlayWindow,
    nativeRuntime,
    settings,
    session,
    micStatus: voice.micStatus,
    voiceLevel: voice.voiceLevel,
    voiceActive: voice.voiceActive
  });
  const liveFlow = useLiveFlow({
    settings,
    dispatch,
    sessionStatusRef,
    conversationMessagesRef,
    setConversationMessages,
    setWorkerStatus,
    setMicStatus: voice.setMicStatus,
    voiceCaptureRef: voice.voiceCaptureRef,
    voiceCaptureStartRef: voice.voiceCaptureStartRef,
    recordingStartedAtRef: voice.recordingStartedAtRef,
    speechStartedRef: voice.speechStartedRef,
    lastVoiceAtRef: voice.lastVoiceAtRef,
    silenceStopTriggeredRef: voice.silenceStopTriggeredRef,
    autoStopOnSilenceRef: voice.autoStopOnSilenceRef,
    stopListeningRef: voice.stopListeningRef,
    clearVoiceMeter: voice.clearVoiceMeter,
    startVoiceMeter: voice.startVoiceMeter,
    publishOverlayState
  });

  useShortcuts({
    nativeRuntime,
    isOverlayWindow,
    sessionStatusRef,
    startListening: liveFlow.startListening,
    stopListening: liveFlow.stopListening
  });

  if (isOverlayWindow) {
    return (
      <FloatingClickyOverlay
        status={floatingOverlay.status}
        text={floatingOverlay.text}
        showClicky={floatingOverlay.visible}
        accentColor={floatingOverlay.accentColor ?? settings.accentColor}
        avatar={floatingOverlay.avatar ?? settings.avatar}
        voiceLevel={floatingOverlay.voiceLevel ?? voice.voiceLevel}
        voiceActive={floatingOverlay.voiceActive ?? voice.voiceActive}
        cursor={floatingOverlay.cursor ?? cursorContext ?? undefined}
        activePoint={floatingOverlay.activePoint}
        overlayMonitor={floatingOverlay.overlayMonitor}
      />
    );
  }

  return (
    <main className="app-shell">
      <SettingsPanel
        settings={settings}
        onSettingsChange={setSettings}
        onToggleListening={liveFlow.toggleListening}
        onStartListening={liveFlow.startListening}
        onStopListening={liveFlow.stopListening}
        onTestWorker={liveFlow.handleTestWorker}
        onTestVoice={liveFlow.handleTestVoice}
        onProbeMic={liveFlow.handleProbeMic}
        onClear={liveFlow.clearConversation}
        listening={session.status === "listening"}
        nativeSummary={nativeStatus.runtime}
        micStatus={voice.micStatus}
      />
      <div className="workspace">
        <OverlayPreview
          session={session}
          cursor={cursor}
          showClicky={settings.showClicky}
          accentColor={settings.accentColor}
          avatar={settings.avatar}
          voiceLevel={voice.voiceLevel}
          voiceActive={voice.voiceActive}
        />
        <StatusRail session={session} workerStatus={workerStatus} nativeStatus={nativeStatus} />
      </div>
    </main>
  );
}
