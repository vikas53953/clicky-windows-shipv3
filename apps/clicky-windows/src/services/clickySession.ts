import { parsePointTags, type PointTarget } from "./pointTags";
import { parseDesktopToolBlocks, type DesktopToolCall } from "./desktopTools";
import { parseWorkflowPlanBlocks, type ClickyWorkflowPlan } from "./workflowPlan";

export type ClickyStatus =
  | "idle"
  | "listening"
  | "transcribing"
  | "capturing_screen"
  | "thinking"
  | "speaking"
  | "pointing"
  | "error";

export interface ClickySession {
  status: ClickyStatus;
  transcript: string;
  rawResponse: string;
  visibleResponse: string;
  points: PointTarget[];
  workflowPlan: ClickyWorkflowPlan | null;
  desktopToolCalls: DesktopToolCall[];
  errorMessage: string | null;
}

export type ClickySessionEvent =
  | { type: "pressToTalkStarted" }
  | { type: "pressToTalkEnded"; transcript: string }
  | { type: "transcriptReady" }
  | { type: "screenCaptured" }
  | { type: "assistantChunk"; chunk: string }
  | { type: "speechFinished" }
  | { type: "pointingFinished" }
  | { type: "clearConversation" }
  | { type: "failed"; message: string };

export function createInitialSession(): ClickySession {
  return {
    status: "idle",
    transcript: "",
    rawResponse: "",
    visibleResponse: "",
    points: [],
    workflowPlan: null,
    desktopToolCalls: [],
    errorMessage: null
  };
}

export function reduceClickySession(session: ClickySession, event: ClickySessionEvent): ClickySession {
  switch (event.type) {
    case "pressToTalkStarted":
      return {
        ...session,
        status: "listening",
        transcript: "",
        rawResponse: "",
        visibleResponse: "",
        points: [],
        workflowPlan: null,
        desktopToolCalls: [],
        errorMessage: null
      };
    case "pressToTalkEnded":
      return {
        ...session,
        status: "transcribing",
        transcript: event.transcript.trim() || "Help me with what is on my screen."
      };
    case "transcriptReady":
      return { ...session, status: "capturing_screen" };
    case "screenCaptured":
      return { ...session, status: "thinking" };
    case "assistantChunk": {
      const rawResponse = `${session.rawResponse}${event.chunk}`;
      const pointParsed = parsePointTags(rawResponse);
      const toolsParsed = parseDesktopToolBlocks(pointParsed.cleanText);
      const planParsed = parseWorkflowPlanBlocks(toolsParsed.cleanText);
      return {
        ...session,
        status: "speaking",
        rawResponse,
        visibleResponse: planParsed.cleanText,
        points: pointParsed.points,
        desktopToolCalls: toolsParsed.toolCalls,
        workflowPlan: planParsed.plan ?? session.workflowPlan
      };
    }
    case "speechFinished":
      return { ...session, status: session.points.length > 0 ? "pointing" : "idle" };
    case "pointingFinished":
      return { ...session, status: "idle" };
    case "clearConversation":
      return createInitialSession();
    case "failed":
      return {
        ...session,
        status: "error",
        errorMessage: event.message,
        rawResponse: "",
        visibleResponse: "",
        desktopToolCalls: [],
        workflowPlan: null
      };
    default:
      return session;
  }
}

export function statusLabel(status: ClickyStatus): string {
  const labels: Record<ClickyStatus, string> = {
    idle: "Ready to listen",
    listening: "Listening",
    transcribing: "Transcribing",
    capturing_screen: "Capturing screen",
    thinking: "Thinking",
    speaking: "Speaking",
    pointing: "Pointing",
    error: "Needs attention"
  };

  return labels[status];
}
