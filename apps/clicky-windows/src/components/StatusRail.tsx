import { Activity, CircleAlert, CircleCheck, Mic, MousePointer2, Volume2 } from "lucide-react";
import type { ClickySession } from "../services/clickySession";
import { statusLabel } from "../services/clickySession";

interface StatusRailProps {
  session: ClickySession;
  workerStatus: string;
  nativeStatus: {
    runtime: string;
    cursor: string;
    overlay: string;
    shortcut: string;
    microphone: string;
  };
}

const statusIcon = {
  idle: CircleCheck,
  listening: Mic,
  transcribing: Activity,
  capturing_screen: Activity,
  thinking: Activity,
  speaking: Volume2,
  pointing: MousePointer2,
  error: CircleAlert
};

export function StatusRail({ session, workerStatus, nativeStatus }: StatusRailProps) {
  const Icon = statusIcon[session.status];

  return (
    <aside className="status-rail" aria-label="Clicky status">
      <div className={`status-pill status-pill-${session.status}`}>
        <Icon size={18} aria-hidden="true" />
        <span>{statusLabel(session.status)}</span>
      </div>
      <div className="status-block">
        <span className="status-label">Worker</span>
        <strong>{workerStatus}</strong>
      </div>
      <div className="status-block">
        <span className="status-label">Native</span>
        <p>{nativeStatus.runtime}</p>
      </div>
      <div className="status-block">
        <span className="status-label">Cursor</span>
        <p>{nativeStatus.cursor}</p>
      </div>
      <div className="status-block">
        <span className="status-label">Overlay</span>
        <p>{nativeStatus.overlay}</p>
      </div>
      <div className="status-block">
        <span className="status-label">Transcript</span>
        <p>{session.transcript || "Ready for Talk or Ctrl+Alt+Space"}</p>
      </div>
      <div className="status-block">
        <span className="status-label">Response</span>
        <p>{session.visibleResponse || "Clicky will stream guidance here."}</p>
      </div>
      {session.workflowPlan ? (
        <div className="status-block workflow-block">
          <span className="status-label">Plan</span>
          <strong>{session.workflowPlan.goal}</strong>
          <ol>
            {session.workflowPlan.steps.map((step, index) => (
              <li key={`${step.type}-${step.label}-${index}`}>
                <span>{step.label}</span>
                <small>{step.hint}</small>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {session.desktopToolCalls.length ? (
        <div className="status-block">
          <span className="status-label">Tools</span>
          <p>{session.desktopToolCalls.map((tool) => tool.name).join(", ")}</p>
        </div>
      ) : null}
      <div className="status-block">
        <span className="status-label">Shortcut / Mic</span>
        <p>
          {nativeStatus.shortcut}
          <br />
          {nativeStatus.microphone}
        </p>
      </div>
      {session.errorMessage ? (
        <div className="status-block status-error">
          <span className="status-label">Error</span>
          <p>{session.errorMessage}</p>
        </div>
      ) : null}
    </aside>
  );
}
