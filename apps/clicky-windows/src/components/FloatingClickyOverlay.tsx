import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Loader2, Volume2 } from "lucide-react";
import type { ClickyStatus } from "../services/clickySession";
import type { NativeCursorContext } from "../services/nativeBridge";
import type { PointTarget } from "../services/pointTags";
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
  cursor?: NativeCursorContext;
  activePoint?: PointTarget;
  overlayMonitor?: NativeCursorContext;
}

interface FlightPosition {
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

export function FloatingClickyOverlay({
  status,
  text,
  showClicky,
  accentColor = "#3b82f6",
  avatar = "classic",
  voiceLevel = 0,
  voiceActive = false,
  cursor,
  activePoint,
  overlayMonitor
}: FloatingClickyOverlayProps) {
  const showBubble = status !== "idle" && status !== "listening" && text.trim().length > 0;
  const readyListening = status === "listening" && !showBubble;
  const monitor = overlayMonitor ?? cursor;
  const target = useMemo(() => {
    return pointToOverlayPosition(status === "pointing" ? activePoint : undefined, monitor, cursor);
  }, [activePoint, cursor, monitor, status]);
  const [flightPosition, setFlightPosition] = useState<FlightPosition>(() => ({ ...target, rotation: 0, scale: 1 }));
  const positionRef = useRef<FlightPosition>({ ...target, rotation: 0, scale: 1 });
  const activeFlightKeyRef = useRef("");
  const style = {
    "--clicky-accent": accentColor,
    "--clicky-x": `${flightPosition.x}px`,
    "--clicky-y": `${flightPosition.y}px`
  } as CSSProperties;

  useEffect(() => {
    if (!showClicky) return;

    const pointKey = status === "pointing" && activePoint ? `${activePoint.screen}:${activePoint.x}:${activePoint.y}:${activePoint.label}` : "";
    if (!pointKey) {
      activeFlightKeyRef.current = "";
      const next = { ...target, rotation: 0, scale: 1 };
      positionRef.current = next;
      setFlightPosition(next);
      return;
    }

    if (activeFlightKeyRef.current === pointKey) return;
    activeFlightKeyRef.current = pointKey;

    const start = positionRef.current;
    const end = { ...target, rotation: start.rotation, scale: 1 };
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const lift = Math.min(180, Math.max(72, distance * 0.24));
    const control = {
      x: (start.x + end.x) / 2,
      y: Math.min(start.y, end.y) - lift
    };
    const startedAt = performance.now();
    const duration = Math.min(1100, Math.max(520, distance * 0.72));
    let frame = 0;

    const animate = (now: number) => {
      const rawT = Math.min(1, (now - startedAt) / duration);
      const t = easeInOutCubic(rawT);
      const x = quadratic(start.x, control.x, end.x, t);
      const y = quadratic(start.y, control.y, end.y, t);
      const dx = quadraticDerivative(start.x, control.x, end.x, t);
      const dy = quadraticDerivative(start.y, control.y, end.y, t);
      const next = {
        x,
        y,
        rotation: Math.atan2(dy, dx) * (180 / Math.PI),
        scale: 1 + Math.sin(Math.PI * rawT) * 0.28
      };
      positionRef.current = next;
      setFlightPosition(next);

      if (rawT < 1) {
        frame = window.requestAnimationFrame(animate);
      } else {
        const landed = { ...end, rotation: next.rotation, scale: 1 };
        positionRef.current = landed;
        setFlightPosition(landed);
      }
    };

    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [activePoint, showClicky, status, target]);

  return (
    <section className={`floating-overlay floating-${status} ${showBubble ? "has-bubble" : "buddy-only"}`} aria-label="Clicky floating overlay" style={style}>
      {showClicky ? (
        <div
          className={`floating-buddy clicky-${status} ${readyListening ? "ready-listening" : ""}`}
          style={
            {
              "--clicky-x": `${flightPosition.x}px`,
              "--clicky-y": `${flightPosition.y}px`,
              "--clicky-rotation": `${flightPosition.rotation}deg`,
              "--clicky-scale": flightPosition.scale
            } as CSSProperties
          }
        >
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
        <div className="floating-bubble" aria-live="polite">
          <p>{text}</p>
        </div>
      ) : null}
    </section>
  );
}

function pointToOverlayPosition(point: PointTarget | undefined, monitor: NativeCursorContext | undefined, cursor: NativeCursorContext | undefined): { x: number; y: number } {
  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 720 : window.innerHeight;
  const width = Math.max(1, monitor?.monitorWidth ?? viewportWidth);
  const height = Math.max(1, monitor?.monitorHeight ?? viewportHeight);
  const padding = 28;

  if (point) {
    const screenshotWidth = Math.min(width, 1280);
    const scale = width / screenshotWidth;
    return {
      x: clamp(point.x * scale + 26, padding, width - padding),
      y: clamp(point.y * scale + 22, padding, height - padding)
    };
  }

  if (cursor) {
    return {
      x: clamp(cursor.x - cursor.monitorX + 28, padding, width - padding),
      y: clamp(cursor.y - cursor.monitorY + 28, padding, height - padding)
    };
  }

  return { x: 42, y: 42 };
}

function quadratic(start: number, control: number, end: number, t: number): number {
  return (1 - t) * (1 - t) * start + 2 * (1 - t) * t * control + t * t * end;
}

function quadraticDerivative(start: number, control: number, end: number, t: number): number {
  return 2 * (1 - t) * (control - start) + 2 * t * (end - control);
}

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
