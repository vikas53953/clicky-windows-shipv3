import { describe, expect, it } from "vitest";
import { createInitialSession, reduceClickySession } from "./clickySession";

describe("Clicky session state machine", () => {
  it("walks through the mock push-to-talk flow and hides point tags", () => {
    let session = createInitialSession();
    expect(session.status).toBe("idle");

    session = reduceClickySession(session, { type: "pressToTalkStarted" });
    expect(session.status).toBe("listening");

    session = reduceClickySession(session, { type: "pressToTalkEnded", transcript: "Where do I click?" });
    expect(session.status).toBe("transcribing");
    expect(session.transcript).toBe("Where do I click?");

    session = reduceClickySession(session, { type: "transcriptReady" });
    expect(session.status).toBe("capturing_screen");

    session = reduceClickySession(session, { type: "screenCaptured" });
    expect(session.status).toBe("thinking");

    session = reduceClickySession(session, {
      type: "assistantChunk",
      chunk: "Click the Test Worker button. [POINT:930,318:Test Worker:screen0]"
    });
    expect(session.status).toBe("speaking");
    expect(session.visibleResponse).toBe("Click the Test Worker button.");
    expect(session.points).toEqual([{ x: 930, y: 318, label: "Test Worker", screen: 0 }]);

    session = reduceClickySession(session, { type: "speechFinished" });
    expect(session.status).toBe("pointing");

    session = reduceClickySession(session, { type: "pointingFinished" });
    expect(session.status).toBe("idle");
  });

  it("stores hidden workflow plans without showing plan JSON to the user", () => {
    const session = reduceClickySession(createInitialSession(), {
      type: "assistantChunk",
      chunk:
        'Clicky can guide this step by step. <CLICKY_PLAN>{"goal":"Save a file","app":"Notepad","steps":[{"type":"click","label":"File","hint":"Open File"},{"type":"keyboardShortcut","label":"Ctrl+S","hint":"Save the file","targetContext":"focusedElement"}]}</CLICKY_PLAN>'
    });

    expect(session.visibleResponse).toBe("Clicky can guide this step by step.");
    expect(session.workflowPlan?.goal).toBe("Save a file");
    expect(session.workflowPlan?.steps).toHaveLength(2);
    expect(session.workflowPlan?.steps[1]).toEqual({
      type: "keyboardShortcut",
      label: "Ctrl+S",
      hint: "Save the file",
      targetContext: "focusedElement"
    });
  });

  it("stores hidden desktop tool calls without showing tool JSON to the user", () => {
    const session = reduceClickySession(createInitialSession(), {
      type: "assistantChunk",
      chunk:
        'Opening that page. <CLICKY_TOOL>{"name":"open_url","args":{"url":"https://example.com"}}</CLICKY_TOOL>'
    });

    expect(session.visibleResponse).toBe("Opening that page.");
    expect(session.desktopToolCalls).toEqual([{ name: "open_url", args: { url: "https://example.com" } }]);
  });

  it("drops unsupported desktop action tool calls", () => {
    const session = reduceClickySession(createInitialSession(), {
      type: "assistantChunk",
      chunk: 'I will guide you instead. <CLICKY_TOOL>{"name":"click_at","args":{"x":10,"y":20}}</CLICKY_TOOL>'
    });

    expect(session.visibleResponse).toBe("I will guide you instead.");
    expect(session.desktopToolCalls).toEqual([]);
  });

  it("moves to error state with a safe message", () => {
    const session = reduceClickySession(createInitialSession(), {
      type: "failed",
      message: "Worker unavailable"
    });

    expect(session.status).toBe("error");
    expect(session.errorMessage).toBe("Worker unavailable");
  });
});
