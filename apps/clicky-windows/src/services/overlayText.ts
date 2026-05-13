import type { ClickySession } from "./clickySession";

export function overlayTextForSession(session: ClickySession): string {
  if (session.status === "listening") return "Listening...";
  if (session.status === "transcribing") return "Turning speech into text...";
  if (session.status === "capturing_screen") return "Capturing fresh screen context...";
  if (session.status === "thinking") return "Asking the Worker...";
  if (session.status === "error") return session.errorMessage ?? "Something needs attention.";
  if (session.visibleResponse) return session.visibleResponse;
  return "Ready. Press Talk or Ctrl+Alt+Space.";
}
