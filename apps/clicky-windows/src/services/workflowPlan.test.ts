import { describe, expect, it } from "vitest";
import { parseWorkflowPlanBlocks } from "./workflowPlan";

describe("parseWorkflowPlanBlocks", () => {
  it("extracts a hidden plan and removes it from visible text", () => {
    const parsed = parseWorkflowPlanBlocks(
      'Start with the File menu. <CLICKY_PLAN>{"goal":"Export a video","app":"Blender","steps":[{"type":"click","label":"File","hint":"Open the File menu"},{"type":"click","label":"Export","hint":"Choose Export"}]}</CLICKY_PLAN>'
    );

    expect(parsed.cleanText).toBe("Start with the File menu.");
    expect(parsed.plan?.goal).toBe("Export a video");
    expect(parsed.plan?.steps).toEqual([
      { type: "click", label: "File", hint: "Open the File menu", targetContext: "visibleElement" },
      { type: "click", label: "Export", hint: "Choose Export", targetContext: "visibleElement" }
    ]);
  });

  it("hides incomplete streaming plan blocks until they finish", () => {
    const parsed = parseWorkflowPlanBlocks('I can walk you through this. <CLICKY_PLAN>{"goal":"Save"');

    expect(parsed.cleanText).toBe("I can walk you through this.");
    expect(parsed.plan).toBeNull();
  });

  it("ignores malformed plans without leaking the raw block", () => {
    const parsed = parseWorkflowPlanBlocks("Try this. <CLICKY_PLAN>{bad json}</CLICKY_PLAN>");

    expect(parsed.cleanText).toBe("Try this.");
    expect(parsed.plan).toBeNull();
  });
});
