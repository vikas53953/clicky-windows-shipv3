import type { CSSProperties } from "react";
import { Loader2, Volume2 } from "lucide-react";
import type { ClickyStatus } from "../services/clickySession";
import { ClickyMark } from "./ClickyMark";
import { VoiceWaveform } from "./VoiceWaveform";
import type { ClickyAvatar } from "../services/workerClient";

interface FloatingClickyOverlayProps {
  status: ClickyStatus;
  text: string;
  showClicky: boolean;
  accentColor?: string;
  avatar?: ClickyAvatar;
  voiceLevel?: number;
  voiceActive?: boolean;
}

export function FloatingClickyOverlay({
  status,
  text,
  showClicky,
  accentColor = "#3b82f6",
  avatar = "classic",
  voiceLevel = 0,
  voiceActive = false
}: FloatingClickyOverlayProps) {
  const showBubble = status !== "idle" && status !== "listening" && text.trim().length > 0;
  const readyListening = status === "listening" && !showBubble;
  const style = { "--clicky-accent": accentColor } as CSSProperties;

  return (
    <section className={`floating-overlay floating-${status}`} aria-label="Clicky floating overlay" style={style}>
      {showClicky ? (
        <div className={`floating-buddy clicky-${status} ${readyListening ? "ready-listening" : ""}`}>
          <ClickyMark avatar={avatar} accentColor={accentColor} size="small" />
          {status === "listening" && voiceActive ? <VoiceWaveform level={voiceLevel} compact /> : null}
          {status === "thinking" || status === "transcribing" || status === "capturing_screen" || status === "speaking" ? (
            <div className="floating-state-dot">
              {status === "speaking" ? <Volume2 size={11} aria-hidden="true" /> : <Loader2 size={11} aria-hidden="true" className="spin" />}
            </div>
          ) : null}
          {status === "pointing" ? <div className="point-ring" aria-hidden="true" /> : null}
        </div>
      ) : null}
      {showBubble ? (
        <div className="floating-bubble">
          <span className="bubble-title">Clicky</span>
          <p>{text}</p>
        </div>
      ) : null}
    </section>
  );
}
