import type { CSSProperties } from "react";
import type { ClickyAvatar } from "../services/workerClient";

interface ClickyMarkProps {
  avatar?: ClickyAvatar;
  accentColor?: string;
  size?: "small" | "preview" | "panel";
}

export function ClickyMark({ avatar = "classic", accentColor = "#3b82f6", size = "small" }: ClickyMarkProps) {
  const style = { "--clicky-accent": accentColor } as CSSProperties;

  if (avatar === "dot") {
    return (
      <span className={`clicky-mark clicky-mark-dot clicky-mark-${size}`} style={style} aria-hidden="true">
        <span />
      </span>
    );
  }

  if (avatar === "spark") {
    return (
      <span className={`clicky-mark clicky-mark-spark clicky-mark-${size}`} style={style} aria-hidden="true">
        <svg viewBox="0 0 24 24" role="presentation">
          <path d="M12 1.5L15.2 8.7L22.5 12L15.2 15.3L12 22.5L8.8 15.3L1.5 12L8.8 8.7L12 1.5Z" />
        </svg>
      </span>
    );
  }

  if (avatar === "orb") {
    return (
      <span className={`clicky-mark clicky-mark-orb clicky-mark-${size}`} style={style} aria-hidden="true">
        <span />
      </span>
    );
  }

  if (avatar === "comet") {
    return (
      <span className={`clicky-mark clicky-mark-comet clicky-mark-${size}`} style={style} aria-hidden="true">
        <span />
      </span>
    );
  }

  return (
    <span className={`clicky-mark clicky-mark-classic clicky-mark-${size}`} style={style} aria-hidden="true">
      <svg viewBox="0 0 12 14" role="presentation">
        <path d="M1 1L11 7L1 13V1Z" />
      </svg>
    </span>
  );
}
