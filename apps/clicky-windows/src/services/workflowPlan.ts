export type ClickyWorkflowStepType = "observe" | "click" | "keyboardShortcut" | "pressKey" | "type" | "scroll" | "openApp" | "openUrl" | "setValue";

export interface ClickyWorkflowStep {
  type: ClickyWorkflowStepType;
  label: string;
  hint: string;
  targetContext: "visibleElement" | "currentHighlight" | "currentSelection" | "focusedElement";
}

export interface ClickyWorkflowPlan {
  goal: string;
  app: string;
  mode: "teaching";
  steps: ClickyWorkflowStep[];
}

export interface ParsedWorkflowPlan {
  cleanText: string;
  plan: ClickyWorkflowPlan | null;
}

const completePlanPattern = /<CLICKY_PLAN>([\s\S]*?)<\/CLICKY_PLAN>/gi;
const incompletePlanPattern = /<CLICKY_PLAN>[\s\S]*$/i;
const validTypes = new Set<ClickyWorkflowStepType>(["observe", "click", "keyboardShortcut", "pressKey", "type", "scroll", "openApp", "openUrl", "setValue"]);
const validContexts = new Set<ClickyWorkflowStep["targetContext"]>(["visibleElement", "currentHighlight", "currentSelection", "focusedElement"]);

export function parseWorkflowPlanBlocks(text: string): ParsedWorkflowPlan {
  let latestPlan: ClickyWorkflowPlan | null = null;
  const withoutCompletePlans = text.replace(completePlanPattern, (_match, rawJson) => {
    const parsed = parsePlanJson(String(rawJson));
    if (parsed) latestPlan = parsed;
    return "";
  });

  return {
    cleanText: normalizeWhitespace(withoutCompletePlans.replace(incompletePlanPattern, "")),
    plan: latestPlan
  };
}

function parsePlanJson(rawJson: string): ClickyWorkflowPlan | null {
  try {
    const value = JSON.parse(rawJson.trim()) as Partial<ClickyWorkflowPlan>;
    if (!value || typeof value !== "object") return null;

    const steps = Array.isArray(value.steps) ? value.steps.map(normalizeStep).filter((step): step is ClickyWorkflowStep => Boolean(step)).slice(0, 8) : [];
    if (!steps.length) return null;

    return {
      goal: stringOrDefault(value.goal, "Guide the user through the task."),
      app: stringOrDefault(value.app, "Current app"),
      mode: "teaching",
      steps
    };
  } catch {
    return null;
  }
}

function normalizeStep(rawStep: unknown): ClickyWorkflowStep | null {
  if (!rawStep || typeof rawStep !== "object") return null;
  const candidate = rawStep as Partial<ClickyWorkflowStep>;
  const type = validTypes.has(candidate.type as ClickyWorkflowStepType) ? (candidate.type as ClickyWorkflowStepType) : null;
  if (!type) return null;

  return {
    type,
    label: stringOrDefault(candidate.label, type),
    hint: stringOrDefault(candidate.hint, candidate.label || type),
    targetContext: validContexts.has(candidate.targetContext as ClickyWorkflowStep["targetContext"])
      ? (candidate.targetContext as ClickyWorkflowStep["targetContext"])
      : "visibleElement"
  };
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
