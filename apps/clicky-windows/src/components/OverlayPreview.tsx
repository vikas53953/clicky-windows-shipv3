import type { CSSProperties } from "react";
import { Loader2, Mic, MousePointer2, Volume2 } from "lucide-react";
import type { ClickySession } from "../services/clickySession";
import { overlayTextForSession } from "../services/overlayText";
import { ClickyMark } from "./ClickyMark";
import { VoiceWaveform } from "./VoiceWaveform";
import type { ClickyAvatar } from "../services/workerClient";

interface OverlayPreviewProps {
  session: ClickySession;
  showClicky: boolean;
  cursor: { x: number; y: number };
  compact?: boolean;
  accentColor?: string;
  avatar?: ClickyAvatar;
  voiceLevel?: number;
  voiceActive?: boolean;
}

export function OverlayPreview({
  session,
  showClicky,
  cursor,
  compact = false,
  accentColor = "#3b82f6",
  avatar = "classic",
  voiceLevel = 0,
  voiceActive = false
}: OverlayPreviewProps) {
  const activePoint = session.points.at(-1);
  const previewStatus = session.status === "idle" ? "listening" : session.status;
  const showBubble = session.status !== "idle" && session.status !== "listening";
  const previewPoint = activePoint
    ? {
        left: `${Math.min(92, Math.max(8, (activePoint.x / 1440) * 100))}%`,
        top: `${Math.min(82, Math.max(18, (activePoint.y / 900) * 100))}%`
      }
    : {
        left: `${Math.min(82, Math.max(12, (cursor.x / Math.max(window.innerWidth, 1)) * 100))}%`,
        top: `${Math.min(76, Math.max(20, (cursor.y / Math.max(window.innerHeight, 1)) * 100))}%`
      };

  return (
    <section
      className={compact ? "overlay-preview compact" : "overlay-preview"}
      aria-label="Clicky overlay preview"
      style={{ "--clicky-accent": accentColor } as CSSProperties}
    >
      <div className="screen-hint">
        <div className="mock-app-line wide" />
        <div className="mock-app-line" />
        <div className="mock-toolbar">
          <span />
          <span />
          <span />
        </div>
      </div>

      {showClicky ? (
        <div className={`clicky-buddy clicky-${previewStatus} ${session.status === "idle" ? "ready-listening" : ""}`} style={previewPoint}>
          <ClickyMark avatar={avatar} accentColor={accentColor} size="preview" />
          {session.status === "listening" && voiceActive ? <VoiceWaveform level={voiceLevel} compact /> : null}
          <div className="clicky-state-badge">
            {session.status === "thinking" || session.status === "transcribing" || session.status === "capturing_screen" ? (
              <Loader2 size={12} aria-hidden="true" className="spin" />
            ) : session.status === "speaking" ? (
              <Volume2 size={12} aria-hidden="true" />
            ) : session.status === "listening" || session.status === "idle" ? (
              <Mic size={12} aria-hidden="true" />
            ) : (
              <MousePointer2 size={12} aria-hidden="true" />
            )}
          </div>
          {session.status === "pointing" && activePoint ? <div className="point-ring" aria-hidden="true" /> : null}
        </div>
      ) : null}

      {showBubble ? (
        <div className="overlay-bubble">
          <span className="bubble-title">Clicky</span>
          <p>{overlayTextForSession(session)}</p>
        </div>
      ) : null}
    </section>
  );
}
